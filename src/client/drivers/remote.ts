// RemoteDriver (GDD §10.5, §11.2): the GameRoom over a reconnecting WebSocket. Game
// updates go to the animation queue strictly in `seq` order; a gap asks for a fresh sync.
// The room (lobby, presence, holds and votes) is a separate store for the lobby and
// the table's presence UI. Moves are optimistic only in the UI: the driver sends one and
// waits for the update or the error.

import PartySocket from 'partysocket';
import { SEATS, type PlayerView, type Seat } from '../../engine/types';
import type { ClientMessage, ErrorCode, RoomView, ServerMessage } from '../../shared/protocol';
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
const HEARTBEAT_MS = 10_000;
const SILENT_MS = 25_000;

/** Close codes from the GameRoom (game-room.ts). */
const CLOSE: Record<number, ClosedReason> = { 4000: 'idle', 4001: 'unauthorized', 4004: 'notFound' };

function partySocket(code: string, query: () => Promise<Record<string, string>>): SocketLike {
  return new PartySocket({
    host: window.location.host,
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    party: 'game-room',
    room: code,
    query,
    // A move sent while offline is stale by the time the socket is back.
    maxEnqueuedMessages: 0,
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
  private beat: ReturnType<typeof setInterval> | null = null;
  private refusals = 0;
  private destroyed = false;

  constructor(opts: RemoteDriverOptions) {
    this.opts = opts;
    const query = async () => {
      const { token, name } = await opts.auth();
      return { token, name };
    };
    this.socket = (opts.socket ?? ((q) => partySocket(opts.code, q)))(query);
    this.socket.addEventListener('open', this.onOpen);
    this.socket.addEventListener('close', this.onClose);
    this.socket.addEventListener('message', this.onMessage);
    if (opts.heartbeat !== false) this.beat = setInterval(this.heartbeat, HEARTBEAT_MS);
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
  }

  // ---------------------------------------------------------------- GameDriver

  subscribe(cb: (u: DriverUpdate) => void): () => void {
    this.listeners.add(cb);
    if (this.last) {
      cb(this.last);
      // A later subscriber sees the current view without replaying old events.
      this.last = { ...this.last, events: [], animBudgetMs: 0 };
    }
    return () => { this.listeners.delete(cb); };
  }

  send(intent: ClientIntent): void {
    if (GAME.has(intent.type)) {
      // One move in flight; the update or an error releases the next.
      if (this.pending || this.snap.conn !== 'open') return;
      this.pending = true;
    }
    this.message(intent as ClientMessage);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.beat) clearInterval(this.beat);
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
    this.set({ conn: 'open', droppedAt: null });
  };

  private onClose = (e: { code?: number }) => {
    if (this.destroyed) return;
    this.pending = false;
    const reason = CLOSE[e.code ?? 0];
    if (reason === 'unauthorized' && this.refusals++ === 0) {
      // A refused token gets one retry as a new guest.
      this.opts.onUnauthorized?.();
    } else if (reason) {
      this.socket.close();
      this.set({ closed: reason });
      return;
    }
    if (this.snap.conn !== 'reconnecting') this.set({ conn: 'reconnecting', droppedAt: this.now() });
  };

  private onOnline = () => {
    if (!this.destroyed && this.socket.readyState !== OPEN) this.socket.reconnect();
  };

  private heartbeat = () => {
    if (this.destroyed || this.socket.readyState !== OPEN) return;
    const quiet = this.now() - this.lastHeard;
    if (quiet > SILENT_MS) this.socket.reconnect();
    else if (quiet > HEARTBEAT_MS) this.message({ type: 'ping' });
  };

  private onMessage = (e: { data?: unknown }) => {
    if (this.destroyed || typeof e.data !== 'string') return;
    let m: ServerMessage;
    try { m = JSON.parse(e.data) as ServerMessage; } catch { return; }
    this.lastHeard = this.now();
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
        this.push({ view: m.view, events: m.events, animBudgetMs: m.animBudgetMs });
        this.set({ skew: m.serverNow - this.now(), hasView: true });
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
        this.set({ error: { code: m.code, message: m.message, at: this.now() } });
        return;
      case 'pong':
        this.set({ skew: m.serverNow - this.now() });
        return;
      case 'closed':
        this.set({ closed: 'idle' });
        return;
    }
  }

  private push(u: Omit<DriverUpdate, 'players'>) {
    const update: DriverUpdate = { ...u, players: playersOf(u.view) };
    this.last = update;
    for (const cb of this.listeners) cb(update);
    if (this.listeners.size) this.last = { ...update, events: [], animBudgetMs: 0 };
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
