import { rankValue, suitOf, type CardId, type Play, type Suit } from './types';

export type { Play } from './types';

/** GDD §8.3: highest trump if any trump was played, else highest card of the led suit. */
export function trickWinner(plays: readonly Play[], trump: Suit | null): Play | null {
  if (!plays.length) return null;
  const led = suitOf(plays[0]!.card);
  const trumps = trump ? plays.filter((p) => suitOf(p.card) === trump) : [];
  const pool = trumps.length ? trumps : plays.filter((p) => suitOf(p.card) === led);
  return pool.reduce((best, p) => (rankValue(p.card) > rankValue(best.card) ? p : best));
}

/** GDD §8.3: follow the led suit if you hold it, otherwise anything. */
export function legalCards(hand: readonly CardId[], plays: readonly Play[]): CardId[] {
  if (!plays.length) return [...hand];
  const led = suitOf(plays[0]!.card);
  const follow = hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : [...hand];
}

/** The `cut` event: the first trump on a trick led in another suit (GDD §6.2). */
export function isFirstCut(plays: readonly Play[], card: CardId, trump: Suit | null): boolean {
  if (!trump || !plays.length || suitOf(card) !== trump) return false;
  if (suitOf(plays[0]!.card) === trump) return false;
  return !plays.some((p) => suitOf(p.card) === trump);
}
