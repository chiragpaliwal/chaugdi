// Medium card play (GDD §9.2): rule-based with deterministic tie-breaks.

import { DISPLAY_SUIT_ORDER } from '../cards';
import { legalCards, trickWinner } from '../tricks';
import { nextSeat, partnerOf, rankValue, suitOf, type CardId, type Seat, type Suit } from '../types';
import { isEffectiveMaster, isVoid, onBiddingTeam, opponentsOf, trumpsOutstanding, type PlayContext } from './memory';

const low = (cs: CardId[]) => cs.reduce((a, b) => (rankValue(b) < rankValue(a) ? b : a));
const high = (cs: CardId[]) => cs.reduce((a, b) => (rankValue(b) > rankValue(a) ? b : a));
const ofSuit = (cs: CardId[], s: Suit) => cs.filter((c) => suitOf(c) === s);
const count = (cs: CardId[], s: Suit) => cs.reduce((n, c) => n + (suitOf(c) === s ? 1 : 0), 0);

export function mediumPlay(ctx: PlayContext): CardId {
  const legal = legalCards(ctx.hand, ctx.plays);
  if (legal.length === 1) return legal[0]!;
  if (!ctx.plays.length) return lead(ctx);
  const led = suitOf(ctx.plays[0]!.card);
  return ctx.hand.some((c) => suitOf(c) === led) ? follow(ctx, legal) : whenVoid(ctx);
}

function opponentsMayHaveTrump(ctx: PlayContext) {
  return trumpsOutstanding(ctx) > 0 && opponentsOf(ctx.you).some((o) => !isVoid(ctx, o, ctx.trump));
}

function lead(ctx: PlayContext): CardId {
  const { hand, trump } = ctx;
  const trumps = ofSuit(hand, trump);
  const side = hand.filter((c) => suitOf(c) !== trump);

  // 1. Draw trumps with the master trump when on the bidding team.
  if (onBiddingTeam(ctx) && trumps.length && opponentsMayHaveTrump(ctx)) {
    const top = high(trumps);
    if (isEffectiveMaster(top, ctx)) return top;
  }

  // 2. A side-suit master, unless an opponent is void in it and may still cut.
  const cuttable = (s: Suit) => opponentsOf(ctx.you).some((o) => isVoid(ctx, o, s) && !isVoid(ctx, o, trump) && trumpsOutstanding(ctx) > 0);
  const masters = side.filter((c) => isEffectiveMaster(c, ctx) && !cuttable(suitOf(c)));
  if (masters.length) {
    return masters.reduce((a, b) => {
      const d = count(hand, suitOf(b)) - count(hand, suitOf(a));
      if (d !== 0) return d > 0 ? b : a;
      if (suitOf(a) !== suitOf(b)) return DISPLAY_SUIT_ORDER.indexOf(suitOf(b)) < DISPLAY_SUIT_ORDER.indexOf(suitOf(a)) ? b : a;
      return rankValue(b) > rankValue(a) ? b : a;
    });
  }

  // 3. Lowest card of the longest side suit, avoiding suits an opponent is void in.
  if (side.length) {
    const opponentVoid = (s: Suit) => opponentsOf(ctx.you).some((o) => isVoid(ctx, o, s));
    const safe = side.filter((c) => !opponentVoid(suitOf(c)));
    return low(ofSuit(side, longestSuit(safe.length ? safe : side)));
  }

  // 4. Only trumps left.
  return high(trumps);
}

/** Longest suit among the cards; ties go to ♠ ♥ ♣ ♦ order. */
function longestSuit(cs: CardId[]): Suit {
  let best: Suit | null = null;
  for (const s of DISPLAY_SUIT_ORDER) if (count(cs, s) && (best === null || count(cs, s) > count(cs, best))) best = s;
  return best!;
}

function follow(ctx: PlayContext, legal: CardId[]): CardId {
  const { plays, trump } = ctx;
  const pos = plays.length + 1;
  const led = suitOf(plays[0]!.card);
  const winner = trickWinner(plays, trump)!;
  const partnerWinning = winner.seat === partnerOf(ctx.you);
  const beaters = legal.filter((c) => trickWinner([...plays, { seat: ctx.you, card: c }], trump)!.seat === ctx.you);
  const lowestWinning = beaters.length ? low(beaters) : null;

  if (pos === 2) {
    const trumped = led !== trump && plays.some((p) => suitOf(p.card) === trump);
    const top = high(legal);
    if (!trumped && isEffectiveMaster(top, ctx) && beaters.includes(top)) return top;
    return low(legal);
  }
  if (pos === 3) {
    if (partnerWinning && isEffectiveMaster(winner.card, ctx)) return low(legal);
    return lowestWinning ?? low(legal);
  }
  if (partnerWinning) return low(legal);
  return lowestWinning ?? low(legal);
}

function whenVoid(ctx: PlayContext): CardId {
  const { plays, trump, hand } = ctx;
  const pos = plays.length + 1;
  const winner = trickWinner(plays, trump)!;
  if (winner.seat === partnerOf(ctx.you)) {
    const next = nextSeat(ctx.you) as Seat;
    const safe = isEffectiveMaster(winner.card, ctx) || (suitOf(winner.card) === trump && isVoid(ctx, next, trump));
    if (pos === 4 || safe) return discard(ctx);
  }
  const winningTrumps = ofSuit(hand, trump).filter((c) => trickWinner([...plays, { seat: ctx.you, card: c }], trump)!.seat === ctx.you);
  if (winningTrumps.length) return low(winningTrumps);
  return discard(ctx);
}

/** Lowest card of the shortest side suit; never a master while anything else is left. */
export function discard(ctx: PlayContext): CardId {
  const side = ctx.hand.filter((c) => suitOf(c) !== ctx.trump);
  if (!side.length) return low(ctx.hand);
  const plain = side.filter((c) => !isEffectiveMaster(c, ctx));
  const pool = plain.length ? plain : side;
  let best: Suit | null = null;
  for (const s of DISPLAY_SUIT_ORDER) {
    if (!count(pool, s)) continue;
    if (best === null || count(ctx.hand, s) < count(ctx.hand, best)) best = s;
  }
  return low(ofSuit(pool, best!));
}
