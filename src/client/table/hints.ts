// Fact sentences for the status and hint lines (HANDOFF §1 rule 3: facts, never advice).

import { suitOf, type CardId, type Suit } from '../../engine/types';
import { legalCards, trickWinner, type Play } from '../../engine/tricks';
import { cardShort, SUIT_SYMBOL } from '../components/cardText';
import type { ViewSeat } from './geometry';

const SUIT_SINGULAR: Record<Suit, string> = { S: 'spade', H: 'heart', D: 'diamond', C: 'club' };
const suitCount = (n: number, s: Suit) => `${n} ${SUIT_SINGULAR[s]}${n === 1 ? '' : 's'}`;

export interface TrickContext {
  /** Plays so far in play order; seats are view-relative (0 = you). */
  plays: Play[];
  hukum: Suit | null;
  names: Record<ViewSeat, string>;
}

export interface StatusParts {
  bold: string;
  text: string;
  suit?: Suit;
  tail?: string;
}

/** "Your turn · Follow ♣ · 3 playable" and its variants. */
export function yourTurnStatus(hand: readonly CardId[], plays: readonly Play[]): StatusParts {
  if (!plays.length) return { bold: 'Your turn', text: 'Lead any card' };
  const led = suitOf(plays[0]!.card);
  const follow = hand.filter((c) => suitOf(c) === led).length;
  if (follow) return { bold: 'Your turn', text: 'Follow', suit: led, tail: `${follow} playable` };
  return { bold: 'Your turn', text: 'No', suit: led, tail: 'any card' };
}

/** Reason shown when a dimmed card is tapped (10b). */
export function illegalReason(hand: readonly CardId[], plays: readonly Play[]): string {
  const led = suitOf(plays[0]!.card);
  const n = hand.filter((c) => suitOf(c) === led).length;
  return `Must follow ${SUIT_SYMBOL[led]}. You have ${suitCount(n, led)}.`;
}

export function isLegal(card: CardId, hand: readonly CardId[], plays: readonly Play[]) {
  return legalCards(hand, plays).includes(card);
}

const winnerPhrase = (p: Play, ctx: TrickContext) => {
  const led = suitOf(ctx.plays[0]!.card);
  const cut = ctx.hukum !== null && suitOf(p.card) === ctx.hukum && led !== ctx.hukum;
  return `${ctx.names[p.seat]}’s ${cardShort(p.card)}${cut ? ' cut' : ''}`;
};

/** What the selected card does to the current trick (10: "A♣ follows ♣. Dev’s 4♠ cut still wins this trick."). */
export function describePlay(card: CardId, ctx: TrickContext): string {
  const short = cardShort(card);
  const s = suitOf(card);
  if (!ctx.plays.length) {
    return s === ctx.hukum ? `${short} leads Hukum.` : `${short} leads ${SUIT_SYMBOL[s]}.`;
  }
  const led = suitOf(ctx.plays[0]!.card);
  const verb = s === led ? `follows ${SUIT_SYMBOL[led]}` : s === ctx.hukum ? `cuts ${SUIT_SYMBOL[led]}` : 'is a discard';
  const after = [...ctx.plays, { seat: 0 as ViewSeat, card }];
  const winner = trickWinner(after, ctx.hukum)!;
  const last = after.length === 4;
  if (winner.seat === 0) return `${short} ${verb}. It wins this trick${last ? '' : ' so far'}.`;
  const before = trickWinner(ctx.plays, ctx.hukum)!;
  const still = before.seat === winner.seat ? 'still ' : '';
  return `${short} ${verb}. ${winnerPhrase(winner, ctx)} ${still}wins this trick.`;
}
