// Random legal action sequences (GDD §8.6): no exceptions, invariants hold, no view leaks.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { apply, legalActions, legalCardsFor, newMatch } from '../reducer';
import { DEFAULT_CONFIG, SEATS, type MatchState, type Seat } from '../types';
import { assertInvariants, viewFor, viewLeaks } from '../view';

/** Plays a whole match choosing with `pick`; checks everything after every action. */
function playMatch(seed: string, dealer: Seat, pick: (n: number, s: MatchState) => number) {
  let s = newMatch(DEFAULT_CONFIG, seed, dealer);
  let steps = 0;
  while (s.phase !== 'MATCH_END') {
    const acts = legalActions(s);
    expect(acts.length).toBeGreaterThan(0);
    s = apply(s, acts[pick(acts.length, s)]!).state;
    assertInvariants(s);
    for (const seat of SEATS) if (viewLeaks(viewFor(s, seat), s)) throw new Error(`view for ${seat} leaks a hidden card`);
    if (++steps > 20000) throw new Error('match did not terminate');
  }
  return s;
}

describe('property: random legal play', () => {
  it('any sequence of legal actions keeps the invariants and terminates', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.integer({ min: 0, max: 3 }), fc.infiniteStream(fc.nat()), (seed, dealer, picks) => {
        const it = picks[Symbol.iterator]();
        // Bias toward passing in the auction so matches are not all forced 7s or instant 13s.
        const end = playMatch(seed, dealer as Seat, (n, s) => {
          const r = it.next().value as number;
          if (s.phase === 'BIDDING' && r % 3 !== 0) return 0;
          return r % n;
        });
        expect(end.winner).not.toBeNull();
      }),
      { numRuns: 25 },
    );
  }, 60_000);

  it('every illegal card throws and leaves the state unchanged', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), (seed) => {
        let s = newMatch(DEFAULT_CONFIG, seed, 0);
        s = apply(s, { type: 'BID', seat: 1, value: 13 }).state;
        s = apply(s, { type: 'CHOOSE_TRUMP', seat: 1, suit: 'H' }).state;
        s = apply(s, { type: 'PLAY_CARD', seat: 1, card: s.round!.hands[1][0]! }).state;
        const legal = new Set(legalCardsFor(s, 2));
        const before = JSON.stringify(s);
        for (const c of s.round!.hands[2]) {
          if (legal.has(c)) continue;
          expect(() => apply(s, { type: 'PLAY_CARD', seat: 2, card: c })).toThrow('MUST_FOLLOW_SUIT');
        }
        expect(JSON.stringify(s)).toBe(before);
      }),
      { numRuns: 200 },
    );
  });
});
