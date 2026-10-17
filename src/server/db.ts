// D1 access (GDD §10.7). The GameRoom writes history through `applyDbOps`; the REST API
// reads and writes players and rooms.

import type { DbOp } from './room';

/** Room writes, in order. History is best effort: a failed write never blocks the table. */
export async function applyDbOps(db: D1Database, ops: readonly DbOp[]): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const o of ops) {
    switch (o.op) {
      case 'roomStatus':
        stmts.push(db.prepare('UPDATE rooms SET status = ?1 WHERE code = ?2').bind(o.status, o.code));
        break;
      case 'matchStart':
        stmts.push(db.prepare('INSERT INTO matches (id, room_code, seed, started_at) VALUES (?1, ?2, ?3, ?4)').bind(o.id, o.code, o.seed, o.at));
        for (const p of o.players) {
          // A guest row normally exists already; this keeps the foreign key whole if it does not.
          if (p.playerId) stmts.push(db.prepare('INSERT OR IGNORE INTO players (id, nickname, created_at, last_seen) VALUES (?1, ?2, ?3, ?3)').bind(p.playerId, p.name, o.at));
          stmts.push(db.prepare('INSERT INTO match_players (match_id, seat, player_id, is_bot, team) VALUES (?1, ?2, ?3, ?4, ?5)')
            .bind(o.id, p.seat, p.playerId, p.isBot ? 1 : 0, p.team));
        }
        break;
      case 'round': {
        const r = o.result;
        stmts.push(db.prepare(
          `INSERT INTO rounds (match_id, round_no, dealer, bidder, bid, forced, trump, tricks_bidding_team, tricks_played, outcome, delta, ledger_after)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        ).bind(o.matchId, r.roundNo, r.dealer, r.contract.seat, r.contract.bid, r.contract.forced ? 1 : 0, r.trump,
          r.tricksWon[r.contract.team], r.tricksPlayed, r.outcome, r.delta, r.ledgerAfter));
        break;
      }
      case 'matchEnd':
        stmts.push(db.prepare('UPDATE matches SET ended_at = ?1, winner_team = ?2, win_reason = ?3, final_ledger = ?4 WHERE id = ?5')
          .bind(o.at, o.winner, o.reason, o.ledger, o.id));
        break;
    }
  }
  if (stmts.length) await db.batch(stmts);
}

export async function createPlayer(db: D1Database, id: string, nickname: string, now: number) {
  await db.prepare('INSERT INTO players (id, nickname, created_at, last_seen) VALUES (?1, ?2, ?3, ?3)').bind(id, nickname, now).run();
}

/** Renames (and touches) the player; creates the row if D1 lost it. */
export async function renamePlayer(db: D1Database, id: string, nickname: string, now: number) {
  await db.prepare(
    `INSERT INTO players (id, nickname, created_at, last_seen) VALUES (?1, ?2, ?3, ?3)
     ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname, last_seen = excluded.last_seen`,
  ).bind(id, nickname, now).run();
}

/** False when the code is already taken. */
export async function insertRoom(db: D1Database, code: string, hostId: string, now: number): Promise<boolean> {
  await db.prepare('INSERT OR IGNORE INTO players (id, nickname, created_at, last_seen) VALUES (?1, ?2, ?3, ?3)').bind(hostId, 'Player', now).run();
  const r = await db.prepare('INSERT OR IGNORE INTO rooms (code, host_id, status, created_at) VALUES (?1, ?2, ?3, ?4)').bind(code, hostId, 'open', now).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function roomStatus(db: D1Database, code: string): Promise<'open' | 'playing' | 'closed' | null> {
  const row = await db.prepare('SELECT status FROM rooms WHERE code = ?1').bind(code).first<{ status: 'open' | 'playing' | 'closed' }>();
  return row?.status ?? null;
}

export interface HistoryRow {
  id: string; roomCode: string; startedAt: number; endedAt: number | null;
  seat: number; team: 'A' | 'B'; winnerTeam: 'A' | 'B' | null; winReason: string | null; finalLedger: number | null;
  /** The seed is shown only once the match is over (GDD §8.2). */
  seed: string | null;
}

export async function history(db: D1Database, playerId: string, limit: number): Promise<HistoryRow[]> {
  const { results } = await db.prepare(
    `SELECT m.id, m.room_code AS roomCode, m.started_at AS startedAt, m.ended_at AS endedAt, mp.seat, mp.team,
            m.winner_team AS winnerTeam, m.win_reason AS winReason, m.final_ledger AS finalLedger,
            CASE WHEN m.ended_at IS NULL THEN NULL ELSE m.seed END AS seed
     FROM match_players mp JOIN matches m ON m.id = mp.match_id
     WHERE mp.player_id = ?1 ORDER BY m.started_at DESC LIMIT ?2`,
  ).bind(playerId, limit).all<HistoryRow>();
  return results;
}
