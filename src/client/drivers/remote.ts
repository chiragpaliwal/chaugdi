// RemoteDriver (GDD §10.5, §11.2): the GameRoom over a reconnecting WebSocket. Game
// updates go to the animation queue strictly in `seq` order; a gap asks for a fresh sync.
// The room (lobby, presence, holds and votes) is a separate store for the lobby and
// the table's presence UI. Moves are optimistic only in the UI: the driver sends one and
// waits for the update or the error.

import PartySocket from 'partysocket';
import { SEATS, type PlayerView, type Seat } from '../../engine/types';
import type { ClientMessage, ErrorCode, RoomView, ServerMessage } from '../../shared/protocol';
import { MOTION } from '../../shared/constants';
import type { ClientIntent, DriverUpdate, GameDriver, Players } from './types';

export type ConnState = 'connecting' | 'open' | 'reconnecting';

/** Why the room is gone for this client. */
export type ClosedReason = 'idle' | 'notFound' | 'unauthorized' | 'left';

export interface RoomSnapshot {
  conn: ConnState;
  room: RoomView | null;
  /** serverNow − Date.now(): subtract from server times to get client times. */
  skew: number;
  /** Client time the socket dropped, while it is reconnecting. */
  droppedAt: number | null;
  closed: ClosedReason | null;
  /** The last rejected action. */
  error: { code: ErrorCode; message: string; at: number } | null;
  /** A game view has arrived: the table can show. */
  hasView: boolean;
}

/** The part of a WebSocket the driver uses, so tests can pass a fake. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  reconnect(): void;
  addEventListener(type: 'open' | 'close' | 'message', fn: (e: { data?: unknown; code?: number }) => void): void;
}

export interface RemoteDriverOptions {
  code: string;
  /** Token and nickname for each (re)connect. */
  auth: () => Promise<{ token: string; name: string }>;
  /** The token was refused; forget it so `auth` makes a new guest. */
  onUnauthorized?: () => void;
  socket?: (query: () => Promise<Record<string, string>>) => SocketLike;
  now?: () => number;
  /** Ping while idle and reconnect a silent socket (mobile networks). Off in tests. */
  heartbeat?: boolean;
}

const OPEN = 1;
const GAME = new Set(['bid', 'pass', 'chooseTrump', 'play']);

/**
 * Heartbeat (docs/MULTIPLAYER_LESSONS.md §2). The runtime answers the raw "ping" without
 * waking the room. Pings never wait for pongs: on a phone in Wi-Fi power-save, incoming
 * frames are held until the phone sends something, so the next ping is what releases them.
 */
export const HEARTBEAT = {
  /** Ping interval while the table is visible, and while the tab is hidden. */
  visibleMs: 1_000,
  hiddenMs: 10_000,
  /** A ping this long after each of our own messages pulls in the reply. */
  nudgeMs: 250,
  /** Dead only after this many unanswered pings and this long with nothing received. */
  misses: 3,
  silentMs: 8_000,
} as const;

/**
 * Stall watchdog. The room acts on its own timers (a bot's move, a turn running out, the
 * summary countdown) through one alarm, and the raw pings never wake it. If that alarm is
 * missed, the table waits for the next 30 s sweep: this happened in production. A JSON
 * ping wakes the room, which runs every timer that is due.
 */
export const WATCHDOG = {
  /** Longest bot think time (thinkTimeMs: 450 + 500 + 400). */
  botThinkMs: 1_500,
  /** How late the room's update may be before we wake it, and how often we retry. */
  slackMs: 3_000,
  retryMs: 5_000,
} as const;

/**
 * Close codes from the GameRoom (game-room.ts). These are final; any other code retries,
 * including 1000 `superseded` (an old socket of this page) and 4100 `stale` (the server
 * swept a silent socket).
 */
const CLOSE: Record<number, ClosedReason> = { 4000: 'idle', 4001: 'unauthorized', 4004: 'notFound' };

