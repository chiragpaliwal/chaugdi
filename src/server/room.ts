// The room logic behind the GameRoom Durable Object (GDD §10.3, §10.6). It owns the lobby,
// the authoritative MatchState, pacing and every timer. It has no Cloudflare APIs: the
// clock and randomness are injected, and it returns messages and D1 writes as effects,
// so tests drive it with a fake clock.

import { botName, decide, intentToAction, thinkTimeMs, type Intent } from '../engine/bots';
import { apply, createLobby, legalActions, type Applied } from '../engine/reducer';
import { rngFrom } from '../engine/rng';
import { viewFor } from '../engine/view';
import {
  DEFAULT_CONFIG, RuleError, SEATS, teamOf,
  type GameEvent, type MatchState, type PlayerView, type RoundResult, type Seat, type Team, type WinReason,
} from '../engine/types';
import { animBudgetMs, MOTION, ONLINE, TARGET_SCORE } from '../shared/constants';
import type {
  ClientMessage, ErrorCode, HoldView, RoomSeatView, RoomSettings, RoomStatus, RoomView, SeatControl, ServerMessage,
} from '../shared/protocol';

/** Hard bots on the server: a fixed sample count, because the Workers clock stands still during CPU work. */
export const SERVER_BOT = { samples: 60, bidSamples: 100 };

export interface SeatState {
  /** null for a bot the host added. */
  playerId: string | null;
  name: string;
  isBot: boolean;
  ready: boolean;
  afkStrikes: number;
  /** Two timeouts in a row: a bot plays until `imBack` (or any move of their own). */
  afk: boolean;
  /** The hold ran out: a bot plays until they reconnect. */
  dropped: boolean;
}

/** A seated human who lost their connection. During a match their turns wait until `until`. */
export interface Away {
  until: number;
  votes: Record<string, 'wait' | 'bot'>;
}

export interface RoomState {
  v: 1;
  code: string;
  hostId: string | null;
  createdAt: number;
  settings: RoomSettings;
  seats: (SeatState | null)[];
  /** Player ids with at least one open connection. */
  online: string[];
  match: MatchState | null;
  matchId: string | null;
  /** View version: bumped on every update a player receives. */
  seq: number;
  startingAt: number | null;
  turnDeadline: number | null;
  botMoveAt: number | null;
  continueAt: number | null;
  /** Players who tapped Continue on this round summary. */
  continued: string[];
  away: (Away | null)[];
  idleCleanupAt: number | null;
  closed: boolean;
}

export type DbOp =
  | { op: 'roomStatus'; code: string; status: 'open' | 'playing' | 'closed' }
  | { op: 'matchStart'; id: string; code: string; seed: string; at: number; players: { seat: Seat; playerId: string | null; name: string; isBot: boolean; team: Team }[] }
  | { op: 'round'; matchId: string; result: RoundResult }
  | { op: 'matchEnd'; id: string; at: number; winner: Team; reason: WinReason; ledger: number };

/** Messages are addressed to a player id; the Durable Object sends them to each of that player's sockets. */
export interface Outgoing { to: string; msg: ServerMessage }

export interface Effects {
  out: Outgoing[];
  db: DbOp[];
  /** The room closed (idle cleanup): delete storage and drop every socket. */
  close: boolean;
}

export interface RoomDeps {
  now: () => number;
  /** 128-bit random hex (crypto.getRandomValues). */
  randomSeed: () => string;
}

const LIVE = new Set(['BIDDING', 'TRUMP_SELECTION', 'TRICK_LOOP']);
const DEFAULT_SETTINGS: RoomSettings = { turnSeconds: 20, botLevel: 'medium', matchLength: 'short' };

class Reject extends Error {
  constructor(public readonly code: ErrorCode, message?: string) { super(message ?? code); }
}

