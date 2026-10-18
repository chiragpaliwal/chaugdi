// Free-tier cost budgets (Cloudflare Workers Free: 100k Durable Object requests and 100k
// rows written a day). Plays whole short matches through `Room` with a model of the
// GameRoom shell: a write only when the state changed, the alarm planned like `arm()`, and
// early alarms that fire, find nothing and re-arm. Humans take `THINK_MS` a move.

import { describe, expect, it } from 'vitest';
import { SEATS, type Seat } from '../engine/types';
import type { BotLevel } from '../engine/bots';
import type { PlayerView } from '../engine/types';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { planAlarm, wakeAt } from './alarm';
import { newRoomState, Room, type Effects } from './room';

const THINK_MS = 3000;

interface Cost { minutes: number; rounds: number; messages: number; alarms: number; requests: number; rowsWritten: number }

function playMatch(humans: string[], botLevel: BotLevel): Cost {
  let now = 1_700_000_000_000;
  let n = 0;
  const room = new Room(newRoomState('K7QXM', humans[0]!, now), { now: () => now, randomSeed: () => `${++n}`.padStart(32, 'a') });
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
        move = m.phase === 'BIDDING' ? { type: 'pass' }
          : m.phase === 'TRUMP_SELECTION' ? { type: 'chooseTrump', suit: 'S' }
          : m.phase === 'TRICK_LOOP' ? { type: 'play', card: v.legal[0]! } : null;
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

describe('free-tier cost per short match', () => {
  const rows: string[] = [];
  const cases: [string, string[], BotLevel, { requests: number; rowsWritten: number }][] = [
    // Budgets: what the match cost when measured (2026-10-18) plus ~15%. Raising one is a
    // decision: rows written cap the free tier at ~100k / budget matches a day.
    ['1 human, 3 medium bots', ['a'], 'medium', { requests: 80, rowsWritten: 300 }],
    ['2 humans, 2 medium bots', ['a', 'b'], 'medium', { requests: 160, rowsWritten: 700 }],
    ['4 humans', ['a', 'b', 'c', 'd'], 'medium', { requests: 95, rowsWritten: 450 }],
    ['2 humans, 2 hard bots', ['a', 'b'], 'hard', { requests: 220, rowsWritten: 720 }],
  ];
  for (const [name, humans, level, budget] of cases) {
    it(`${name}: within budget`, () => {
      const c = playMatch(humans, level);
      rows.push(`${name.padEnd(24)} ${c.minutes.toFixed(1).padStart(5)} min ${String(c.rounds).padStart(3)} rounds | ${String(c.messages).padStart(4)} msgs ${String(c.alarms).padStart(4)} alarms → ${String(c.requests).padStart(4)} requests | ${String(c.rowsWritten).padStart(4)} rows written | ~${Math.floor(100_000 / Math.max(c.requests, c.rowsWritten))} matches/day`);
      expect(c.requests).toBeLessThanOrEqual(budget.requests);
      expect(c.rowsWritten).toBeLessThanOrEqual(budget.rowsWritten);
    }, 60_000);
  }
  it('report', () => { console.log(`\n${rows.join('\n')}`); });
});
