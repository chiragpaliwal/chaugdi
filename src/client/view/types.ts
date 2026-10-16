// Presentational view model (HANDOFF §10), using the engine's card ids.
// A toTableView(PlayerView) adapter will produce this once the engine exists.

import type { CardId, Suit, Team } from '../../engine/types';
import type { ViewSeat } from '../table/geometry';

export type TagTone = 'hot' | 'mute' | 'ok' | 'bad';

/** Top-right corner badge on the avatar. */
export type SeatBadge =
  | { kind: 'call'; value: number }   // bid call, white
  | { kind: 'wait' }                  // "…" amber on surface
  | { kind: 'sar'; value: number }    // Sar count
  | { kind: 'pending'; value: number } // your unsent bid, amber

export interface SeatView {
  seat: ViewSeat;
  name: string;
  team: Team;
  isMe: boolean;
  isBot: boolean;
  connected: boolean;
  handCount: number | null;
  isDealer: boolean;
  /** Bid shown as the "BID 8" pill on the contract holder. */
  bidderBid: number | null;
  /** 0..100, percent of the turn left, while it is their turn. */
  turnProgress: number | null;
  badge?: SeatBadge;
  tag?: { text: string; tone?: TagTone };
  /** Speech marker (chat feature only). */
  hasMessage?: boolean;
  /** Blue flash ring and "+1" while their trick sweeps in (12). */
  wonTrick?: boolean;
}

export interface TrickPlayView {
  card: CardId;
  led?: boolean;
  cut?: boolean;
  winning?: boolean;
}

export interface TrickView {
  plays: Partial<Record<ViewSeat, TrickPlayView>>;
  /** Empty slot states: your dashed slot, or another player's breathing outline. */
  yourSlot?: boolean;
  thinkingSeat?: ViewSeat;
  hukum: Suit | null;
  /**
   * Trick sweeping to the winner (12): each card moves this fraction of the way to
   * `target`, with an outline left where it was. Step 6 animates progress 0 → 1.
   */
  sweep?: { target: { x: number; y: number }; progress: Partial<Record<ViewSeat, number>> };
}

export interface RaceView {
  toMake: number;
  toBreak: number;
  bidderTeam: Team;
  line: string;
  /** 13 entries: trick winners so far, then the current trick, then future. */
  history: (Team | 'now' | null)[];
  aria?: string;
}
