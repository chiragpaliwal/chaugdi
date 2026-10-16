import { describe, expect, it } from 'vitest';
import { decide, type BotLevel } from '../bots';
import { evaluateHand, ownFive } from '../bots/bid';
import { contextFromView, isEffectiveMaster, type PlayContext } from '../bots/memory';
import { sampleDeal } from '../bots/mc';
import { discard, mediumPlay } from '../bots/play-medium';
import { apply, newMatch } from '../reducer';
import { rngFrom } from '../rng';
import { DEFAULT_CONFIG, suitOf, type CardId, type Seat } from '../types';
import { viewFor } from '../view';
import { env, selfPlay } from './selfplay';

const ctx = (o: Partial<PlayContext> & Pick<PlayContext, 'hand'>): PlayContext => ({
  you: 0, trump: 'S', contract: { seat: 0, team: 'A', bid: 8, forced: false },
  plays: [], played: new Set(), voids: [0, 0, 0, 0], tricksWon: { A: 0, B: 0 }, ...o,
});

describe('bid evaluation (GDD §9.1)', () => {
  it('scores honours and trump length on five cards', () => {
    // ♠ trump: A 1.2 + K 1.0 + 3-card bonus 1.0; ♥A 1.0; ♦3 nothing.
    expect(ownFive(['AS', 'KS', '5S', 'AH', '3D'], 'S')).toBeCloseTo(4.2);
    // Side K singleton 0.4, side Q with length < 2 is 0.
    expect(ownFive(['KH', 'QD', '2S', '3S', '4C'], 'S')).toBeCloseTo(0.4 + 0.3);
  });
  it('picks the best trump with the tie-breaks', () => {
    expect(evaluateHand(['AS', 'KS', '5S', 'AH', '3D']).trump).toBe('S');
    // Symmetric ♠/♥ → more cards, then honours, then ♠ ♥ ♣ ♦.
    expect(evaluateHand(['AS', '2S', 'AH', '2H', '3D']).trump).toBe('S');
  });
  it('bids the minimum legal amount and passes over its partner', () => {
    let m = newMatch(DEFAULT_CONFIG, 'bids', 3);
    m.round!.hands[0] = ['AS', 'KS', 'QS', 'JS', 'AH'];
    expect(decide(viewFor(m, 0), 'medium', { rng: rngFrom('x') })).toEqual({ type: 'bid', value: 7 });
    m = apply(m, { type: 'BID', seat: 0, value: 7 }).state;
    m = apply(m, { type: 'PASS', seat: 1 }).state;
    m.round!.hands[2] = ['AD', 'KD', 'QD', 'JD', 'TD'];
    expect(decide(viewFor(m, 2), 'medium', { rng: rngFrom('x') })).toEqual({ type: 'pass' });
  });
});

