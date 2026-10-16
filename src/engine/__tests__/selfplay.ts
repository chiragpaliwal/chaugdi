// Bot self-play harness shared by the TV-17 test and scripts/selfplay.

import { decide, intentToAction, type BotLevel } from '../bots';
import { apply, newMatch } from '../reducer';
import { rngFrom } from '../rng';
import { DEFAULT_CONFIG, teamOf, type MatchState, type Seat } from '../types';
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
