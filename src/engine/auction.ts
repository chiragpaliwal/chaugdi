// Open auction (GDD §3.4.2).

import { nextSeat, type AuctionState, type MatchConfig, type Seat } from './types';

export const emptyAuction = (): AuctionState => ({ high: null, consecutivePasses: 0, log: [] });

/** Bids the seat may make now (empty when it cannot bid at all). Passing is always allowed. */
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

/** Applies a pass: three after a bid close it; four with no bid force dealer+1 to play minBid. */
export function stepPass(a: AuctionState, seat: Seat, dealer: Seat, config: MatchConfig): AuctionStep {
  const passes = a.consecutivePasses + 1;
  const log = [...a.log, { seat, kind: 'pass' as const }];
  if (a.high && passes === 3) {
    const auction = { high: a.high, consecutivePasses: passes, log };
    return { done: true, auction, winner: a.high, forced: false };
  }
  if (!a.high && passes === 4) {
    const winner = { seat: nextSeat(dealer), value: config.minBid };
    return { done: true, auction: { high: winner, consecutivePasses: passes, log }, winner, forced: true };
  }
  return { done: false, auction: { high: a.high, consecutivePasses: passes, log }, turn: nextSeat(seat) };
}
