// Free-tier cost budgets (Cloudflare Workers Free: 100k Durable Object requests and 100k
// rows written a day). Plays whole short matches through `Room` with a model of the
// GameRoom shell: a write only when the state changed, the alarm planned like `arm()`, and
// early alarms that fire, find nothing and re-arm. Humans take `THINK_MS` a move.

import { describe, expect, it } from 'vitest';
import { SEATS, type Seat } from '../engine/types';
import { decide, type BotLevel } from '../engine/bots';
import { rngFrom } from '../engine/rng';
import type { PlayerView } from '../engine/types';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { planAlarm, wakeAt } from './alarm';
import { newRoomState, Room, type Effects } from './room';

const THINK_MS = 3000;

interface Cost { minutes: number; rounds: number; messages: number; alarms: number; requests: number; rowsWritten: number }

/** One match; `salt` varies the room's seeds (and so the cards). */
function playMatch(humans: string[], botLevel: BotLevel, salt = ''): Cost {
  let now = 1_700_000_000_000;
  let n = 0;
  const room = new Room(newRoomState('K7QXM', humans[0]!, now), { now: () => now, randomSeed: () => `${salt}${++n}`.padStart(32, 'a') });
  const c = { messages: 0, alarms: 0, rows: 0 };
  let saved = '';
  let armed: number | null = null;
  const views = new Map<string, PlayerView>();

  /** What the GameRoom does after every entry point: persist if changed, then arm. */
  const take = (fx: Effects) => {
    const json = JSON.stringify(room.state);
    if (json !== saved) { c.rows++; saved = json; }
    const plan = planAlarm(armed, wakeAt(room.nextAlarm(), room.inMatch(), now), now);
    if (plan !== 'keep' && plan !== 'none') { c.rows++; armed = plan.set; }
    for (const o of fx.out) {
      const m = o.msg as ServerMessage;
      if ((m.type === 'update' || m.type === 'sync') && m.view) views.set(o.to, m.view);
    }
  };
  const send = (p: string, m: ClientMessage) => { c.messages++; take(room.message(p, m)); };

  for (const p of humans) take(room.connect(p, p));
  for (const s of SEATS.slice(humans.length)) send(humans[0]!, { type: 'fillBot', seat: s as Seat });
  send(humans[0]!, { type: 'hostSettings', botLevel });
  for (const p of humans.slice(1)) send(p, { type: 'setReady', ready: true });
  send(humans[0]!, { type: 'start' });
  const start = now;

  /** When each human will act on the move they currently owe. */
  const due = new Map<string, number>();
  for (let i = 0; i < 50_000 && room.state.match?.phase !== 'MATCH_END'; i++) {
    const m = room.state.match;
    let next: { at: number; p: string; move: ClientMessage } | null = null;
    for (const p of humans) {
      const seat = SEATS.find((s) => room.state.seats[s]?.playerId === p)!;
      const v = views.get(p);
      let move: ClientMessage | null = null;
      if (m?.phase === 'ROUND_EVAL') { if (!room.state.continued.includes(p)) move = { type: 'continue' }; }
      else if (m?.round?.turn === seat && v?.turn === seat) {
        // Humans decide like a Medium bot: sensible bids (the opener's compulsory 7 included), Hukum and play.
        move = decide(v, 'medium', { rng: rngFrom(`${m.seed}:${p}:${v.seq}`) });
      }
      if (!move) { due.delete(p); continue; }
      // A human acts after the update's start offset and animations, plus thinking time.
      if (!due.has(p)) due.set(p, Math.max(now, (v?.turnDeadline ?? now + 20_000) - 20_000) + THINK_MS);
      const at = due.get(p)!;
      if (!next || at < next.at) next = { at, p, move };
    }
    if (next && (armed === null || next.at < armed)) {
      now = Math.max(now, next.at);
      due.delete(next.p);
      send(next.p, next.move);
      continue;
    }
    if (armed === null) throw new Error(`stalled in ${m?.phase}`);
    now = Math.max(now, armed);
    armed = null;
    c.alarms++;
    take(room.alarm());
  }
  expect(room.state.match?.phase).toBe('MATCH_END');
  const requests = c.alarms + humans.length + c.messages / 20;
  return {
    minutes: (now - start) / 60_000, rounds: room.state.match!.history.length,
    messages: c.messages, alarms: c.alarms, requests: Math.round(requests), rowsWritten: c.rows,
  };
}

describe('free-tier cost per round', () => {
  const rows: string[] = [];
  /** Matches per case. Match length swings a lot with the cards, so budgets are per round. */
  const SEEDS = 4;
  const cases: [string, string[], BotLevel, { requests: number; rowsWritten: number }][] = [
    // Budgets: cost per round averaged over 12 seeded matches, measured 2026-10-18 (humans
    // deciding like Medium), plus ~15%. Raising one is a decision: rows written cap the free
    // tier at ~100k / (budget × rounds per match) matches a day. Hard bots batch their runs
    // since 2026-10-18, which took them from 26–37 requests and 88–99 rows a round to the
    // Medium level.
    ['1 human, 3 medium bots', ['a'], 'medium', { requests: 14.5, rowsWritten: 56 }],
    ['2 humans, 2 medium bots', ['a', 'b'], 'medium', { requests: 16.2, rowsWritten: 74 }],
    ['4 humans', ['a', 'b', 'c', 'd'], 'medium', { requests: 15.1, rowsWritten: 73 }],
    ['2 humans, 2 hard bots', ['a', 'b'], 'hard', { requests: 15.9, rowsWritten: 73 }],
    ['1 human, 3 hard bots', ['a'], 'hard', { requests: 14.5, rowsWritten: 56 }],
  ];
  for (const [name, humans, level, budget] of cases) {
    it(`${name}: within budget`, () => {
      let rounds = 0, minutes = 0, messages = 0, alarms = 0, requests = 0, rowsWritten = 0;
      for (let i = 0; i < SEEDS; i++) {
        const c = playMatch(humans, level, `s${i}`);
        rounds += c.rounds; minutes += c.minutes; messages += c.messages; alarms += c.alarms; requests += c.requests; rowsWritten += c.rowsWritten;
      }
      const perRound = { requests: requests / rounds, rowsWritten: rowsWritten / rounds };
      rows.push(`${name.padEnd(24)} ${(minutes / SEEDS).toFixed(1).padStart(5)} min ${(rounds / SEEDS).toFixed(1).padStart(5)} rounds/match | per round: ${(messages / rounds).toFixed(1).padStart(5)} msgs ${(alarms / rounds).toFixed(1).padStart(5)} alarms → ${perRound.requests.toFixed(1).padStart(5)} requests | ${perRound.rowsWritten.toFixed(1).padStart(5)} rows written | ~${Math.floor(100_000 / Math.max(perRound.requests, perRound.rowsWritten))} rounds/day`);
      expect(perRound.requests).toBeLessThanOrEqual(budget.requests);
      expect(perRound.rowsWritten).toBeLessThanOrEqual(budget.rowsWritten);
    }, 300_000);
  }
  it('report', () => { console.log(`\n${rows.join('\n')}`); });
});
