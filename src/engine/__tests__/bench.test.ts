// Hard's cost per decision at the server settings (bot plan Phase 0).
// Opt-in: BENCH=1 npx vitest run bench. Playouts are the machine-independent measure; ms is
// for information (Workers CPUs differ from dev machines).
import { describe, expect, it } from 'vitest';
import { decide, intentToAction, type BotOptions } from '../bots';
import type { WorkStats } from '../bots/mc';
import { apply, newMatch } from '../reducer';
import { rngFrom } from '../rng';
import { DEFAULT_CONFIG, type Seat } from '../types';
import { viewFor } from '../view';
import * as legacy from './legacy/index';
import { env } from './selfplay';

/** SERVER_BOT in src/server/room.ts (the legacy bots ran at 60 samples). */
const SERVER = { samples: 150, bidSamples: 100 };
const LEGACY_SERVER = { samples: 60, bidSamples: 100 };
type Kind = 'bid' | 'trump' | 'play';

/** Plays `games` matches with Hard in every seat; per decision kind: ms samples and total playouts. */
export function benchHard(games: number, useLegacy = false, opts: Partial<BotOptions> = {}) {
  const ms: Record<Kind, number[]> = { bid: [], trump: [], play: [] };
  const work: Record<Kind, number> = { bid: 0, trump: 0, play: 0 };
  let rounds = 0;
  for (let g = 0; g < games; g++) {
    const rng = rngFrom(`bench${g}`);
    let s = newMatch(DEFAULT_CONFIG, `bench${g}`, (g % 4) as Seat);
    while (s.phase !== 'MATCH_END') {
      if (s.phase === 'ROUND_EVAL') { s = apply(s, { type: 'NEXT_ROUND' }).state; rounds++; continue; }
      const seat = s.round!.turn!;
      const v = viewFor(s, seat);
      const kind: Kind = s.phase === 'BIDDING' ? 'bid' : s.phase === 'TRUMP_SELECTION' ? 'trump' : 'play';
      const stats: WorkStats = { playouts: 0, steps: 0 };
      const t = performance.now();
      const intent = useLegacy
        ? legacy.decide(v, 'hard', { rng, ...LEGACY_SERVER })
        : decide(v, 'hard', { rng, ...SERVER, ...opts, stats });
      if (!(kind === 'play' && v.legal.length === 1)) ms[kind].push(performance.now() - t);
      work[kind] += stats.playouts;
      s = apply(s, intentToAction(intent!, seat)).state;
    }
    rounds++;
  }
  return { ms, work, rounds };
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe.skipIf(!env.BENCH)('Hard bench', () => {
  it('reports ms and playouts per decision at server settings', () => {
    const games = Number(env.BENCH_N ?? 6);
    const lines: string[] = [];
    let totals: number[] = [];
    for (const useLegacy of [true, false]) {
      const r = benchHard(games, useLegacy);
      const name = useLegacy ? 'legacy' : 'current';
      let total = 0;
      for (const k of ['bid', 'trump', 'play'] as Kind[]) {
        total += r.ms[k].reduce((a, b) => a + b, 0);
        lines.push(`${name.padEnd(7)} ${k.padEnd(5)} n ${String(r.ms[k].length).padStart(5)} mean ${mean(r.ms[k]).toFixed(2)} ms p50 ${pct(r.ms[k], 0.5).toFixed(2)} p95 ${pct(r.ms[k], 0.95).toFixed(2)} max ${pct(r.ms[k], 1).toFixed(2)}${useLegacy ? '' : ` playouts/decision ${(r.work[k] / Math.max(1, r.ms[k].length)).toFixed(0)}`}`);
      }
      lines.push(`${name.padEnd(7)} CPU per round (4 Hard seats) ${(total / r.rounds).toFixed(0)} ms`);
      totals.push(total / r.rounds);
    }
    (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(`\nBENCH (${games} matches)\n${lines.join('\n')}\n`);
    expect(totals[1]!).toBeLessThan(totals[0]!);
  }, 1_800_000);
});