export function newRoomState(code: string, hostId: string, now: number): RoomState {
  return {
    v: 1, code, hostId, createdAt: now, settings: { ...DEFAULT_SETTINGS },
    seats: [null, null, null, null], online: [], match: null, matchId: null, seq: 0,
    startingAt: null, turnDeadline: null, botMoveAt: null, continueAt: null, continued: [],
    away: [null, null, null, null],
    // A room nobody joins closes like an abandoned one.
    idleCleanupAt: now + ONLINE.idleCleanupMs,
    closed: false,
  };
}

export class Room {
  private fx: Effects = { out: [], db: [], close: false };
  private lobbyDirty = false;

  constructor(public state: RoomState, private readonly deps: RoomDeps) {}

  // ---------------------------------------------------------------- entry points

  /** A socket for `playerId` opened. Seats them if a lobby seat is free; resumes their seat otherwise. */
  connect(playerId: string, name: string): Effects {
    return this.run(() => {
      const s = this.state;
      const wasPaused = !this.humansOnline();
      if (!s.online.includes(playerId)) s.online.push(playerId);
      s.idleCleanupAt = null;
      let repace = false;
      const seat = this.seatOf(playerId);
      if (seat !== null) {
        const st = s.seats[seat]!;
        const was = this.control(seat);
        st.name = name;
        s.away[seat] = null;
        st.dropped = false;
        this.presence(seat);
        repace = was !== this.control(seat) && this.isTurn(seat);
      } else if (this.inLobby() && s.startingAt === null) {
        const free = SEATS.find((x) => s.seats[x] === null);
        if (free !== undefined) {
          s.seats[free] = this.human(playerId, name);
          this.presence(free);
        }
      }
      if (s.hostId === null) s.hostId = playerId;
      // The room was paused with nobody here: timers restart from now.
      if (wasPaused && this.humansOnline()) repace = true;
      if (repace && this.inMatch()) this.refresh(playerId);
      // The joining player gets the full snapshot instead of the update.
      this.send(playerId, this.sync(playerId));
      this.lobbyDirty = true;
    });
  }

  /** The last socket for `playerId` closed. */
  disconnect(playerId: string): Effects {
    return this.run(() => {
      const s = this.state;
      s.online = s.online.filter((p) => p !== playerId);
      if (s.online.length === 0) s.idleCleanupAt = this.now() + ONLINE.idleCleanupMs;
      const seat = this.seatOf(playerId);
      if (seat === null) return;
      const st = s.seats[seat]!;
      // A bot already plays for an AFK or dropped seat; there is nothing to hold.
      if (!st.afk && !st.dropped) {
        s.away[seat] = { until: this.now() + ONLINE.graceMs, votes: {} };
        if (this.inMatch() && this.isTurn(seat)) this.refresh();
      }
      this.presence(seat);
      this.lobbyDirty = true;
      if (s.match?.phase === 'ROUND_EVAL' && s.continued.length && this.everyoneContinued()) this.nextRound();
    });
  }

  message(playerId: string, m: ClientMessage): Effects {
    return this.run(() => {
      try {
        this.handle(playerId, m);
      } catch (e) {
        if (e instanceof Reject || e instanceof RuleError) {
          this.send(playerId, { type: 'error', code: e.code, message: e.message, refSeq: m.seq ?? this.state.seq });
        } else {
          throw e;
        }
      }
    });
  }

  /** Runs every timer that is due. */
  alarm(): Effects {
    return this.run(() => {
      for (let guard = 0; guard < 16; guard++) {
        if (!this.runDue()) break;
      }
    });
  }

  /** The earliest pending deadline, for the Durable Object's single alarm slot. */
  nextAlarm(): number | null {
    const s = this.state;
    const all = [s.idleCleanupAt, s.startingAt, ...s.away.map((a) => a?.until ?? null)];
    // With no human connected the room pauses: bots do not play on alone (GDD §10.6).
    if (this.humansOnline()) all.push(s.turnDeadline, s.botMoveAt, s.continueAt);
    const due = all.filter((t): t is number => t !== null);
    return due.length ? Math.min(...due) : null;
  }

  /** What the join screen needs (GET /api/rooms/:code). */
  info(): { status: RoomStatus; seatsOpen: number } {
    const s = this.state;
    return { status: this.status(), seatsOpen: this.inLobby() ? s.seats.filter((x) => x === null).length : 0 };
  }

