// GDD §8.6 test vectors. TV-13–15 live in tricks.test.ts; TV-17 in selfplay.test.ts.

import { describe, expect, it } from 'vitest';
import { apply, legalActions, newMatch } from '../reducer';
import { DEFAULT_CONFIG, RuleError, type Action, type GameEvent, type MatchState, type Seat } from '../types';
import { viewFor } from '../view';
import { atPlay, deepFreeze, playOut, playRow } from './helpers';

const run = (state: MatchState, actions: Action[]) => {
  let s = state;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = apply(s, a);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
};
const bid = (seat: Seat, value: number): Action => ({ type: 'BID', seat, value });
const pass = (seat: Seat): Action => ({ type: 'PASS', seat });
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof RuleError ? e.code : String(e); }
  return null;
};

describe('TV-1 worked example (GDD §3.8)', () => {
  it('R1 seat 1 makes 7: ledger −7, dealer stays; R2 seat 1 fails 8: ledger +9, deal moves to seat 1', () => {
    const r1 = atPlay({ dealer: 0, bidder: 1, bid: 7, winners: [1, 3, 1, 3, 1, 3, 1] });
    const a = playOut(r1.state, r1.rows);
    expect(a.state.ledger).toBe(-7);
    expect(a.state.phase).toBe('ROUND_EVAL');
    expect(a.events).toContainEqual({ t: 'dealerStays', seat: 0 });
    const n1 = apply(a.state, { type: 'NEXT_ROUND' }).state;
    expect(n1.dealer).toBe(0);

    const r2 = atPlay({ base: n1, bidder: 1, bid: 8, winners: [0, 2, 0, 2, 0, 2] });
    const b = playOut(r2.state, r2.rows);
    expect(b.state.ledger).toBe(9);
    expect(b.events).toContainEqual({ t: 'dealerChanged', from: 0, to: 1 });
    expect(apply(b.state, { type: 'NEXT_ROUND' }).state.dealer).toBe(1);
  });
});

describe('auction', () => {
  it('TV-2: dealer+1 cannot pass the opening call', () => {
    const m = newMatch(DEFAULT_CONFIG, 'tv2', 3);
    expect(code(() => apply(m, pass(0)))).toBe('OPENER_MUST_BID');
    expect(legalActions(m)).not.toContainEqual(pass(0));
    expect(legalActions(m)[0]).toEqual(bid(0, 7));
  });

  it('TV-2b: the compulsory 7 with three passes is a forced contract', () => {
    const { state, events } = run(newMatch(DEFAULT_CONFIG, 'tv2', 3), [bid(0, 7), pass(1), pass(2), pass(3)]);
    expect(state.round!.contract).toEqual({ seat: 0, team: 'A', bid: 7, forced: true });
    expect(state.phase).toBe('TRUMP_SELECTION');
    expect(state.round!.turn).toBe(0);
    expect(events).toContainEqual({ t: 'auctionWon', seat: 0, value: 7, forced: true });
  });

  it('TV-3: a player who passed can bid again', () => {
    const { state } = run(newMatch(DEFAULT_CONFIG, 'tv3', 0),
      [bid(1, 7), pass(2), pass(3), bid(0, 8), pass(1), bid(2, 9), pass(3), pass(0), pass(1)]);
    expect(state.round!.contract).toMatchObject({ seat: 2, bid: 9, forced: false });
  });

  it('TV-4: a bid of 13 ends the auction at once', () => {
    const { state } = run(newMatch(DEFAULT_CONFIG, 'tv4', 0), [bid(1, 7), bid(2, 13)]);
    expect(state.phase).toBe('TRUMP_SELECTION');
    expect(state.round!.contract).toMatchObject({ seat: 2, bid: 13 });
  });

  it('TV-5: two passes after a bid keep it open; the third closes it', () => {
    const m = run(newMatch(DEFAULT_CONFIG, 'tv5', 0), [bid(1, 8), pass(2), pass(3)]).state;
    expect(m.phase).toBe('BIDDING');
    expect(m.round!.turn).toBe(0);
    const done = apply(m, pass(0)).state;
    expect(done.round!.contract).toMatchObject({ seat: 1, bid: 8 });
  });

  it('TV-16: a bid must beat the high bid', () => {
    const m = run(newMatch(DEFAULT_CONFIG, 'tv16', 0), [bid(1, 9)]).state;
    expect(code(() => apply(m, bid(2, 9)))).toBe('BID_NOT_HIGHER');
  });

  it('rejects bids out of range, out of turn and in the wrong phase', () => {
    const m = newMatch(DEFAULT_CONFIG, 'err', 0);
    expect(code(() => apply(m, bid(1, 6)))).toBe('BID_OUT_OF_RANGE');
    expect(code(() => apply(m, bid(1, 14)))).toBe('BID_OUT_OF_RANGE');
    expect(code(() => apply(m, bid(2, 7)))).toBe('NOT_YOUR_TURN');
    expect(code(() => apply(m, { type: 'CHOOSE_TRUMP', seat: 1, suit: 'S' }))).toBe('WRONG_PHASE');
    const won = run(m, [bid(1, 13)]).state;
    expect(code(() => apply(won, { type: 'CHOOSE_TRUMP', seat: 2, suit: 'S' }))).toBe('NOT_CONTRACT_HOLDER');
  });
});