describe('Medium card play (GDD §9.2)', () => {
  it('leads the master trump to draw trumps on the bidding team', () => {
    expect(mediumPlay(ctx({ hand: ['AS', '4S', 'KH', '3D'] }))).toBe('AS');
  });
  it('defenders lead a side master instead, then the low card of the longest side suit', () => {
    const def = { contract: { seat: 1 as Seat, team: 'B' as const, bid: 8, forced: false } };
    expect(mediumPlay(ctx({ ...def, hand: ['AS', '4S', 'AH', '3D'] }))).toBe('AH');
    expect(mediumPlay(ctx({ ...def, hand: ['QH', '4H', '9D', '2S'] }))).toBe('4H');
  });
  it('4th hand plays low when partner wins, otherwise the lowest winner', () => {
    const plays = [{ seat: 1 as Seat, card: '9H' as CardId }, { seat: 2 as Seat, card: 'KH' as CardId }, { seat: 3 as Seat, card: 'TH' as CardId }];
    expect(mediumPlay(ctx({ hand: ['AH', '2H', '5D'], plays }))).toBe('2H');
    const lose = [{ seat: 1 as Seat, card: 'QH' as CardId }, { seat: 2 as Seat, card: '3H' as CardId }, { seat: 3 as Seat, card: '4H' as CardId }];
    expect(mediumPlay(ctx({ hand: ['AH', 'KH', '2H'], plays: lose }))).toBe('KH');
  });
  it('cuts with the lowest winning trump when void, and discards when partner already wins 4th', () => {
    const plays = [{ seat: 1 as Seat, card: 'AD' as CardId }, { seat: 2 as Seat, card: '3D' as CardId }, { seat: 3 as Seat, card: '5D' as CardId }];
    expect(mediumPlay(ctx({ hand: ['QS', '3S', '7H', '2C'], plays }))).toBe('3S');
    const partnerWins = [{ seat: 1 as Seat, card: '2D' as CardId }, { seat: 2 as Seat, card: 'AD' as CardId }, { seat: 3 as Seat, card: '5D' as CardId }];
    expect(mediumPlay(ctx({ hand: ['QS', '3S', '7H', '9H', '2C'], plays: partnerWins }))).toBe('2C');
  });
  it('never discards a master while another card is left', () => {
    expect(discard(ctx({ hand: ['AC', '7H', '9H'] }))).toBe('7H');
    expect(isEffectiveMaster('KC', ctx({ hand: ['KC'], played: new Set(['AC']) }))).toBe(true);
  });
});

describe('memory and sampling', () => {
  it('marks a seat void when it fails to follow', () => {
    const base = viewFor(newMatch(DEFAULT_CONFIG, 'void', 0), 3);
    const trick = { leader: 1 as Seat, winner: 3 as Seat, plays: [
      { seat: 1 as Seat, card: '2H' as CardId }, { seat: 2 as Seat, card: '3C' as CardId },
      { seat: 3 as Seat, card: 'AH' as CardId }, { seat: 0 as Seat, card: '4H' as CardId },
    ] };
    const view = { ...base, phase: 'TRICK_LOOP' as const, trump: 'S' as const, contract: { seat: 1 as Seat, team: 'B' as const, bid: 8, forced: false }, tricks: [trick], current: null };
    expect(contextFromView(view).voids).toEqual([0, 0, 2, 0]);
    expect(contextFromView(view, false).voids).toEqual([0, 0, 0, 0]);
    expect(contextFromView(view).played.size).toBe(4);
  });
  it('sampled deals respect hand sizes and voids', () => {
    const rng = rngFrom('sample');
    const unseen: CardId[] = ['AH', 'KH', 'QH', 'AD', 'KD', 'QD', 'AC', 'KC', 'QC'];
    for (let i = 0; i < 200; i++) {
      const d = sampleDeal(unseen, { 0: 0, 1: 3, 2: 3, 3: 3 }, [0, 2, 0, 0], 0, rng)!;
      expect([d[1].length, d[2].length, d[3].length]).toEqual([3, 3, 3]);
      expect(d[1].some((c) => suitOf(c) === 'H')).toBe(false);
    }
  });
});

describe('TV-17 self-play (GDD §8.6)', () => {
  const n = Number(env.SELFPLAY_N ?? 400);
  it(`${n} bot matches: no exceptions, invariants hold, all terminate`, () => {
    const mixes: BotLevel[][] = [['medium', 'medium', 'medium', 'medium'], ['easy', 'medium', 'easy', 'medium'], ['easy', 'easy', 'easy', 'easy']];
    for (let i = 0; i < n; i++) {
      const lv = mixes[i % mixes.length]!;
      const { state } = selfPlay(`tv17-${i}`, { 0: lv[0]!, 1: lv[1]!, 2: lv[2]!, 3: lv[3]! }, { check: true });
      expect(state.winner).not.toBeNull();
    }
  }, 3_600_000);

  it('Hard plays legal moves through whole matches', () => {
    for (let i = 0; i < 2; i++) {
      const { state } = selfPlay(`hard-${i}`, { 0: 'hard', 1: 'medium', 2: 'hard', 3: 'easy' }, { check: true, hardSamples: 8 });
      expect(state.winner).not.toBeNull();
    }
  }, 120_000);
});