  // ---------------------------------------------------------------- messages

  private handle(playerId: string, m: ClientMessage) {
    const s = this.state;
    switch (m.type) {
      case 'ping':
        this.send(playerId, { type: 'pong', serverNow: this.now() });
        if (m.resync) this.send(playerId, this.sync(playerId));
        return;
      case 'takeSeat': {
        this.requireLobby();
        const target = s.seats[m.seat];
        if (target && !target.isBot) throw new Reject('SEAT_TAKEN');
        const from = this.seatOf(playerId);
        const st = from !== null ? s.seats[from]! : this.human(playerId, this.nameOf(playerId));
        if (from !== null) { s.seats[from] = null; s.away[from] = null; }
        st.ready = playerId === s.hostId;
        s.seats[m.seat] = st;
        this.lobbyDirty = true;
        return;
      }
      case 'setReady': {
        this.requireLobby();
        const seat = this.requireSeat(playerId);
        s.seats[seat]!.ready = m.ready;
        this.lobbyDirty = true;
        return;
      }
      case 'hostSettings': {
        this.requireHost(playerId);
        if (!this.inLobby() && s.match?.phase !== 'MATCH_END') throw new Reject('WRONG_PHASE');
        if (m.turnSeconds) s.settings.turnSeconds = m.turnSeconds;
        if (m.botLevel) s.settings.botLevel = m.botLevel;
        if (m.matchLength) s.settings.matchLength = m.matchLength;
        this.lobbyDirty = true;
        return;
      }
      case 'fillBot': {
        this.requireHost(playerId);
        this.requireLobby();
        if (s.seats[m.seat]) throw new Reject('SEAT_TAKEN');
        const taken = s.seats.filter((x): x is SeatState => x !== null).map((x) => x.name);
        const name = botName(rngFrom(this.deps.randomSeed()), taken);
        s.seats[m.seat] = { playerId: null, name, isBot: true, ready: true, afkStrikes: 0, afk: false, dropped: false };
        this.lobbyDirty = true;
        return;
      }
      case 'removeBot': {
        this.requireHost(playerId);
        this.requireLobby();
        if (!s.seats[m.seat]?.isBot) throw new Reject('SEAT_TAKEN', 'That seat has no bot');
        s.seats[m.seat] = null;
        this.lobbyDirty = true;
        return;
      }
      case 'swapTeams': {
        this.requireHost(playerId);
        this.requireLobby();
        [s.seats[m.a], s.seats[m.b]] = [s.seats[m.b] ?? null, s.seats[m.a] ?? null];
        [s.away[m.a], s.away[m.b]] = [s.away[m.b] ?? null, s.away[m.a] ?? null];
        this.lobbyDirty = true;
        return;
      }
      case 'start':
        this.requireHost(playerId);
        this.requireLobby();
        if (!this.canStart()) throw new Reject('NOT_READY', 'Every seat must be filled and every player ready');
        s.startingAt ??= this.now() + ONLINE.startSeconds * 1000;
        this.lobbyDirty = true;
        return;
      case 'cancelStart':
        this.requireHost(playerId);
        s.startingAt = null;
        this.lobbyDirty = true;
        return;
      case 'leave':
        this.leave(playerId);
        return;
      case 'rematch': {
        this.requireHost(playerId);
        if (s.match?.phase !== 'MATCH_END') throw new Reject('WRONG_PHASE');
        for (const st of s.seats) if (st) { st.afkStrikes = 0; st.afk = false; }
        this.startMatch();
        return;
      }
      case 'continue': {
        this.requireSeat(playerId);
        if (s.match?.phase !== 'ROUND_EVAL') throw new Reject('WRONG_PHASE');
        if (!s.continued.includes(playerId)) s.continued.push(playerId);
        if (this.everyoneContinued()) this.nextRound();
        return;
      }
      case 'imBack': {
        const seat = this.requireSeat(playerId);
        const st = s.seats[seat]!;
        if (!st.afk && !st.dropped) throw new Reject('NOT_BOT_CONTROLLED');
        st.afk = false;
        st.dropped = false;
        st.afkStrikes = 0;
        this.presence(seat);
        this.lobbyDirty = true;
        if (this.inMatch() && this.isTurn(seat)) this.refresh();
        return;
      }
      case 'vote':
        this.vote(playerId, m.seat, m.choice);
        return;
      case 'bid': case 'pass': case 'chooseTrump': case 'play': {
        const seat = this.requireSeat(playerId);
        if (!s.match) throw new Reject('WRONG_PHASE');
        const intent: Intent = m.type === 'bid' ? { type: 'bid', value: m.value }
          : m.type === 'pass' ? { type: 'pass' }
          : m.type === 'chooseTrump' ? { type: 'chooseTrump', suit: m.suit }
          : { type: 'play', card: m.card };
        const applied = apply(s.match, intentToAction(intent, seat));
        // Playing your own move takes the seat back from the bot.
        const st = s.seats[seat]!;
        const wasBot = st.afk || st.dropped;
        st.afkStrikes = 0;
        st.afk = false;
        st.dropped = false;
        if (wasBot) { this.presence(seat); this.lobbyDirty = true; }
        this.commit(applied);
        return;
      }
    }
  }

