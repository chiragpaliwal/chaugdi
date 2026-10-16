import { describe, expect, it } from 'vitest';
import { legalCards, trickWinner } from '../tricks';

describe('trickWinner (GDD §8.6)', () => {
  it('TV-13: a trump beats the led suit', () => {
    const w = trickWinner([{ seat: 0, card: 'KH' }, { seat: 1, card: 'AH' }, { seat: 2, card: '2S' }, { seat: 3, card: 'QH' }], 'S');
    expect(w?.seat).toBe(2);
  });
  it('TV-14: off-suit cards never win', () => {
    const w = trickWinner([{ seat: 0, card: 'KH' }, { seat: 1, card: 'AC' }, { seat: 2, card: '3H' }, { seat: 3, card: 'QH' }], 'S');
    expect(w?.seat).toBe(0);
  });
  it('the higher of two trumps wins', () => {
    const w = trickWinner([{ seat: 0, card: 'KH' }, { seat: 1, card: '3S' }, { seat: 2, card: '9S' }], 'S');
    expect(w?.seat).toBe(2);
  });
});

describe('legalCards', () => {
  it('TV-15: must follow the led suit when held', () => {
    expect(legalCards(['4H', 'AS'], [{ seat: 1, card: 'KH' }])).toEqual(['4H']);
  });
  it('anything when void, and anything when leading', () => {
    expect(legalCards(['4D', 'AS'], [{ seat: 1, card: 'KH' }])).toEqual(['4D', 'AS']);
    expect(legalCards(['4D', 'AS'], [])).toEqual(['4D', 'AS']);
  });
});
