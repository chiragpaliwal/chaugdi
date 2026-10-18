// Easy card play (GDD §9.3): a greedy beginner. It sees only its hand and the current trick:
// no card counting, no voids, no thought for its partner. It wins tricks when it can, sheds
// low when it can't, and cuts whenever it is void, even over a partner who is winning.

import { legalCards, trickWinner } from '../tricks';
import { rankValue, suitOf, type CardId, type Play, type Seat, type Suit } from '../types';

const low = (cs: CardId[]) => cs.reduce((a, b) => (rankValue(b) < rankValue(a) ? b : a));
const high = (cs: CardId[]) => cs.reduce((a, b) => (rankValue(b) > rankValue(a) ? b : a));

export function easyPlay(you: Seat, hand: CardId[], plays: Play[], trump: Suit, rng: () => number): CardId {
  const legal = legalCards(hand, plays);
  if (legal.length === 1) return legal[0]!;
  if (!plays.length) {
    const aces = legal.filter((c) => c[0] === 'A');
    return aces.length ? aces[0]! : legal[Math.floor(rng() * legal.length)]!;
  }
  const wins = (c: CardId) => trickWinner([...plays, { seat: you, card: c }], trump)!.seat === you;
  const led = suitOf(plays[0]!.card);
  if (hand.some((c) => suitOf(c) === led)) {
    return legal.some(wins) ? high(legal) : low(legal);
  }
  const cuts = legal.filter((c) => suitOf(c) === trump && wins(c));
  if (cuts.length) return low(cuts);
  const side = legal.filter((c) => suitOf(c) !== trump);
  return low(side.length ? side : legal);
}