  private leave(playerId: string) {
    const s = this.state;
    const seat = this.seatOf(playerId);
    if (seat === null) return;
    if (this.inLobby()) {
      s.seats[seat] = null;
      s.away[seat] = null;
    } else {
      // Leaving a match: a bot takes the seat now; reconnecting still reclaims it.
      s.away[seat] = null;
      s.seats[seat]!.dropped = true;
      this.presence(seat);
      if (this.isTurn(seat)) this.refresh();
    }
    if (s.hostId === playerId) this.passHost(playerId, seat);
    this.lobbyDirty = true;
  }

  private vote(playerId: string, seat: Seat, choice: 'wait' | 'bot') {
    const s = this.state;
    const voter = this.requireSeat(playerId);
    const away = s.away[seat];
    if (!away || !this.inMatch() || voter === seat) throw new Reject('VOTE_CLOSED');
    if (choice === 'wait' && away.until - this.now() > ONLINE.extendOpensMs) throw new Reject('VOTE_CLOSED', 'Waiting opens when 30 s are left');
    away.votes[playerId] = choice;
    this.lobbyDirty = true;
    this.tally(seat);
  }

  /** A majority of the connected humans decides: wait adds a minute, bot ends the hold now. */
  private tally(seat: Seat) {
    const s = this.state;
    const away = s.away[seat];
    if (!away) return;
    const voters = this.voters(seat);
    const count = (c: 'wait' | 'bot') => voters.filter((p) => away.votes[p] === c).length;
    const need = Math.floor(voters.length / 2) + 1;
    if (voters.length === 0) return;
    if (count('wait') >= need) {
      away.until += ONLINE.extendByMs;
      away.votes = {};
    } else if (count('bot') >= need) {
      this.endHold(seat);
    }
  }

  // ---------------------------------------------------------------- timers

  /** Handles the earliest due timer; false when nothing is due. */
  private runDue(): boolean {
    const s = this.state;
    const now = this.now();
    const due = (t: number | null) => t !== null && t <= now;
    if (due(s.idleCleanupAt)) {
      s.closed = true;
      s.idleCleanupAt = null;
      this.fx.close = true;
      this.fx.db.push({ op: 'roomStatus', code: s.code, status: 'closed' });
      for (const p of s.online) this.send(p, { type: 'closed', reason: 'idle' });
      return false;
    }
    const held = SEATS.find((seat) => due(s.away[seat]?.until ?? null));
    if (held !== undefined) { this.endHold(held); return true; }
    if (due(s.startingAt)) {
      s.startingAt = null;
      if (this.canStart()) this.startMatch();
      this.lobbyDirty = true;
      return true;
    }
    if (!this.humansOnline() || !s.match) return false;
    if (due(s.continueAt)) { this.nextRound(); return true; }
    if (due(s.turnDeadline)) {
      const seat = s.match.round!.turn!;
      const st = s.seats[seat]!;
      st.afkStrikes++;
      if (st.afkStrikes >= ONLINE.afkStrikes) { st.afk = true; this.presence(seat); this.lobbyDirty = true; }
      this.botMove(seat);
      return true;
    }
    if (due(s.botMoveAt)) { this.botMove(s.match.round!.turn!); return true; }
    return false;
  }

