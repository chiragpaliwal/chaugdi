import { rankOf, suitOf, type CardId, type RankChar, type Suit } from '../../engine/types';

export const SUIT_NAME: Record<Suit, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_WORD: Partial<Record<RankChar, string>> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' };

/** Rank as printed on the card: T → 10. */
export const rankLabel = (c: CardId) => (rankOf(c) === 'T' ? '10' : rankOf(c));

/** "A♣", "10♦" for running text and CTAs. */
export const cardShort = (c: CardId) => rankLabel(c) + SUIT_SYMBOL[suitOf(c)];

/** "Jack of diamonds, Hukum" (HANDOFF §9). */
export function cardLabel(c: CardId, hukum: Suit | null = null): string {
  const r = rankOf(c);
  const word = RANK_WORD[r] ?? rankLabel(c);
  return `${word} of ${SUIT_NAME[suitOf(c)]}${hukum && suitOf(c) === hukum ? ', Hukum' : ''}`;
}
