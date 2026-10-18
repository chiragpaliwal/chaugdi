import { describe, expect, it } from 'vitest';
import type { PlayerView, Seat } from '../../engine/types';
import { feedbackFor, teamName, turnPrompt, type FeedbackContext } from './cues';
import { HAPTIC } from './haptics';

const names: Record<Seat, string> = { 0: 'You', 1: 'Ben', 2: 'Asha', 3: 'Dev' };
const ctx = (over: Partial<FeedbackContext['view']> = {}, scale = 1): FeedbackContext => ({
  view: { you: 0, contract: { seat: 1, team: 'B', bid: 8, forced: false }, trump: 'S', ...over },
  names,
  scale,
});

describe('feedbackFor', () => {
  it('names plays from your seat (HANDOFF §9 / GDD §14)', () => {
    expect(feedbackFor({ t: 'cardPlayed', seat: 3, card: 'QH' }, ctx()).say).toBe('Dev played Queen of hearts.');
    expect(feedbackFor({ t: 'cardPlayed', seat: 0, card: '4S' }, ctx()).say).toBe('You played 4 of spades, Hukum.');
    expect(feedbackFor({ t: 'roundStarted', roundNo: 2, dealer: 0 }, ctx()).say).toBe('Round 2. You deal.');
    expect(feedbackFor({ t: 'auctionWon', seat: 3, value: 7, forced: true }, ctx()).say).toBe('Everyone passed. Dev plays the compulsory 7.');
  });

  it('haptics follow GDD §12.4: your team’s tricks only, no haptic on plays', () => {
    expect(feedbackFor({ t: 'trickWon', seat: 2, team: 'A', trickNo: 3 }, ctx()).haptic).toBe(HAPTIC.trickOurs);
    expect(feedbackFor({ t: 'trickWon', seat: 1, team: 'B', trickNo: 3 }, ctx()).haptic).toBeUndefined();
    expect(feedbackFor({ t: 'cardPlayed', seat: 0, card: 'AC' }, ctx()).haptic).toBeUndefined();
  });

  it('the round result sounds good or bad for your team, not the bidder', () => {
    const made = feedbackFor({ t: 'roundDecided', outcome: 'MADE', afterTrick: 10 }, ctx());
    expect(made.cues.map((c) => c.cue)).toEqual(['failed']);
    expect(made.haptic).toBe(HAPTIC.failed);
    expect(made.say).toBe('Contract made. Ben & Dev made 8.');
    const broken = feedbackFor({ t: 'roundDecided', outcome: 'FAILED', afterTrick: 7 }, ctx());
    expect(broken.cues.map((c) => c.cue)).toEqual(['made']);
    expect(broken.haptic).toEqual(HAPTIC.made);
  });

  it('scores read as a change and a standing', () => {
    expect(feedbackFor({ t: 'scored', team: 'B', delta: -16, ledger: 4 }, ctx()).say).toBe('Ben & Dev lose 16. You & Asha lead by 4.');
    expect(feedbackFor({ t: 'scored', team: 'B', delta: 8, ledger: 0 }, ctx({ you: 1 })).say).toBe('You & Dev score 8. Level.');
  });

  it('Kot gets its fanfare and long buzz only for the winners', () => {
    const won = feedbackFor({ t: 'matchOver', winner: 'A', reason: 'KOT' }, ctx());
    expect(won.cues.map((c) => c.cue)).toEqual(['kot']);
    expect(won.haptic).toEqual(HAPTIC.kot);
    expect(won.say).toBe('Kot! You & Asha win the match.');
    expect(feedbackFor({ t: 'matchOver', winner: 'B', reason: 'KOT' }, ctx()).cues.map((c) => c.cue)).toEqual(['failed']);
  });

  it('delayed cues scale with motion speed', () => {
    const fast = feedbackFor({ t: 'trickWon', seat: 1, team: 'B', trickNo: 1 }, ctx({}, 0.7));
    expect(fast.cues[0]).toEqual({ cue: 'trickSweep', delayMs: 280 });
    expect(feedbackFor({ t: 'dealt', batch: 5, order: [1, 2, 3, 0] }, ctx()).cues).toHaveLength(20);
  });
});

describe('teamName', () => {
  it('puts you first, the other pair left then right', () => {
    expect(teamName('A', 0, names)).toBe('You & Asha');
    expect(teamName('B', 0, names)).toBe('Ben & Dev');
    const seated: Record<Seat, string> = { 0: 'Mira', 1: 'Ben', 2: 'Asha', 3: 'Dev' };
    expect(teamName('B', 3, seated)).toBe('You & Ben');
    expect(teamName('A', 3, seated)).toBe('Mira & Asha');
  });
});

describe('turnPrompt', () => {
  const v = (over: Partial<PlayerView>) => ({ you: 0, turn: 0, phase: 'TRICK_LOOP', current: null, ...over } as Pick<PlayerView, 'you' | 'turn' | 'phase' | 'current'>);
  it('prompts only on your turn', () => {
    expect(turnPrompt(v({ turn: 1 }))).toBeNull();
    expect(turnPrompt(v({ phase: 'BIDDING' }))).toBe('Your call. Bid or pass.');
    expect(turnPrompt(v({}))).toBe('Your lead.');
    expect(turnPrompt(v({ current: { leader: 3, plays: [{ seat: 3, card: '2C' }] } }))).toBe('Your turn.');
    expect(turnPrompt(v({ phase: 'ROUND_EVAL' }))).toBeNull();
  });
});
