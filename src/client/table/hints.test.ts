import { describe, expect, it } from 'vitest';
import type { CardId } from '../../engine/types';
import { handFacts, suitTileFact } from './facts';
import { describePlay, illegalReason, yourTurnStatus, type TrickContext } from './hints';

const names = { 0: 'You', 1: 'Ben', 2: 'Asha', 3: 'Dev' } as const;
const hand: CardId[] = ['AS', 'QS', 'TS', '6S', '3S', 'KH', 'JH', '8H', 'AC', '9C', '4C', 'QD', '7D'];
// Screen 10: Ben led K♣, Asha 2♣, Dev cut 4♠, spades are Hukum.
const ctx: TrickContext = { hukum: 'S', names, plays: [{ seat: 1, card: 'KC' }, { seat: 2, card: '2C' }, { seat: 3, card: '4S' }] };

describe('play hints (screen 10)', () => {
  it('status line', () => {
    expect(yourTurnStatus(hand, ctx.plays)).toEqual({ bold: 'Your turn', text: 'Follow', suit: 'C', tail: '3 playable' });
    expect(yourTurnStatus(hand, [])).toEqual({ bold: 'Your turn', text: 'Lead any card' });
  });
  it('selected card fact', () => {
    expect(describePlay('AC', ctx)).toBe('A♣ follows ♣. Dev’s 4♠ cut still wins this trick.');
  });
  it('wins so far / still wins', () => {
    const two: TrickContext = { ...ctx, plays: ctx.plays.slice(0, 2) };
    expect(describePlay('AC', two)).toBe('A♣ follows ♣. It wins this trick so far.');
    const three: TrickContext = { ...ctx, plays: [{ seat: 1, card: 'KC' }, { seat: 2, card: '2C' }] };
    expect(describePlay('4C', three)).toBe('4♣ follows ♣. Ben’s K♣ still wins this trick.');
  });
  it('illegal tap reason (10b)', () => {
    expect(illegalReason(hand, ctx.plays)).toBe('Must follow ♣. You have 3 clubs.');
  });
});

describe('hand facts (06, 08)', () => {
  const five: CardId[] = ['AS', 'QS', 'TS', 'KH', 'AC'];
  it('auction chips', () => {
    expect(handFacts(five, { moreCards: 8 })).toEqual([
      [{ kind: 'suit', suit: 'S' }, { kind: 'num', value: '3' }, { kind: 'text', value: 'A Q 10' }],
      [{ kind: 'num', value: '2' }, { kind: 'text', value: 'aces' }],
      [{ kind: 'text', value: 'No' }, { kind: 'suit', suit: 'D' }, { kind: 'text', value: 'yet' }],
      [{ kind: 'num', value: '8' }, { kind: 'text', value: 'more cards after Hukum' }],
    ]);
  });
  it('Hukum tiles', () => {
    expect(suitTileFact(five, 'S')).toBe('3 · A Q 10');
    expect(suitTileFact(five, 'D')).toBe('0 · none yet');
  });
});
