// Hand-written deep copies of the engine's plain data (much faster than structuredClone,
// which dominated bot self-play).

import type { AuctionState, CardId, MatchState, RoundResult, RoundState, Seat, Trick } from './types';

export const cloneTrick = (t: Trick): Trick => {
  const c: Trick = { leader: t.leader, plays: t.plays.map((p) => ({ seat: p.seat, card: p.card })) };
  if (t.winner !== undefined) c.winner = t.winner;
  return c;
};

export const cloneHands = (h: Record<Seat, CardId[]>): Record<Seat, CardId[]> => ({ 0: [...h[0]], 1: [...h[1]], 2: [...h[2]], 3: [...h[3]] });

export const cloneAuction = (a: AuctionState): AuctionState => ({
  high: a.high && { ...a.high },
  consecutivePasses: a.consecutivePasses,
  log: a.log.map((e) => ({ ...e })),
});

export const cloneResult = (r: RoundResult): RoundResult => ({ ...r, contract: { ...r.contract }, tricksWon: { ...r.tricksWon } });

function cloneRound(r: RoundState): RoundState {
  return {
    roundNo: r.roundNo,
    hands: cloneHands(r.hands),
    stock: [...r.stock],
    auction: cloneAuction(r.auction),
    contract: r.contract && { ...r.contract },
    trump: r.trump,
    tricks: r.tricks.map(cloneTrick),
    current: r.current && cloneTrick(r.current),
    tricksWon: { ...r.tricksWon },
    turn: r.turn,
    result: r.result && cloneResult(r.result),
  };
}

export function cloneMatch(s: MatchState): MatchState {
  return {
    config: { ...s.config },
    phase: s.phase,
    seed: s.seed,
    ledger: s.ledger,
    dealer: s.dealer,
    round: s.round && cloneRound(s.round),
    history: s.history.map(cloneResult),
    winner: s.winner,
    winReason: s.winReason,
  };
}
