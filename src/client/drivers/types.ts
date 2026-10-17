// Driver abstraction (GDD §11.2): the UI is the same for solo and online play.

import type { Intent } from '../../engine/bots';
import type { GameEvent, PlayerView, Seat } from '../../engine/types';

/**
 * `continue` leaves the round summary. `rematch` is not in GDD §11.2: it starts a new
 * match with the same seats once the match is over (GDD §4.2).
 */
export type ClientIntent = Intent | { type: 'continue' } | { type: 'rematch' };

export interface Players { names: Record<Seat, string>; isBot: Record<Seat, boolean> }

export interface DriverUpdate {
  view: PlayerView;
  events: GameEvent[];
  animBudgetMs: number;
  players: Players;
}

export interface GameDriver {
  subscribe(cb: (u: DriverUpdate) => void): () => void;
  send(intent: ClientIntent): void;
  destroy(): void;
}
