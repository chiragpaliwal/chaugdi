import type { Team } from '../../engine/types';
import { ONLINE } from '../../shared/constants';

export interface PauseVoteView {
  name: string;
  team: Team;
  /** Seconds left on the held turn. */
  secondsLeft: number;
  /** Connected humans who can vote (the disconnected player cannot). */
  voters: number;
  votes: { wait: number; bot: number };
  yourVote: 'wait' | 'bot' | null;
}

/** The extension vote opens only when 30 s or less are left (seconds; the GameRoom enforces it). */
export const EXTEND_OPENS_AT = ONLINE.extendOpensMs / 1000;
export const EXTEND_BY = ONLINE.extendByMs / 1000;

export const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

/**
 * Someone else dropped on their turn (13, other players' view; not in the designs).
 * A majority of human votes adds a minute; otherwise a bot plays their turns until they rejoin.
 */
export function PauseVote({ v, onVote }: { v: PauseVoteView; onVote?: (choice: 'wait' | 'bot') => void }) {
  const canExtend = v.secondsLeft <= EXTEND_OPENS_AT;
  const voted = v.votes.wait + v.votes.bot;
  const need = Math.floor(v.voters / 2) + 1;
  return (
    <section className="vote" role="status" aria-live="polite" aria-label={`${v.name} is reconnecting`}>
      <div className="hd">
        <span className={`bi ${v.team}`} aria-hidden="true">{v.name.charAt(0)}</span>
        <span><b>{v.name} is reconnecting.</b> {v.name}’s turn is held.</span>
        <span className="r" aria-label={`${v.secondsLeft} seconds left`}>{clock(v.secondsLeft)}</span>
      </div>
      <div className="opts" role="radiogroup" aria-label={`Wait for ${v.name} or let a bot play`}>
        <button role="radio" aria-checked={v.yourVote === 'wait'} className={v.yourVote === 'wait' ? 'on' : ''}
          aria-disabled={!canExtend || undefined} onClick={() => canExtend && onVote?.('wait')}>
          {canExtend ? 'Wait 1 more minute' : `Wait · opens at ${clock(EXTEND_OPENS_AT)}`}
        </button>
        <button role="radio" aria-checked={v.yourVote === 'bot'} className={v.yourVote === 'bot' ? 'on' : ''} onClick={() => onVote?.('bot')}>
          Let a bot play
        </button>
      </div>
      <span className="tally">{voted} of {v.voters} voted · {need} {need === 1 ? 'vote' : 'votes'} decide{need === 1 ? 's' : ''}</span>
    </section>
  );
}
