// GameRoom Durable Object (GDD §10.3): one per room code, the single source of truth for
// that room. A thin shell over `Room`: it verifies tokens, limits and parses messages,
// persists before it broadcasts, keeps one alarm on the earliest deadline and writes
// history to D1.

import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { randomSeed } from '../engine/rng';
import { cleanNickname } from '../shared/nickname';
import { parseClientMessage, type ServerMessage } from '../shared/protocol';
import { ONLINE } from '../shared/constants';
import { verifyToken } from './auth';
import { applyDbOps } from './db';
import { RateLimiter, payloadBytes } from './limits';
import { newRoomState, Room, type Effects, type RoomState } from './room';

interface ConnState { playerId: string }

const deps = { now: () => Date.now(), randomSeed };

export class GameRoom extends Server<Env> {
  static options = { hibernate: true };

  private room: Room | null = null;
  /** In memory only: a hibernation wake starts every socket with a full bucket. */
  private limits = new Map<string, RateLimiter>();

  async onStart() {
    const saved = await this.ctx.storage.get<RoomState>('room');
    this.room = saved && !saved.closed ? new Room(saved, deps) : null;
  }

  /** Called by POST /api/rooms. False when this code already has a room. */
  async init(code: string, hostId: string): Promise<boolean> {
    if (this.room) return false;
    this.room = new Room(newRoomState(code, hostId, Date.now()), deps);
    await this.persist();
    await this.arm();
    return true;
  }

  /** Called by GET /api/rooms/:code. */
  async info() {
    return this.room ? this.room.info() : null;
  }

  async onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const playerId = await verifyToken(url.searchParams.get('token'), this.env.TOKEN_SECRET, Date.now());
    if (!playerId) return this.reject(conn, 'UNAUTHORIZED', 4001);
    if (!this.room || this.room.state.closed) return this.reject(conn, 'ROOM_NOT_FOUND', 4004);
    conn.setState({ playerId });
    const name = cleanNickname(url.searchParams.get('name')) ?? 'Player';
    await this.run(this.room.connect(playerId, name));
  }

  async onMessage(conn: Connection<ConnState>, raw: WSMessage) {
    const playerId = conn.state?.playerId;
    if (!playerId || !this.room) return;
    if (payloadBytes(raw) > ONLINE.maxPayloadBytes) return; // dropped (GDD §10.9)
    let limit = this.limits.get(conn.id);
    if (!limit) this.limits.set(conn.id, (limit = new RateLimiter()));
    if (!limit.take()) return this.send(conn, { type: 'error', code: 'RATE_LIMITED', message: 'Too many messages', refSeq: this.room.state.seq });
    const msg = typeof raw === 'string' ? parseClientMessage(raw) : null;
    if (!msg) return this.send(conn, { type: 'error', code: 'BAD_MESSAGE', message: 'Unknown message', refSeq: this.room.state.seq });
    await this.run(this.room.message(playerId, msg));
  }

  async onClose(conn: Connection<ConnState>) {
    this.limits.delete(conn.id);
    const playerId = conn.state?.playerId;
    if (!playerId || !this.room) return;
    // Another tab of the same player keeps them connected.
    for (const c of this.getConnections<ConnState>()) {
      if (c.id !== conn.id && c.state?.playerId === playerId && c.readyState === WebSocket.OPEN) return;
    }
    await this.run(this.room.disconnect(playerId));
  }

  async onAlarm() {
    if (this.room) await this.run(this.room.alarm());
  }

  /** Persist before broadcast (GDD §10.3), then send, re-arm and write history. */
  private async run(fx: Effects) {
    // Idle cleanup wipes the room; D1 keeps the code marked closed so it is never reused.
    if (fx.close) await this.ctx.storage.deleteAll();
    else await this.persist();
    const byPlayer = new Map<string, Connection<ConnState>[]>();
    for (const c of this.getConnections<ConnState>()) {
      const p = c.state?.playerId;
      if (p) byPlayer.set(p, [...(byPlayer.get(p) ?? []), c]);
    }
    for (const { to, msg } of fx.out) for (const c of byPlayer.get(to) ?? []) this.send(c, msg);
    if (fx.db.length) {
      this.ctx.waitUntil(applyDbOps(this.env.DB, fx.db).catch((e) => console.error('d1 write failed', e)));
    }
    if (fx.close) {
      for (const c of this.getConnections()) c.close(4000, 'room closed');
      this.room = null;
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.arm();
  }

  private async persist() {
    await this.ctx.storage.put('room', this.room!.state);
  }

  private async arm() {
    const at = this.room?.nextAlarm() ?? null;
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 1));
  }

  private send(conn: Connection, msg: ServerMessage) {
    try { conn.send(JSON.stringify(msg)); } catch { /* the socket is closing */ }
  }

  private reject(conn: Connection, code: 'UNAUTHORIZED' | 'ROOM_NOT_FOUND', close: number) {
    this.send(conn, { type: 'error', code, message: code, refSeq: 0 });
    conn.close(close, code);
  }
}
