// GameRoom Durable Object (GDD §10.3): one per room code, the single source of truth for
// that room. A thin shell over `Room`: it verifies tokens, limits and parses messages,
// persists before it broadcasts, keeps one alarm on the earliest deadline and writes
// history to D1. Socket liveness lives here too: the runtime answers "ping" without
// waking the object, and a sweep drops sockets that have gone silent mid-match.

import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { randomSeed } from '../engine/rng';
import { cleanNickname } from '../shared/nickname';
import { parseClientMessage, type ServerMessage } from '../shared/protocol';
import { ONLINE } from '../shared/constants';
import { verifyToken } from './auth';
import { planAlarm, STALE_MS, wakeAt } from './alarm';
import { applyDbOps } from './db';
import { RateLimiter, payloadBytes } from './limits';
import { newRoomState, Room, type Effects, type RoomState } from './room';

/**
 * `sid` is this socket's own id. partysocket reuses `conn.id` on every reconnect of a page,
 * so it cannot tell an old socket from its replacement. `playerId` is null once the
 * socket is superseded or swept, so its late close changes nothing.
 */
interface ConnState { playerId: string | null; sid: string; seen: number }

/** More alarms than this in a minute is a scheduling bug: back off and log it. */
const STORM_ALARMS = 120;
const STORM_BACKOFF_MS = 30_000;

const deps = { now: () => Date.now(), randomSeed };

/** One JSON line per event, queryable in Workers Logs. */
function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...fields }));
}

export class GameRoom extends Server<Env> {
  static options = { hibernate: true };

  private room: Room | null = null;
  /** In memory only: a hibernation wake starts every socket with a full bucket. */
  private limits = new Map<string, RateLimiter>();
  /** Alarms in the current minute, for the storm breaker (in memory only). */
  private alarms = { since: 0, count: 0 };
  /** The alarm this object last set or saw fire; only compared with storage (`arm`). */
  private armedAt: number | null | undefined;
  /** The state last written, to skip writes that change nothing (rows written are billed). */
  private saved: string | null = null;

  async onStart() {
    // Answered by the runtime: pings never wake the object or bill a request.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    const saved = await this.ctx.storage.get<RoomState>('room');
    this.room = saved && !saved.closed ? new Room(saved, deps) : null;
    this.saved = this.room ? JSON.stringify(saved) : null;
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
    const sid = crypto.randomUUID();
    const q = (k: string) => url.searchParams.get(k);
    log('connect', {
      room: this.room?.state.code ?? null, conn: conn.id, sid, reason: q('reason'), attempt: q('attempt'),
      since: q('since'), seq: this.room?.state.seq ?? null, colo: (ctx.request.cf as { colo?: string } | undefined)?.colo ?? null,
    });
    const playerId = await verifyToken(q('token'), this.env.TOKEN_SECRET, Date.now());
    if (!playerId) return this.reject(conn, 'UNAUTHORIZED', 4001);
    if (!this.room || this.room.state.closed) return this.reject(conn, 'ROOM_NOT_FOUND', 4004);
    // The same page reconnected: its old socket is a half-open leftover. Detach it before
    // closing so its close cannot mark the player offline. Other tabs stay connected.
    for (const c of this.getConnections<ConnState>()) {
      if (c.state?.sid !== sid && c.id === conn.id && c.state?.playerId === playerId) {
        c.setState({ ...c.state, playerId: null });
        try { c.close(1000, 'superseded'); } catch { /* already closing */ }
      }
    }
    conn.setState({ playerId, sid, seen: Date.now() });
    const name = cleanNickname(q('name')) ?? 'Player';
    await this.run(this.room.connect(playerId, name));
  }

  async onMessage(conn: Connection<ConnState>, raw: WSMessage) {
    const st = conn.state;
    if (!st) return;
    conn.setState({ ...st, seen: Date.now() });
    // The runtime answers pings; this only runs if auto-response is not in place.
    if (raw === 'ping') return void this.sendRaw(conn, 'pong');
    const playerId = st.playerId;
    if (!playerId || !this.room) return;
    if (payloadBytes(raw) > ONLINE.maxPayloadBytes) return; // dropped (GDD §10.9)
    let limit = this.limits.get(st.sid);
    if (!limit) this.limits.set(st.sid, (limit = new RateLimiter()));
    if (!limit.take()) return this.send(conn, { type: 'error', code: 'RATE_LIMITED', message: 'Too many messages', refSeq: this.room.state.seq });
    const msg = typeof raw === 'string' ? parseClientMessage(raw) : null;
    if (!msg) return this.send(conn, { type: 'error', code: 'BAD_MESSAGE', message: 'Unknown message', refSeq: this.room.state.seq });
    await this.run(this.room.message(playerId, msg));
  }

  async onClose(conn: Connection<ConnState>, code: number, reason: string) {
    const st = conn.state;
    log('close', { room: this.room?.state.code ?? null, conn: conn.id, sid: st?.sid ?? null, player: st?.playerId ?? null, code, reason, quietMs: st ? Date.now() - this.lastSeen(conn) : null });
    if (st) this.limits.delete(st.sid);
    await this.drop(conn);
  }

  async onAlarm() {
    this.armedAt = null; // it just fired
    if (!this.room) return;
    const now = Date.now();
    if (now - this.alarms.since > 60_000) this.alarms = { since: now, count: 0 };
    this.alarms.count++;
    const due = this.room.stuck();
    if (due !== null && now - due > 1000) log('alarm_late', { room: this.room.state.code, lateMs: now - due });
    await this.sweep(now);
    if (this.room) await this.run(this.room.alarm());
  }

