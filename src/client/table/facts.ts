// Fact chips about your own hand for the auction (06, 07) and the Hukum tiles (08).
// Facts only from your hand (HANDOFF §4 BidSheet).

import { DISPLAY_SUIT_ORDER, sortHand } from '../../engine/cards';
import { rankOf, suitOf, type CardId, type Suit } from '../../engine/types';
import { rankLabel } from '../components/cardText';

export type FactPart = { kind: 'suit'; suit: Suit } | { kind: 'num'; value: string } | { kind: 'text'; value: string };
export type Fact = FactPart[];

const ranksOf = (hand: readonly CardId[], s: Suit) => sortHand(hand.filter((c) => suitOf(c) === s), null).map(rankLabel);

export function handFacts(hand: readonly CardId[], opts: { moreCards?: number } = {}): Fact[] {
  const facts: Fact[] = [];
  let longest: Suit | null = null;
  for (const s of DISPLAY_SUIT_ORDER) {
    const n = hand.filter((c) => suitOf(c) === s).length;
    if (n > 0 && (longest === null || n > hand.filter((c) => suitOf(c) === longest).length)) longest = s;
  }
  if (longest) {
    const ranks = ranksOf(hand, longest);
    facts.push([{ kind: 'suit', suit: longest }, { kind: 'num', value: String(ranks.length) }, { kind: 'text', value: ranks.join(' ') }]);
  }
  const aces = hand.filter((c) => rankOf(c) === 'A').length;
  facts.push(aces ? [{ kind: 'num', value: String(aces) }, { kind: 'text', value: aces === 1 ? 'ace' : 'aces' }] : [{ kind: 'text', value: 'No aces' }]);
  for (const s of DISPLAY_SUIT_ORDER.filter((s) => !hand.some((c) => suitOf(c) === s)).slice(0, 2)) {
    facts.push([{ kind: 'text', value: 'No' }, { kind: 'suit', suit: s }, { kind: 'text', value: 'yet' }]);
  }
  if (opts.moreCards) facts.push([{ kind: 'num', value: String(opts.moreCards) }, { kind: 'text', value: 'more cards after Hukum' }]);
  return facts;
}

/** "3 · A Q 10", "1 · K", "0 · none yet" for a Hukum tile. */
export function suitTileFact(hand: readonly CardId[], s: Suit): string {
  const ranks = ranksOf(hand, s);
  return `${ranks.length} · ${ranks.length ? ranks.join(' ') : 'none yet'}`;
}
