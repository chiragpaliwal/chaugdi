// Online message protocol (GDD §10.5). Client messages are zod-validated by the GameRoom;
// server messages are typed here for the RemoteDriver. Client code imports types only,
// so zod stays out of the client bundle.

import { z } from 'zod';
import type { BotLevel } from '../engine/bots';
import type { CardId, GameEvent, PlayerView, Seat } from '../engine/types';
import type { MatchLength } from './constants';

const seat = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const card = z.string().regex(/^[2-9TJQKA][SHDC]$/).transform((c) => c as CardId);

/** Every client message may carry the last `seq` it applied; errors echo it as `refSeq`. */
const msg = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), seq: z.number().int().nonnegative().optional(), ...shape }).strict();

export const ClientMessage = z.discriminatedUnion('type', [
  // lobby
  msg('takeSeat', { seat }),
  msg('setReady', { ready: z.boolean() }),
  msg('hostSettings', {
    turnSeconds: z.union([z.literal(10), z.literal(20), z.literal(30)]).optional(),
    botLevel: z.enum(['easy', 'medium', 'hard']).optional(),
    matchLength: z.enum(['short', 'standard']).optional(),
  }),
  msg('fillBot', { seat }),
  msg('removeBot', { seat }),
  msg('swapTeams', { a: seat, b: seat }),
  msg('start', {}),
  msg('cancelStart', {}),
  msg('leave', {}),
  // play
  msg('bid', { value: z.number().int() }),
  msg('pass', {}),
  msg('chooseTrump', { suit: z.enum(['S', 'H', 'D', 'C']) }),
  msg('play', { card }),
  msg('continue', {}),
  msg('imBack', {}),
  /** Someone dropped on a held seat: wait 1 more minute, or let a bot play (screen 13). */
  msg('vote', { seat, choice: z.enum(['wait', 'bot']) }),
  msg('rematch', {}),
  msg('ping', { resync: z.boolean().optional() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;


export interface RoomSettings {
  turnSeconds: 10 | 20 | 30;
  botLevel: BotLevel;
  matchLength: MatchLength;
}

/**
 * Who acts for a seat. `held`: the player dropped and their turns wait (grace or vote);
 * `dropped`: the hold ran out and a bot plays until they reconnect; `afk`: two timeouts
 * in a row, a bot plays until `imBack`.
 */
export type SeatControl = 'human' | 'bot' | 'held' | 'dropped' | 'afk';

export interface RoomSeatView {
  name: string;
  isBot: boolean;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  control: SeatControl;
}

/** A dropped player's held seat and the vote on it (PauseVote). */
export interface HoldView {
  seat: Seat;
  /** Epoch ms when a bot takes over unless the vote extends it. */
  until: number;
  /** Connected humans who can vote (everyone seated but the dropped player). */
  voters: number;
  votes: { wait: number; bot: number };
  yourVote: 'wait' | 'bot' | null;
}

export type RoomStatus = 'lobby' | 'starting' | 'playing' | 'over';

/** The room as one player sees it (GDD `LobbyView`). */
export interface RoomView {
  code: string;
  status: RoomStatus;
  /** Your seat, or null while you are watching without one. */
  you: Seat | null;
  seats: Record<Seat, RoomSeatView | null>;
  settings: RoomSettings;
  /** Epoch ms when the countdown deals (status `starting`). */
  startingAt: number | null;
  /** Held seats during a match (only seats whose player dropped). */
  holds: HoldView[];
  /** Seats whose player tapped Continue on this round summary. */
  continued: Seat[];
}

export type ErrorCode =
  | 'BAD_MESSAGE' | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'ROOM_NOT_FOUND'
  | 'NOT_HOST' | 'NOT_SEATED' | 'SEAT_TAKEN' | 'NOT_READY' | 'NOT_BOT_CONTROLLED' | 'VOTE_CLOSED'
  | 'WRONG_PHASE' | 'NOT_YOUR_TURN' | 'BID_OUT_OF_RANGE' | 'BID_NOT_HIGHER' | 'OPENER_MUST_BID'
  | 'NOT_CONTRACT_HOLDER' | 'CARD_NOT_IN_HAND' | 'MUST_FOLLOW_SUIT' | 'MATCH_OVER';

/** `serverNow` lets the client correct for clock skew before showing `turnDeadline`. */
export type ServerMessage =
  | { type: 'sync'; room: RoomView; view: PlayerView | null; seq: number; serverNow: number }
  /**
   * `offsetMs`: a bot move the server played ahead (one alarm for a run of bot moves). The
   * client starts it this long after the update arrives, as if it had arrived then.
   */
  | { type: 'update'; seq: number; view: PlayerView; events: GameEvent[]; animBudgetMs: number; serverNow: number; offsetMs?: number }
  | { type: 'lobby'; room: RoomView; serverNow: number }
  | { type: 'error'; code: ErrorCode; message: string; refSeq: number }
  | { type: 'presence'; seat: Seat; connected: boolean; isBot: boolean; control: SeatControl }
  | { type: 'pong'; serverNow: number }
  | { type: 'closed'; reason: 'idle' };

/** Parses one raw socket message; null when it is not valid JSON or not a known message. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  const r = ClientMessage.safeParse(data);
  return r.success ? r.data : null;
}