  /** The hold ran out or the vote said bot: in a match a bot plays; in the lobby the seat frees. */
  private endHold(seat: Seat) {
    const s = this.state;
    const st = s.seats[seat];
    s.away[seat] = null;
    if (!st) return;
    if (this.inLobby()) {
      s.seats[seat] = null;
      if (s.startingAt !== null) s.startingAt = null;
    } else {
      st.dropped = true;
      this.presence(seat);
      if (this.inMatch() && this.isTurn(seat)) this.refresh();
    }
    if (st.playerId && st.playerId === s.hostId) this.passHost(st.playerId, seat);
    this.lobbyDirty = true;
  }

  /** Host role goes to the next connected human in seat order (GDD §10.6). */
  private passHost(from: string, start: Seat) {
    const s = this.state;
    for (let k = 1; k <= 4; k++) {
      const st = s.seats[(start + k) % 4];
      if (st?.playerId && st.playerId !== from && s.online.includes(st.playerId)) { s.hostId = st.playerId; return; }
    }
  }

  // ---------------------------------------------------------------- the match

  private startMatch() {
    const s = this.state;
    const seed = this.deps.randomSeed();
    const dealer = Math.floor(rngFrom(`${seed}:dealer`)() * 4) as Seat;
    const config = { ...DEFAULT_CONFIG, targetScore: TARGET_SCORE[s.settings.matchLength] };
    const base = s.match ?? createLobby(config);
    const applied = apply({ ...base, config }, { type: 'START_MATCH', seed, dealer });
    s.matchId = this.deps.randomSeed();
    s.startingAt = null;
    this.fx.db.push(
      {
        op: 'matchStart', id: s.matchId, code: s.code, seed, at: this.now(),
        players: SEATS.map((seat) => {
          const st = s.seats[seat]!;
          return { seat, playerId: st.playerId, name: st.name, isBot: st.isBot, team: teamOf(seat) };
        }),
      },
      { op: 'roomStatus', code: s.code, status: 'playing' },
    );
    this.lobbyDirty = true;
    this.commit(applied);
  }

  private nextRound() {
    const m = this.state.match;
    if (m?.phase !== 'ROUND_EVAL') return;
    this.commit(apply(m, { type: 'NEXT_ROUND' }));
  }

  /** The bot's move for `seat`; the first legal action if the bot fails, so the table never stalls. */
  private botMove(seat: Seat) {
    const s = this.state;
    const m = s.match!;
    let intent: Intent | null = null;
    try {
      intent = decide(viewFor(m, seat), s.settings.botLevel, { rng: rngFrom(`${m.seed}:bot:${s.seq}`), ...SERVER_BOT });
    } catch {
      intent = null;
    }
    try {
      if (!intent) throw new Error('no move');
      this.commit(apply(m, intentToAction(intent, seat)));
    } catch {
      const fallback = legalActions(m)[0];
      if (fallback) this.commit(apply(m, fallback));
    }
  }

  /** Persist the new state, send every seated player their view and events, re-arm the pacing. */
  private commit({ state, events }: Applied) {
    const s = this.state;
    s.match = state;
    if (events.some((e) => e.t === 'roundDecided') && s.matchId) {
      this.fx.db.push({ op: 'round', matchId: s.matchId, result: state.history[state.history.length - 1]! });
    }
    const over = events.find((e) => e.t === 'matchOver');
    if (over && over.t === 'matchOver' && s.matchId) {
      this.fx.db.push(
        { op: 'matchEnd', id: s.matchId, at: this.now(), winner: over.winner, reason: over.reason, ledger: state.ledger },
        { op: 'roomStatus', code: s.code, status: 'open' },
      );
      this.lobbyDirty = true;
    }
    this.publish(events);
  }