describe('deals', () => {
  it('Deal 5 then Deal 8 in two passes of 4, from the dealer’s left', () => {
    const m = newMatch(DEFAULT_CONFIG, 'deal', 2);
    expect([0, 1, 2, 3].map((s) => m.round!.hands[s as Seat].length)).toEqual([5, 5, 5, 5]);
    expect(m.round!.stock).toHaveLength(32);
    expect(m.round!.turn).toBe(3);
    const { state, events } = run(m, [bid(3, 13), { type: 'CHOOSE_TRUMP', seat: 3, suit: 'H' }]);
    expect([0, 1, 2, 3].map((s) => state.round!.hands[s as Seat].length)).toEqual([13, 13, 13, 13]);
    expect(events.filter((e) => e.t === 'dealt')).toEqual([
      { t: 'dealt', batch: 4, order: [3, 0, 1, 2] }, { t: 'dealt', batch: 4, order: [3, 0, 1, 2] },
    ]);
    expect(state.phase).toBe('TRICK_LOOP');
    expect(state.round!.turn).toBe(3);
  });

  it('the same seed deals the same cards', () => {
    expect(newMatch(DEFAULT_CONFIG, 'same', 0).round).toEqual(newMatch(DEFAULT_CONFIG, 'same', 0).round);
    expect(newMatch(DEFAULT_CONFIG, 'same', 0).round).not.toEqual(newMatch(DEFAULT_CONFIG, 'other', 0).round);
  });
});

describe('early end and scoring', () => {
  it('TV-6: made 8 after trick 11, hands revealed with 2 cards each', () => {
    const { state, rows } = atPlay({ bidder: 0, bid: 8, winners: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2] });
    let s = state;
    for (let k = 0; k < 10; k++) s = playRow(s, rows, k).state;
    expect(s.phase).toBe('TRICK_LOOP');
    const { state: end, events } = playRow(s, rows, 10);
    expect(events).toContainEqual({ t: 'roundDecided', outcome: 'MADE', afterTrick: 11 });
    expect(end.round!.result).toMatchObject({ outcome: 'MADE', delta: 8, tricksPlayed: 11 });
    const revealed = events.find((e) => e.t === 'handsRevealed');
    expect(revealed && revealed.t === 'handsRevealed' && Object.values(revealed.hands).map((h) => h.length)).toEqual([2, 2, 2, 2]);
    expect(end.ledger).toBe(8);
  });

  it('TV-7: contract 10 for B fails when A wins its 4th trick; ledger +20', () => {
    const { state, rows } = atPlay({ bidder: 1, bid: 10, winners: [0, 2, 0, 2] });
    const { state: end, events } = playOut(state, rows);
    expect(events).toContainEqual({ t: 'roundDecided', outcome: 'FAILED', afterTrick: 4 });
    expect(events).toContainEqual({ t: 'scored', team: 'B', delta: -20, ledger: 20 });
    expect(end.ledger).toBe(20);
  });

  it('TV-8: a 13 fails on the defenders’ first trick, −26', () => {
    const { state, rows } = atPlay({ bidder: 0, bid: 13, winners: [1] });
    const { state: end, events } = playOut(state, rows);
    expect(events).toContainEqual({ t: 'roundDecided', outcome: 'FAILED', afterTrick: 1 });
    expect(end.round!.result!.delta).toBe(-26);
    expect(end.ledger).toBe(-26);
  });

  it('TV-9: Kot wins the match whatever the ledger', () => {
    const { state, rows } = atPlay({ bidder: 1, bid: 13, ledger: 50, winners: Array(12).fill(1), lastWinner: 3 });
    const { state: end, events } = playOut(state, rows);
    expect(events).toContainEqual({ t: 'matchOver', winner: 'B', reason: 'KOT' });
    expect(end).toMatchObject({ phase: 'MATCH_END', winner: 'B', winReason: 'KOT', ledger: 50 });
    expect(end.round!.result).toMatchObject({ outcome: 'KOT', delta: 0, tricksPlayed: 13 });
  });

  it('TV-10: A wins on +61 because B failed', () => {
    const { state, rows } = atPlay({ bidder: 1, bid: 8, ledger: 45, winners: [0, 0, 0, 0, 0, 0] });
    const { state: end, events } = playOut(state, rows);
    expect(end.ledger).toBe(61);
    expect(events).toContainEqual({ t: 'matchOver', winner: 'A', reason: 'TARGET' });
  });

  it('TV-11: A wins on +54 by making 7', () => {
    const { state, rows } = atPlay({ bidder: 2, bid: 7, ledger: 47, winners: [2, 2, 0, 0, 2, 0, 0] });
    const { state: end } = playOut(state, rows);
    expect(end).toMatchObject({ ledger: 54, phase: 'MATCH_END', winner: 'A', winReason: 'TARGET' });
  });

  it('TV-12: ledger 0 after a round, the dealer stays', () => {
    const { state, rows } = atPlay({ dealer: 2, bidder: 0, bid: 7, ledger: -7, winners: Array(7).fill(0) });
    const { state: end, events } = playOut(state, rows);
    expect(end.ledger).toBe(0);
    expect(events).toContainEqual({ t: 'dealerStays', seat: 2 });
    expect(apply(end, { type: 'NEXT_ROUND' }).state.dealer).toBe(2);
  });

  it('extra tricks are worth nothing; the round stops at the bid', () => {
    const { state, rows } = atPlay({ bidder: 0, bid: 7, winners: Array(12).fill(0) });
    const { state: end } = playOut(state, rows);
    expect(end.round!.result).toMatchObject({ outcome: 'MADE', delta: 7, tricksPlayed: 7 });
  });
});