  // ---------------------------------------------------------------- liveness

  /** Last sign of life: the runtime's last auto-pong or our last message from it. */
  private lastSeen(conn: Connection<ConnState>): number {
    let pong = 0;
    try { pong = this.ctx.getWebSocketAutoResponseTimestamp(conn)?.getTime() ?? 0; } catch { /* not a hibernatable socket */ }
    return Math.max(pong, conn.state?.seen ?? 0);
  }

  /** Mid-match, a socket silent for `STALE_MS` is half-open: close it and run the disconnect. */
  private async sweep(now: number) {
    if (!this.room?.inMatch()) return;
    for (const c of this.getConnections<ConnState>()) {
      const st = c.state;
      if (!st?.playerId) continue;
      const quietMs = now - this.lastSeen(c);
      if (quietMs < STALE_MS) continue;
      log('sweep', { room: this.room.state.code, conn: c.id, sid: st.sid, player: st.playerId, quietMs });
      // A half-open socket never completes the close handshake, so `onClose` may not run.
      await this.drop(c);
      c.setState({ ...st, playerId: null });
      try { c.close(4100, 'stale'); } catch { /* already gone */ }
    }
  }

  /** This socket is gone; the player is offline unless another live socket of theirs remains. */
  private async drop(conn: Connection<ConnState>) {
    const st = conn.state;
    if (!st?.playerId || !this.room) return;
    for (const c of this.getConnections<ConnState>()) {
      if (c.state?.sid !== st.sid && c.state?.playerId === st.playerId && c.readyState === WebSocket.OPEN) return;
    }
    await this.run(this.room.disconnect(st.playerId));
  }

  /** A seated socket is open during a match: the sweep needs to run. */
  private watching(): boolean {
    if (!this.room?.inMatch()) return false;
    for (const c of this.getConnections<ConnState>()) if (c.state?.playerId) return true;
    return false;
  }

  // ---------------------------------------------------------------- effects

  /** Persist before broadcast (GDD §10.3), then send, re-arm and write history. */
  private async run(fx: Effects) {
    const room = this.room!;
    // Idle cleanup wipes the room; D1 keeps the code marked closed so it is never reused.
    if (fx.close) await this.ctx.storage.deleteAll();
    else await this.persist();
    const byPlayer = new Map<string, Connection<ConnState>[]>();
    for (const c of this.getConnections<ConnState>()) {
      const p = c.state?.playerId;
      if (p) byPlayer.set(p, [...(byPlayer.get(p) ?? []), c]);
    }
    for (const { to, msg } of fx.out) for (const c of byPlayer.get(to) ?? []) this.send(c, msg);
    for (const op of fx.db) {
      if (op.op === 'matchStart') log('game_started', { room: op.code, game: `${op.code}:${op.at}`, match: op.id });
      if (op.op === 'matchEnd') log('game_ended', { room: room.state.code, match: op.id, winner: op.winner, reason: op.reason });
    }
    if (fx.db.length) {
      this.ctx.waitUntil(applyDbOps(this.env.DB, fx.db).catch((e) => console.error('d1 write failed', e)));
    }
    if (fx.close) {
      log('room_closed', { room: room.state.code });
      for (const c of this.getConnections()) c.close(4000, 'room closed');
      this.room = null;
      this.saved = null;
      this.armedAt = null;
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const stuck = room.stuck();
    if (stuck !== null) log('wake_stuck', { room: room.state.code, lateMs: Date.now() - stuck });
    await this.arm();
  }

  /** Writes the room unless nothing changed since the last write (an early alarm, a ping). */
  private async persist() {
    const json = JSON.stringify(this.room!.state);
    if (json === this.saved) return;
    await this.ctx.storage.put('room', this.room!.state);
    this.saved = json;
  }

  /** One alarm: the room's earliest future deadline, or the next sweep. Never a past time. */
  private async arm() {
    const now = Date.now();
    let want = wakeAt(this.room?.nextAlarm() ?? null, this.watching(), now);
    if (want !== null && this.alarms.count > STORM_ALARMS && now - this.alarms.since <= 60_000) {
      log('alarm_storm', { room: this.room?.state.code ?? null, count: this.alarms.count });
      want = Math.max(want, now + STORM_BACKOFF_MS);
    }
    // Always ask storage (a read, not a billed write): trusting the cached time let a bot
    // move go unarmed in production until the next sweep, 25 s late. Log any disagreement.
    const stored = await this.ctx.storage.getAlarm();
    if (this.armedAt !== undefined && this.armedAt !== stored && !(this.armedAt !== null && this.armedAt <= now && stored === null)) {
      log('alarm_drift', { room: this.room?.state.code ?? null, cached: this.armedAt, stored, now });
    }
    this.armedAt = stored;
    const plan = planAlarm(this.armedAt, want, now);
    // 'none' leaves a past or absent alarm alone: one that already fired is gone.
    if (plan === 'keep' || plan === 'none') return;
    await this.ctx.storage.setAlarm(plan.set);
    this.armedAt = plan.set;
  }

  private send(conn: Connection, msg: ServerMessage) {
    this.sendRaw(conn, JSON.stringify(msg));
  }

  private sendRaw(conn: Connection, data: string) {
    try { conn.send(data); } catch { /* the socket is closing */ }
  }

  private reject(conn: Connection, code: 'UNAUTHORIZED' | 'ROOM_NOT_FOUND', close: number) {
    this.send(conn, { type: 'error', code, message: code, refSeq: 0 });
    conn.close(close, code);
  }
}