  /** Re-pace after a control change (a hold starts or ends) and resend views with no events. */
  private refresh(except?: string) {
    this.publish([], except);
  }

  private publish(events: GameEvent[], except?: string) {
    const s = this.state;
    const budget = animBudgetMs(events);
    this.schedule(budget);
    s.seq++;
    const serverNow = this.now();
    for (const p of s.online) {
      const seat = this.seatOf(p);
      if (seat === null || p === except) continue;
      this.send(p, { type: 'update', seq: s.seq, view: this.view(seat), events, animBudgetMs: budget, serverNow });
    }
  }

  /**
   * Pacing (GDD §10.3): a turn timer or bot move starts only after the clients have had
   * `budgetMs` to animate the events just sent. A held seat's turn has no timer.
   */
  private schedule(budgetMs: number) {
    const s = this.state;
    const m = s.match;
    const summaryAt = s.continueAt;
    s.turnDeadline = s.botMoveAt = s.continueAt = null;
    if (!m) return;
    const now = this.now();
    if (m.phase === 'ROUND_EVAL') {
      // A refresh during the summary keeps its countdown and the Continue taps so far.
      if (summaryAt !== null && budgetMs === 0) { s.continueAt = summaryAt; return; }
      s.continued = [];
      s.continueAt = now + budgetMs + MOTION.summarySeconds * 1000;
      return;
    }
    if (!LIVE.has(m.phase)) return;
    const seat = m.round!.turn!;
    const ctl = this.control(seat);
    if (ctl === 'held') return;
    if (ctl === 'human') s.turnDeadline = now + budgetMs + s.settings.turnSeconds * 1000;
    else s.botMoveAt = now + budgetMs + thinkTimeMs(viewFor(m, seat), rngFrom(`${m.seed}:think:${s.seq}`));
  }

  // ---------------------------------------------------------------- views

  private view(seat: Seat): PlayerView {
    const s = this.state;
    const players = {} as NonNullable<PlayerView['players']>;
    for (const x of SEATS) {
      const st = s.seats[x];
      players[x] = { name: st?.name ?? '', isBot: this.botPlays(x), connected: !!st && (st.isBot || this.isOnline(st.playerId)) };
    }
    return { ...viewFor(s.match!, seat), players, turnDeadline: s.turnDeadline, seq: s.seq };
  }

  private roomView(playerId: string): RoomView {
    const s = this.state;
    const seats = {} as Record<Seat, RoomSeatView | null>;
    for (const x of SEATS) {
      const st = s.seats[x];
      seats[x] = st ? {
        name: st.name, isBot: st.isBot, isHost: !!st.playerId && st.playerId === s.hostId,
        ready: st.isBot || st.ready, connected: st.isBot || this.isOnline(st.playerId), control: this.control(x),
      } : null;
    }
    const holds: HoldView[] = [];
    if (this.inMatch()) {
      for (const x of SEATS) {
        const a = s.away[x];
        if (!a) continue;
        const voters = this.voters(x);
        holds.push({
          seat: x, until: a.until, voters: voters.length,
          votes: { wait: voters.filter((p) => a.votes[p] === 'wait').length, bot: voters.filter((p) => a.votes[p] === 'bot').length },
          yourVote: a.votes[playerId] ?? null,
        });
      }
    }
    return { code: s.code, status: this.status(), you: this.seatOf(playerId), seats, settings: { ...s.settings }, startingAt: s.startingAt, holds };
  }

  private sync(playerId: string): ServerMessage {
    const s = this.state;
    const seat = this.seatOf(playerId);
    const view = s.match && s.match.phase !== 'LOBBY' && seat !== null ? this.view(seat) : null;
    return { type: 'sync', room: this.roomView(playerId), view, seq: s.seq, serverNow: this.now() };
  }

