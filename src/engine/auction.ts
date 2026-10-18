// Open auction (GDD §3.4.2).

import { nextSeat, type AuctionState, type MatchConfig, type Seat } from './types';

export const emptyAuction = (): AuctionState => ({ high: null, consecutivePasses: 0, log: [] });

/** The opener (dealer+1) must bid on the first call: 7 by default, or more. Every later call may pass. */
export const canPass = (auction: AuctionState): boolean => auction.log.length > 0;

/** Bids the seat may make now (empty when it cannot bid at all). */
export function legalBidValues(auction: AuctionState, config: MatchConfig): number[] {
  const min = auction.high ? auction.high.value + 1 : config.minBid;
  const out: number[] = [];
  for (let v = min; v <= config.maxBid; v++) out.push(v);
  return out;
}

export type AuctionStep =
  | { done: false; auction: AuctionState; turn: Seat }
  | { done: true; auction: AuctionState; winner: { seat: Seat; value: number }; forced: boolean };

/** Applies a validated bid. A bid of maxBid closes the auction at once. */
export function stepBid(a: AuctionState, seat: Seat, value: number, config: MatchConfig): AuctionStep {
  const auction: AuctionState = {
    high: { seat, value },
    consecutivePasses: 0,
    log: [...a.log, { seat, kind: 'bid', value }],
  };
  if (value === config.maxBid) return { done: true, auction, winner: { seat, value }, forced: false };
  return { done: false, auction, turn: nextSeat(seat) };
}

/**
 * Applies a pass (the opener's first call never is one, see canPass): three after the high bid close it.
 * `forced` marks a contract that is still the opener's compulsory 7, never raised.
 */
export function stepPass(a: AuctionState, seat: Seat, config: MatchConfig): AuctionStep {
  const passes = a.consecutivePasses + 1;
  const log = [...a.log, { seat, kind: 'pass' as const }];
  const auction = { high: a.high, consecutivePasses: passes, log };
  if (a.high && passes === 3) {
    const forced = a.high.value === config.minBid && log.length === 4; // opener's 7, then three passes
    return { done: true, auction, winner: a.high, forced };
  }
  return { done: false, auction, turn: nextSeat(seat) };
}
