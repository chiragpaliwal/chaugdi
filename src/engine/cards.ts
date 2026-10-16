import { rankValue, suitOf, type CardId, type Suit } from './types';

/** Fixed display order with alternating colours (GDD §8.4). */
export const DISPLAY_SUIT_ORDER: Suit[] = ['S', 'H', 'C', 'D'];

/**
 * Display-only hand sort (GDD §8.4): the trump suit first once known, then the
 * remaining suits in ♠ ♥ ♣ ♦ order, ranks high to low within each suit.
 */
export function sortHand(hand: readonly CardId[], trump: Suit | null): CardId[] {
  const order = trump ? [trump, ...DISPLAY_SUIT_ORDER.filter((s) => s !== trump)] : DISPLAY_SUIT_ORDER;
  return [...hand].sort((a, b) => {
    const bySuit = order.indexOf(suitOf(a)) - order.indexOf(suitOf(b));
    return bySuit !== 0 ? bySuit : rankValue(b) - rankValue(a);
  });
}
