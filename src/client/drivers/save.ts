// Solo auto-save (GDD §4.1). Every read and write is guarded; a bad save means a new match.

import type { BotLevel } from '../../engine/bots';
import type { MatchState, Team } from '../../engine/types';
import type { Players } from './types';

export interface SoloSave {
  v: 1;
  state: MatchState;
  players: Players;
  level: BotLevel;
  /** Bumped on every action; seeds bot decisions so a resumed match replays the same way. */
  seq: number;
}

/** The last finished match, for the Home footer. */
export interface LastResult { team: Team; names: string; value: number }

const SOLO_KEY = 'chaugadi.solo.v1';
const LAST_KEY = 'chaugadi.solo.last.v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: the match lives for this tab only
  }
}

const PHASES = ['BIDDING', 'TRUMP_SELECTION', 'TRICK_LOOP', 'ROUND_EVAL', 'MATCH_END'];

export function loadSolo(): SoloSave | null {
  const s = read<SoloSave>(SOLO_KEY);
  if (!s || s.v !== 1 || !s.state || !PHASES.includes(s.state.phase) || !s.players?.names || !s.state.round) return null;
  return s;
}

export const saveSolo = (s: SoloSave | null) => write(SOLO_KEY, s);
export const loadLastResult = () => read<LastResult>(LAST_KEY);
export const saveLastResult = (r: LastResult) => write(LAST_KEY, r);
