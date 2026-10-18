// Bot self-play harness shared by the TV-17 test and scripts/selfplay.

import { decide, intentToAction, type BotLevel, type BotOptions, type Intent } from '../bots';
import { apply, newMatch } from '../reducer';
import { rngFrom } from '../rng';
import { DEFAULT_CONFIG, teamOf, type MatchState, type PlayerView, type Seat } from '../types';
import { assertInvariants, viewFor } from '../view';

export interface SelfPlayResult { state: MatchState; rounds: number; actions: number }

/** One full match. `levels[seat]` picks each seat's bot. */
export function selfPlay(seed: string, levels: Record<Seat, BotLevel>, opts: { check?: boolean; hardSamples?: number } = {}): SelfPlayResult {
  const rng = rngFrom(`bots:${seed}`);
  let s = newMatch(DEFAULT_CONFIG, seed, Math.floor(rng() * 4) as Seat);
  let actions = 0;
  while (s.phase !== 'MATCH_END') {
    if (s.phase === 'ROUND_EVAL') {
      s = apply(s, { type: 'NEXT_ROUND' }).state;
    } else {
      const seat = s.round!.turn!;
      const intent = decide(viewFor(s, seat), levels[seat], { rng, samples: opts.hardSamples ?? 20, bidSamples: 100 });
      if (!intent) throw new Error(`no move for seat ${seat} in ${s.phase}`);
      s = apply(s, intentToAction(intent, seat)).state;
    }
    if (opts.check) assertInvariants(s);
    if (++actions > 50_000) throw new Error(`match ${seed} did not terminate`);
  }
  return { state: s, rounds: s.history.length, actions };
}

/** Win rate of team A over `n` matches. */
export function teamAWinRate(n: number, levels: Record<Seat, BotLevel>, prefix = 'wr') {
  let a = 0;
  for (let i = 0; i < n; i++) if (selfPlay(`${prefix}${i}`, levels).state.winner === teamOf(0)) a++;
  return a / n;
}

/** Test-only env access without pulling Node types into the app build. */
export const env: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

// ---------------------------------------------------------------- duplicate rounds

/** A bot as a function of its view; `rng` is the seat's own stream. */
export type BotFn = (view: PlayerView, rng: () => number) => Intent | null;

export const levelBot = (level: BotLevel, opts: Partial<BotOptions> = {}): BotFn =>
  (view, rng) => decide(view, level, { rng, samples: 150, bidSamples: 100, ...opts });

/** One round from a fresh match (the deal depends only on seed and dealer); A's points. */
export function playRound(seed: string, dealer: Seat, a: BotFn, b: BotFn): number {
  let s = newMatch(DEFAULT_CONFIG, seed, dealer);
  const rngs = [0, 1, 2, 3].map((i) => rngFrom(`dup:${seed}:${i}`));
  while (s.phase !== 'ROUND_EVAL' && s.phase !== 'MATCH_END') {
    const seat = s.round!.turn!;
    const bot = teamOf(seat) === 'A' ? a : b;
    const intent = bot(viewFor(s, seat), rngs[seat]!);
    if (!intent) throw new Error(`no move for seat ${seat} in ${s.phase}`);
    s = apply(s, intentToAction(intent, seat)).state;
  }
  const r = s.history[s.history.length - 1]!;
  const pts = r.outcome === 'KOT' ? 52 : r.delta;
  return r.contract.team === 'A' ? pts : -pts;
}

/**
 * Duplicate score of `x` against `y`: each deal is played twice with the teams swapped, so
 * the cards cancel out. Mean points per round for x, with a 95% interval.
 */
export function duplicateScore(n: number, x: BotFn, y: BotFn, prefix = 'dup') {
  const d: number[] = [];
  for (let i = 0; i < n; i++) {
    const seed = `${prefix}${i}`, dealer = (i % 4) as Seat;
    d.push((playRound(seed, dealer, x, y) - playRound(seed, dealer, y, x)) / 2);
  }
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  return { mean, ci: 1.96 * sd / Math.sqrt(n), n, sum: mean * n, sumSq: d.reduce((a, b) => a + b * b, 0) };
}
