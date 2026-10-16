// Bot memory (GDD §9): what a seat can know from its view — played cards, known voids,
// trumps outstanding, master cards. Kept as a small plain context so Monte Carlo
// simulations can update it cheaply without building PlayerViews.

import { RANKS, partnerOf, rankValue, suitOf, teamOf, type CardId, type Contract, type Play, type PlayerView, type Seat, type Suit } from '../types';

const SUIT_BIT: Record<Suit, number> = { S: 1, H: 2, D: 4, C: 8 };

export interface PlayContext {
  you: Seat;
  hand: CardId[];
  trump: Suit;
  contract: Contract;
  /** Current trick in play order. */
  plays: Play[];
  /** Every card played this round, the current trick included. */
  played: Set<CardId>;
  /** Known voids per seat as suit bit masks. */
  voids: [number, number, number, number];
  tricksWon: { A: number; B: number };
}

export const isVoid = (ctx: PlayContext, seat: Seat, s: Suit) => (ctx.voids[seat] & SUIT_BIT[s]) !== 0;
export const markVoid = (voids: PlayContext['voids'], seat: Seat, s: Suit) => { voids[seat] |= SUIT_BIT[s]; };

/** Builds the context from a view. `trackVoids: false` is Easy's memory (GDD §9.3). */
export function contextFromView(view: PlayerView, trackVoids = true): PlayContext {
  const voids: PlayContext['voids'] = [0, 0, 0, 0];
  const played = new Set<CardId>();
  const tricks = view.current ? [...view.tricks, view.current] : view.tricks;
  for (const t of tricks) {
    const led = t.plays[0] ? suitOf(t.plays[0].card) : null;
    for (const p of t.plays) {
      played.add(p.card);
      if (trackVoids && led && suitOf(p.card) !== led) markVoid(voids, p.seat, led);
    }
  }
  return {
    you: view.you,
    hand: [...view.hand],
    trump: view.trump!,
    contract: view.contract!,
    plays: view.current ? [...view.current.plays] : [],
    played,
    voids,
    tricksWon: { ...view.tricksWon },
  };
}

/** No unplayed card of the suit above it is outside your own hand. */
export function isEffectiveMaster(card: CardId, ctx: Pick<PlayContext, 'played' | 'hand'>): boolean {
  const s = suitOf(card);
  for (let v = rankValue(card) + 1; v <= 14; v++) {
    const c = `${RANKS[v - 2]}${s}` as CardId;
    if (!ctx.played.has(c) && !ctx.hand.includes(c)) return false;
  }
  return true;
}

/** Highest unplayed card of a suit (it may be in your hand), or null when all are played. */
export function masterOf(s: Suit, played: Set<CardId>): CardId | null {
  for (let v = 14; v >= 2; v--) {
    const c = `${RANKS[v - 2]}${s}` as CardId;
    if (!played.has(c)) return c;
  }
  return null;
}

/** Trumps not played and not in your hand. */
export function trumpsOutstanding(ctx: PlayContext): number {
  let n = 0;
  for (const r of RANKS) {
    const c = `${r}${ctx.trump}` as CardId;
    if (!ctx.played.has(c) && !ctx.hand.includes(c)) n++;
  }
  return n;
}

export const opponentsOf = (s: Seat): [Seat, Seat] => [((s + 1) % 4) as Seat, ((s + 3) % 4) as Seat];
export const partner = partnerOf;
export const onBiddingTeam = (ctx: PlayContext) => teamOf(ctx.you) === ctx.contract.team;