/** Why this connect happens, sent as a query param for the server's `connect` log. */
type ConnectReason = 'initial' | 'heartbeat' | 'online' | 'refused' | `close-${number}`;

function partySocket(code: string, query: () => Promise<Record<string, string>>): SocketLike {
  return new PartySocket({
    host: window.location.host,
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    party: 'game-room',
    room: code,
    query,
    // A move sent while offline is stale by the time the socket is back.
    maxEnqueuedMessages: 0,
    // The defaults (3 s → 10 s backoff, 5 s uptime, 4 s connect) suit servers, not phones:
    // every blip became seconds of "Reconnecting". Far colos and weak Wi-Fi need 8 s to connect.
    maxRetries: Infinity,
    minReconnectionDelay: 250,
    maxReconnectionDelay: 3_000,
    reconnectionDelayGrowFactor: 1.5,
    minUptime: 2_000,
    connectionTimeout: 8_000,
  }) as unknown as SocketLike;
}

export class RemoteDriver implements GameDriver {
  private readonly opts: RemoteDriverOptions;
  private socket: SocketLike;
  private seq = 0;
  private last: DriverUpdate | null = null;
  private pending = false;
  private listeners = new Set<(u: DriverUpdate) => void>();
  private watchers = new Set<() => void>();
  private snap: RoomSnapshot = { conn: 'connecting', room: null, skew: 0, droppedAt: null, closed: null, error: null, hasView: false };
  private lastHeard = 0;
  private lastPing = 0;
  /** Pings sent since we last heard anything. */
  private misses = 0;
  private beat: ReturnType<typeof setInterval> | null = null;
  private nudge: ReturnType<typeof setTimeout> | null = null;
  /** When the room's next update is overdue (see `WATCHDOG`); null when nothing is owed. */
  private overdueAt: number | null = null;
  private reason: ConnectReason = 'initial';
  /** Connect attempts since the last open. */
  private attempt = 0;
  private refusals = 0;
  private destroyed = false;

