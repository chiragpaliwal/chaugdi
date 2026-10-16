import { describe, expect, it } from 'vitest';
import { sortHand } from '../cards';

describe('sortHand (GDD §8.4)', () => {
  it('uses ♠ ♥ ♣ ♦, high to low, before Hukum is known', () => {
    expect(sortHand(['2D', 'AC', 'KH', 'TS', 'AS', 'QD'], null)).toEqual(['AS', 'TS', 'KH', 'AC', 'QD', '2D']);
  });
  it('puts the Hukum suit first, then the fixed order', () => {
    expect(sortHand(['AS', 'QS', 'TS', 'KH', 'AC'], 'C')).toEqual(['AC', 'AS', 'QS', 'TS', 'KH']);
    expect(sortHand(['AS', 'KH', 'AC', 'QD'], 'D')).toEqual(['QD', 'AS', 'KH', 'AC']);
  });
});
