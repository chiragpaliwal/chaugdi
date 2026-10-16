// Per-seat views (GDD §7 PlayerView) and the dev/test invariants (GDD §8.5).

import { sortHand } from './cards';
import { emptyAuction } from './auction';
import { cloneAuction, cloneHands, cloneResult, cloneTrick } from './clone';
import { legalCardsFor } from './reducer';
import { SEATS, type CardId, type MatchState, type PlayerView, type Seat } from './types';

/** Everything `seat` may know. Never contains another seat's cards before the round is decided. */
export function viewFor(state: MatchState, seat: Seat): PlayerView {
  const round = state.round;
  const tricks = round ? round.tricks.map(cloneTrick) : [];
  const current = round?.current ? cloneTrick(round.current) : null;
  const played: CardId[] = [...tricks.flatMap((t) => t.plays.map((p) => p.card)), ...(current?.plays.map((p) => p.card) ?? [])];
  return {
    you: seat,
    phase: state.phase,
    roundNo: round?.roundNo ?? 0,
    dealer: state.dealer,
    ledger: state.ledger,
    hand: round ? sortHand(round.hands[seat], round.trump) : [],
    handCounts: { 0: round?.hands[0].length ?? 0, 1: round?.hands[1].length ?? 0, 2: round?.hands[2].length ?? 0, 3: round?.hands[3].length ?? 0 },
    auction: round ? cloneAuction(round.auction) : emptyAuction(),
    contract: round?.contract ? { ...round.contract } : null,
    trump: round?.trump ?? null,
    current,
    lastTrick: tricks[tricks.length - 1] ?? null,
    tricks,
    tricksWon: round ? { ...round.tricksWon } : { A: 0, B: 0 },
    playedCards: played,
    turn: round?.turn ?? null,
    legal: legalCardsFor(state, seat),
    revealedHands: round?.result ? cloneHands(round.hands) : null,
    history: state.history.map(cloneResult),
    winner: state.winner,
    winReason: state.winReason,
    config: { ...state.config },
  };
}

/** Throws with a description when GDD §8.5 is broken. */
export function assertInvariants(state: MatchState): void {
  const round = state.round;
  if (!round) return;
  const all: CardId[] = [
    ...SEATS.flatMap((s) => round.hands[s]),
    ...round.stock,
    ...round.tricks.flatMap((t) => t.plays.map((p) => p.card)),
    ...(round.current?.plays.map((p) => p.card) ?? []),
  ];
  if (all.length !== 52 || new Set(all).size !== 52) throw new Error(`card conservation: ${all.length} cards, ${new Set(all).size} distinct`);
  if (round.tricksWon.A + round.tricksWon.B !== round.tricks.length) throw new Error('tricksWon does not match tricks.length');
  if (state.phase === 'TRICK_LOOP') {
    const sizes = SEATS.map((s) => round.hands[s].length);
    if (Math.max(...sizes) - Math.min(...sizes) > 1) throw new Error(`hand sizes ${sizes.join(',')}`);
    const played = new Set(round.current!.plays.map((p) => p.seat));
    const full = 13 - round.tricks.length;
    for (const s of SEATS) {
      if (round.hands[s].length !== full - (played.has(s) ? 1 : 0)) throw new Error(`seat ${s} holds ${round.hands[s].length}`);
    }
  }
  const scored = state.history.reduce((sum, r) => sum + (r.contract.team === 'A' ? r.delta : -r.delta), 0);
  if (scored !== state.ledger) throw new Error(`ledger ${state.ledger} but history sums to ${scored}`);
}

/** True when the view leaks a card it should not show (protocol test, GDD §17). */
export function viewLeaks(view: PlayerView, state: MatchState): boolean {
  const round = state.round;
  if (!round || view.revealedHands) return false;
  const hidden = new Set(SEATS.filter((s) => s !== view.you).flatMap((s) => round.hands[s]).concat(round.stock));
  const json = JSON.stringify(view);
  for (const c of hidden) if (json.includes(`"${c}"`)) return true;
  return false;
}