  constructor(opts: RemoteDriverOptions) {
    this.opts = opts;
    // Called on every (re)connect, so the params are fresh each time.
    const query = async () => {
      const { token, name } = await opts.auth();
      this.attempt++;
      return { token, name, reason: this.reason, attempt: String(this.attempt), since: String(this.seq) };
    };
    this.socket = (opts.socket ?? ((q) => partySocket(opts.code, q)))(query);
    this.socket.addEventListener('open', this.onOpen);
    this.socket.addEventListener('close', this.onClose);
    this.socket.addEventListener('message', this.onMessage);
    if (opts.heartbeat !== false) {
      // Its own timer, never driven by incoming traffic: the server only hears us through it.
      this.beat = setInterval(this.heartbeat, HEARTBEAT.visibleMs);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible);
    }
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
  }

  // ---------------------------------------------------------------- GameDriver

  subscribe(cb: (u: DriverUpdate) => void): () => void {
    this.listeners.add(cb);
    if (this.last) {
      cb(this.last);
      // A later subscriber sees the current view without replaying old events.
      this.last = { ...this.last, events: [], animBudgetMs: 0, offsetMs: 0 };
    }
    return () => { this.listeners.delete(cb); };
  }

  send(intent: ClientIntent): void {
    if (GAME.has(intent.type)) {
      // One move in flight; the update or an error releases the next.
      if (this.pending || this.snap.conn !== 'open') return;
      this.pending = true;
    }
    // A probe right after a move pulls the server's reply in at once.
    if (this.message(intent as ClientMessage) && GAME.has(intent.type) && this.beat) this.ping();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.beat) clearInterval(this.beat);
    if (this.nudge) clearTimeout(this.nudge);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
    this.socket.close(1000, 'bye');
    this.listeners.clear();
    this.watchers.clear();
  }

  // ---------------------------------------------------------------- room store

  watch = (cb: () => void) => {
    this.watchers.add(cb);
    return () => { this.watchers.delete(cb); };
  };

  getRoom = (): RoomSnapshot => this.snap;

  /** Any client message: lobby actions, votes, `imBack`, `leave`. Dropped while offline. */
  message(m: ClientMessage): boolean {
    if (this.destroyed || this.socket.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify({ ...m, seq: this.seq }));
    if (this.beat && !this.nudge) {
      this.nudge = setTimeout(() => { this.nudge = null; this.ping(); }, HEARTBEAT.nudgeMs);
    }
    return true;
  }

  /** Leave the room for good (GDD `leave`): in a lobby the seat frees, in a match a bot takes it. */
  leave(): void {
    this.message({ type: 'leave' });
    this.set({ closed: 'left' });
    this.destroy();
  }

  /** Client epoch ms for a server epoch ms. */
  local(serverMs: number): number { return serverMs - this.snap.skew; }

  // ---------------------------------------------------------------- socket

  private now() { return this.opts.now?.() ?? Date.now(); }

  private set(patch: Partial<RoomSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const cb of this.watchers) cb();
  }

  private onOpen = () => {
    this.lastHeard = this.now();
    this.misses = 0;
    this.attempt = 0;
    this.set({ conn: 'open', droppedAt: null });
  };

  private onClose = (e: { code?: number }) => {
    if (this.destroyed) return;
    this.pending = false;
    // partysocket's own closes (from `reconnect()`) carry no numeric code: keep our reason.
    if (typeof e.code === 'number') this.reason = `close-${e.code}`;
    const reason = CLOSE[e.code ?? 0];
    if (reason && this.refuse(reason)) return;
    if (this.snap.conn !== 'reconnecting') this.set({ conn: 'reconnecting', droppedAt: this.now() });
  };

  /**
   * The server refused this socket. True when that is final; a refused token gets one
   * retry as a new guest. `reconnect` forces that retry when the refusal came as a message
   * (the close that follows it can be slow to arrive).
   */
  private refuse(reason: ClosedReason, reconnect = false): boolean {
    if (reason === 'unauthorized' && this.refusals++ === 0) {
      this.opts.onUnauthorized?.();
      if (reconnect) {
        this.reason = 'refused';
        this.socket.reconnect();
      }
      return false;
    }
    this.socket.close();
    this.set({ closed: reason });
    return true;
  }

  private onOnline = () => {
    if (this.destroyed) return;
    if (this.socket.readyState !== OPEN) {
      this.reason = 'online';
      this.socket.reconnect();
    } else {
      this.ping();
    }
  };

  private onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') this.ping();
  };

  /** A raw "ping": the runtime answers "pong" without waking the room. */
  private ping() {
    if (this.destroyed || this.socket.readyState !== OPEN) return;
    this.socket.send('ping');
    this.lastPing = this.now();
    this.misses++;
  }

  /** Runs every second: pings on schedule, and reconnects a socket that has gone dead. */
  heartbeat = () => {
    if (this.destroyed || this.socket.readyState !== OPEN) return;
    const now = this.now();
    if (this.misses >= HEARTBEAT.misses && now - this.lastHeard > HEARTBEAT.silentMs) {
      // Half-open: the server resends the full state when we join again.
      this.misses = 0;
      this.reason = 'heartbeat';
      this.socket.reconnect();
      return;
    }
    if (this.overdueAt !== null && now >= this.overdueAt) {
      this.overdueAt = now + WATCHDOG.retryMs;
      this.message({ type: 'ping' });
    }
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const every = hidden ? HEARTBEAT.hiddenMs : HEARTBEAT.visibleMs;
    // Small slack: interval timers drift a few ms.
    if (now - this.lastPing >= every - 50) this.ping();
  };

  private onMessage = (e: { data?: unknown }) => {
    if (this.destroyed || typeof e.data !== 'string') return;
    this.lastHeard = this.now();
    this.misses = 0;
    if (e.data === 'pong') return;
    let m: ServerMessage;
    try { m = JSON.parse(e.data) as ServerMessage; } catch { return; }
    this.receive(m);
  };

  /** Handles one server message (public for tests). */
  receive(m: ServerMessage): void {
    switch (m.type) {
      case 'sync': {
        this.refusals = 0;
        this.seq = m.seq;
        this.pending = false;
        const skew = m.serverNow - this.now();
        if (m.view) this.push({ view: m.view, events: [], animBudgetMs: 0 });
        this.set({ room: m.room, skew, hasView: this.snap.hasView || !!m.view });
        this.expect(m.view, 0);
        return;
      }
      case 'update': {
        if (m.seq <= this.seq) return;
        if (m.seq > this.seq + 1) {
          // Missed an update: ask for the full snapshot and skip until it arrives.
          this.message({ type: 'ping', resync: true });
          return;
        }
        this.seq = m.seq;
        this.pending = false;
        this.push({ view: m.view, events: m.events, animBudgetMs: m.animBudgetMs, ...(m.offsetMs ? { offsetMs: m.offsetMs } : {}) });
        this.set({ skew: m.serverNow - this.now(), hasView: true });
        this.expect(m.view, (m.offsetMs ?? 0) + m.animBudgetMs);
        return;
      }
      case 'lobby':
        this.set({ room: m.room, skew: m.serverNow - this.now() });
        return;
      case 'presence': {
        const room = this.snap.room;
        const seat = room?.seats[m.seat];
        if (!room || !seat) return;
        this.set({ room: { ...room, seats: { ...room.seats, [m.seat]: { ...seat, connected: m.connected, control: m.control } } } });
        return;
      }
      case 'error':
        this.pending = false;
        // The server sends these just before it closes the socket: act on them at once.
        if (m.code === 'ROOM_NOT_FOUND') { this.refuse('notFound'); return; }
        if (m.code === 'UNAUTHORIZED') { this.refuse('unauthorized', true); return; }
        this.set({ error: { code: m.code, message: m.message, at: this.now() } });
        return;
      case 'pong':
        // The JSON pong answers a resync ping; the heartbeat's raw pong never gets here.
        this.set({ skew: m.serverNow - this.now() });
        return;
      case 'closed':
        this.set({ closed: 'idle' });
        return;
    }
  }

  /**
   * When the room owes us the update after `view`: a bot's move, the end of a human's turn
   * timer or of the round summary, plus slack. `startMs`: when this update's animations
   * start (its offset) plus how long they run. A held seat's turn owes nothing.
   */
  private expect(view: PlayerView | null, startMs: number) {
    const now = this.now();
    let at: number | null = null;
    if (view?.phase === 'ROUND_EVAL') at = now + startMs + MOTION.summarySeconds * 1000;
    else if (view && view.phase !== 'LOBBY' && view.phase !== 'MATCH_END' && view.turn !== null) {
      if (view.players?.[view.turn]?.isBot) at = now + startMs + WATCHDOG.botThinkMs;
      else if (view.turnDeadline != null) at = this.local(view.turnDeadline);
    }
    this.overdueAt = at === null ? null : at + WATCHDOG.slackMs;
  }

  private push(u: Omit<DriverUpdate, 'players'>) {
    const update: DriverUpdate = { ...u, players: playersOf(u.view) };
    this.last = update;
    for (const cb of this.listeners) cb(update);
    if (this.listeners.size) this.last = { ...update, events: [], animBudgetMs: 0, offsetMs: 0 };
  }
}

/** Names and bot flags from the server's view; you are "You", as in solo play. */
export function playersOf(view: PlayerView): Players {
  const names = {} as Record<Seat, string>;
  const isBot = {} as Record<Seat, boolean>;
  for (const s of SEATS) {
    const p = view.players?.[s];
    names[s] = s === view.you ? 'You' : p?.name || `Seat ${s + 1}`;
    isBot[s] = !!p?.isBot;
  }
  return { names, isBot };
}
