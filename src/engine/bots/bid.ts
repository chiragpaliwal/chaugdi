// Bid evaluation on the first five cards (GDD §9.1).

import { DISPLAY_SUIT_ORDER } from '../cards';
import { rankOf, rankValue, suitOf, type CardId, type Suit } from '../types';

const TRUMP_HONOUR: Partial<Record<string, number>> = { A: 1.2, K: 1.0, Q: 0.7, J: 0.4 };
const LENGTH_BONUS = [0, 0, 0.3, 1.0, 2.0, 3.0];
export const UNSEEN_EIGHT = 2.0;
export const PARTNER = 3.25;

const count = (hand: readonly CardId[], s: Suit) => hand.filter((c) => suitOf(c) === s).length;

export function ownFive(hand: readonly CardId[], trump: Suit): number {
  let v = 0;
  for (const c of hand) {
    const s = suitOf(c);
    const r = rankOf(c);
    if (s === trump) { v += TRUMP_HONOUR[r] ?? 0; continue; }
    const len = count(hand, s);
    if (r === 'A') v += 1.0;
    else if (r === 'K') v += len === 1 ? 0.4 : 0.75;
    else if (r === 'Q') v += len < 2 ? 0 : 0.35;
  }
  return v + (LENGTH_BONUS[Math.min(5, count(hand, trump))] ?? 0);
}

export const teamEstimate = (hand: readonly CardId[], trump: Suit) => ownFive(hand, trump) + UNSEEN_EIGHT + PARTNER;

const honours = (hand: readonly CardId[], s: Suit) => hand.filter((c) => suitOf(c) === s).map(rankValue).sort((a, b) => b - a);

/** Best estimate over the four suits. Ties: more cards, then higher honours, then ♠ ♥ ♣ ♦. */
export function evaluateHand(hand: readonly CardId[]): { best: number; trump: Suit } {
  let trump: Suit = 'S';
  let best = -Infinity;
  for (const s of DISPLAY_SUIT_ORDER) {
    const e = teamEstimate(hand, s);
    if (e > best + 1e-9) { best = e; trump = s; continue; }
    if (Math.abs(e - best) > 1e-9) continue;
    const dc = count(hand, s) - count(hand, trump);
    if (dc > 0) { trump = s; continue; }
    if (dc < 0) continue;
    const a = honours(hand, s), b = honours(hand, trump);
    for (let i = 0; i < a.length; i++) {
      if (a[i]! !== b[i]!) { if (a[i]! > b[i]!) trump = s; break; }
    }
  }
  return { best, trump };
}

/** Minimum legal bid when willing, else null (pass). */
export function chooseBid(maxWilling: number, high: number | null, minBid = 7, maxBid = 13): number | null {
  const need = Math.max(minBid, (high ?? 0) + 1);
  return need <= maxBid && maxWilling >= need ? need : null;
}