describe('play', () => {
  it('rejects cards not held, out of turn, and MATCH_OVER after the end', () => {
    const { state, rows } = atPlay({ bidder: 0, bid: 7, winners: [] });
    expect(code(() => apply(state, { type: 'PLAY_CARD', seat: 0, card: rows[0]![1] }))).toBe('CARD_NOT_IN_HAND');
    expect(code(() => apply(state, { type: 'PLAY_CARD', seat: 1, card: rows[0]![1] }))).toBe('NOT_YOUR_TURN');
    const led = apply(state, { type: 'PLAY_CARD', seat: 0, card: rows[0]![0] }).state; // A♥ led
    expect(code(() => apply(led, { type: 'PLAY_CARD', seat: 1, card: rows[11]![1] }))).toBe('MUST_FOLLOW_SUIT');
    const over = playOut(atPlay({ bidder: 0, bid: 7, ledger: 50, winners: Array(7).fill(0) }).state, rows).state;
    expect(over.phase).toBe('MATCH_END');
    expect(code(() => apply(over, { type: 'NEXT_ROUND' }))).toBe('MATCH_OVER');
  });

  it('emits cut for the first trump on a non-trump trick only', () => {
    // Seat 1 is void in hearts after trick 1 and holds spades (trump).
    const m = newMatch(DEFAULT_CONFIG, 'cut', 0);
    const s = run(m, [bid(1, 7), pass(2), pass(3), pass(0), { type: 'CHOOSE_TRUMP', seat: 1, suit: 'S' }]).state;
    const round = s.round!;
    round.hands = { 0: ['2H', '3S'], 1: ['4H', '5S'], 2: ['6D', '7S'], 3: ['8D', '9S'] };
    const rest = run(s, [
      { type: 'PLAY_CARD', seat: 1, card: '4H' }, { type: 'PLAY_CARD', seat: 2, card: '7S' },
      { type: 'PLAY_CARD', seat: 3, card: '9S' },
    ]);
    expect(rest.events.filter((e) => e.t === 'cut')).toEqual([{ t: 'cut', seat: 2, card: '7S' }]);
  });

  it('never changes its input, even when it throws', () => {
    const { state, rows } = atPlay({ bidder: 0, bid: 7, winners: [] });
    deepFreeze(state);
    const before = JSON.stringify(state);
    apply(state, { type: 'PLAY_CARD', seat: 0, card: rows[0]![0] });
    expect(() => apply(state, { type: 'PLAY_CARD', seat: 1, card: rows[0]![1] })).toThrow(RuleError);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('viewFor', () => {
  it('shows only your own cards until the round is decided, then reveals', () => {
    const { state, rows } = atPlay({ bidder: 0, bid: 7, winners: Array(7).fill(0) });
    const v = viewFor(state, 1);
    expect(v.hand).toHaveLength(13);
    expect(v.handCounts).toEqual({ 0: 13, 1: 13, 2: 13, 3: 13 });
    expect(v.revealedHands).toBeNull();
    expect(v.legal).toEqual([]);
    expect(viewFor(state, 0).legal).toHaveLength(13);
    const end = playOut(state, rows).state;
    expect(viewFor(end, 1).revealedHands![0]).toHaveLength(6);
  });
});
