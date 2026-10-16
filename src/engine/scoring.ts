// Early end, scoring and the dealer rule (GDD §3.4.6, §3.5, §3.6).

import { nextSeat, otherTeam, standing, teamOf, type Outcome, type RoundState, type Seat } from './types';

/** MADE / FAILED / KOT as soon as it is certain, else null. */
export function isRoundDecided(round: Pick<RoundState, 'contract' | 'tricksWon'>): Outcome | null {
  const c = round.contract;
  if (!c) return null;
  if (round.tricksWon[c.team] >= c.bid) return c.bid === 13 ? 'KOT' : 'MADE';
  if (round.tricksWon[otherTeam(c.team)] >= 14 - c.bid) return 'FAILED';
  return null;
}

/** Change to the bidding team's standing: +b made, −2b failed, 0 for Kot (it ends the match instead). */
export function roundDelta(outcome: Outcome, bid: number): number {
  return outcome === 'MADE' ? bid : outcome === 'FAILED' ? -2 * bid : 0;
}

/** Delta for a decided round, or null while it is still open. */
export function scoreRound(round: Pick<RoundState, 'contract' | 'tricksWon'>): { outcome: Outcome; delta: number } | null {
  const outcome = isRoundDecided(round);
  if (!outcome || !round.contract) return null;
  return { outcome, delta: roundDelta(outcome, round.contract.bid) };
}

/** The deal moves left only when the dealer's team is strictly ahead. */
export function nextDealer(ledger: number, dealer: Seat): Seat {
  return standing(ledger, teamOf(dealer)) > 0 ? nextSeat(dealer) : dealer;
}