  private presence(seat: Seat) {
    const st = this.state.seats[seat];
    if (!st) return;
    const msg: ServerMessage = { type: 'presence', seat, connected: this.isOnline(st.playerId), isBot: this.botPlays(seat), control: this.control(seat) };
    for (const p of this.state.online) this.send(p, msg);
  }

  // ---------------------------------------------------------------- helpers

  private run(fn: () => void): Effects {
    this.fx = { out: [], db: [], close: false };
    this.lobbyDirty = false;
    fn();
    const s = this.state;
    // Any lobby change that breaks the start condition cancels the countdown.
    if (s.startingAt !== null && !this.canStart()) { s.startingAt = null; this.lobbyDirty = true; }
    if (this.lobbyDirty && !s.closed) {
      const serverNow = this.now();
      for (const p of s.online) this.send(p, { type: 'lobby', room: this.roomView(p), serverNow });
    }
    return this.fx;
  }

  private send(to: string, msg: ServerMessage) { this.fx.out.push({ to, msg }); }
  private now() { return this.deps.now(); }

  private human(playerId: string, name: string): SeatState {
    return { playerId, name, isBot: false, ready: playerId === this.state.hostId, afkStrikes: 0, afk: false, dropped: false };
  }

  private seatOf(playerId: string): Seat | null {
    return SEATS.find((x) => this.state.seats[x]?.playerId === playerId) ?? null;
  }

  private nameOf(playerId: string) {
    const seat = this.seatOf(playerId);
    return seat !== null ? this.state.seats[seat]!.name : 'Player';
  }

  private isOnline(playerId: string | null) { return !!playerId && this.state.online.includes(playerId); }
  private humansOnline() { return this.state.seats.some((st) => !!st?.playerId && this.isOnline(st.playerId)); }

  /** No match yet: the room is gathering players. */
  private inLobby() { return !this.state.match || this.state.match.phase === 'LOBBY'; }
  /** A match is being played (not over). */
  private inMatch() { const p = this.state.match?.phase; return !!p && p !== 'LOBBY' && p !== 'MATCH_END'; }
  private isTurn(seat: Seat) { const m = this.state.match; return !!m && LIVE.has(m.phase) && m.round?.turn === seat; }

  private control(seat: Seat): SeatControl {
    const st = this.state.seats[seat];
    if (!st || st.isBot) return 'bot';
    if (st.afk) return 'afk';
    if (st.dropped) return 'dropped';
    if (!this.isOnline(st.playerId)) return this.state.away[seat] ? 'held' : 'dropped';
    return 'human';
  }

  private botPlays(seat: Seat) { const c = this.control(seat); return c === 'bot' || c === 'afk' || c === 'dropped'; }

  /** Connected seated humans other than the held seat. */
  private voters(held: Seat): string[] {
    return SEATS.filter((x) => x !== held)
      .map((x) => this.state.seats[x]?.playerId ?? null)
      .filter((p): p is string => this.isOnline(p));
  }

  private everyoneContinued() {
    const s = this.state;
    return SEATS.every((x) => {
      const st = s.seats[x];
      return !st?.playerId || !this.isOnline(st.playerId) || s.continued.includes(st.playerId);
    });
  }

  private canStart() {
    const s = this.state;
    return this.inLobby() && s.seats.every((st) => !!st && (st.isBot || (st.ready && this.isOnline(st.playerId))));
  }

  private status(): RoomStatus {
    const s = this.state;
    if (s.match?.phase === 'MATCH_END') return 'over';
    if (this.inMatch()) return 'playing';
    return s.startingAt !== null ? 'starting' : 'lobby';
  }

  private requireLobby() { if (!this.inLobby()) throw new Reject('WRONG_PHASE'); }
  private requireHost(playerId: string) { if (playerId !== this.state.hostId) throw new Reject('NOT_HOST'); }
  private requireSeat(playerId: string): Seat {
    const seat = this.seatOf(playerId);
    if (seat === null) throw new Reject('NOT_SEATED');
    return seat;
  }
}
