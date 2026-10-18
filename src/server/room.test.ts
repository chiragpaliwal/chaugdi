import { describe, expect, it } from 'vitest';
import { assertInvariants } from '../engine/view';
import { SEATS, type MatchState, type PlayerView, type Seat } from '../engine/types';
import { ONLINE } from '../shared/constants';
import type { ClientMessage, RoomView, ServerMessage } from '../shared/protocol';
import { newRoomState, Room, type DbOp, type Effects } from './room';

type Msg<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

/** True when `msg` carries a card `seat` may not see, or the match seed (GDD §17). */
function leaks(msg: ServerMessage, match: MatchState | null): string | null {
  if (!match?.round) return null;
  const json = JSON.stringify(msg);
  if (match.seed && json.includes(match.seed)) return 'seed';
  if (msg.type !== 'update' && msg.type !== 'sync') return null;
  const view = msg.view;
  if (!view || view.revealedHands) return null;
  const hidden = SEATS.filter((s) => s !== view.you).flatMap((s) => match.round!.hands[s]).concat(match.round.stock);
  return hidden.find((c) => json.includes(`"${c}"`)) ?? null;
}

/** A room on a manual clock. Every message is checked for leaks at the moment it is sent. */
function harness(opts: { humans: string[]; bots?: Seat[] } = { humans: ['host'] }) {
  let now = 1_700_000_000_000;
  let n = 0;
  const state = newRoomState('K7QXM', opts.humans[0]!, now);
  const room = new Room(state, { now: () => now, randomSeed: () => `${++n}`.padStart(32, 'a') });
  const inbox = new Map<string, ServerMessage[]>();
  const db: DbOp[] = [];
  let closed = false;
  const r = room as unknown as { send: (to: string, msg: ServerMessage) => void };
  const send = r.send.bind(room);
  r.send = (to, msg) => {
    const leak = leaks(msg, room.state.match);
    if (leak) throw new Error(`${msg.type} to ${to} leaks ${leak}`);
    send(to, msg);
  };
  const take = (fx: Effects) => {
    for (const o of fx.out) inbox.set(o.to, [...(inbox.get(o.to) ?? []), o.msg]);
    db.push(...fx.db);
    if (fx.close) closed = true;
    if (room.state.match) assertInvariants(room.state.match);
    return fx;
  };
  const h = {
    room,
    db,
    get now() { return now; },
    get closed() { return closed; },
    connect: (p: string, name = p) => take(room.connect(p, name)),
    disconnect: (p: string) => take(room.disconnect(p)),
    send: (p: string, m: ClientMessage) => take(room.message(p, m)),
    /** Moves the clock forward, firing alarms in order like the Durable Object would. */
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const at = room.nextAlarm();
        if (at === null || at > end) break;
        now = Math.max(now, at);
        take(room.alarm());
      }
      now = end;
    },
    /** Jumps to the next alarm; false when none is pending. */
    tick() {
      const at = room.nextAlarm();
      if (at === null) return false;
      now = Math.max(now, at);
      take(room.alarm());
      return true;
    },
    msgs: (p: string) => inbox.get(p) ?? [],
    last<T extends ServerMessage['type']>(p: string, type: T): Msg<T> | undefined {
      return [...(inbox.get(p) ?? [])].reverse().find((m): m is Msg<T> => m.type === type);
    },
    room$: (p: string): RoomView => {
      const m = [...(inbox.get(p) ?? [])].reverse().find((x) => x.type === 'lobby' || x.type === 'sync') as Msg<'lobby'> | Msg<'sync'>;
      return m.room;
    },
    view: (p: string): PlayerView | null => {
      const m = [...(inbox.get(p) ?? [])].reverse().find((x) => x.type === 'update' || (x.type === 'sync' && x.view));
      return m && (m.type === 'update' || m.type === 'sync') ? m.view : null;
    },
    clear: () => inbox.clear(),
  };
  for (const p of opts.humans) h.connect(p);
  for (const s of opts.bots ?? []) h.send(opts.humans[0]!, { type: 'fillBot', seat: s });
  return h;
}

type H = ReturnType<typeof harness>;

/** Seats every human, readies them and deals. */
function started(humans: string[]): H {
  const h = harness({ humans, bots: SEATS.slice(humans.length) });
  for (const p of humans.slice(1)) h.send(p, { type: 'setReady', ready: true });
  h.send(humans[0]!, { type: 'start' });
  h.advance(ONLINE.startSeconds * 1000);
  expect(h.room.state.match?.phase).toBe('BIDDING');
  return h;
}

/** A simple human move for `p` from their own latest view. */
function humanMove(h: H, p: string): ClientMessage | null {
  const v = h.view(p);
  const m = h.room.state.match!;
  if (!v || m.round?.turn !== v.you) return null;
  if (m.phase === 'BIDDING') return { type: 'pass' };
  if (m.phase === 'TRUMP_SELECTION') return { type: 'chooseTrump', suit: 'S' };
  if (m.phase === 'TRICK_LOOP') return { type: 'play', card: v.legal[0]! };
  return null;
}

/** Plays until the match ends: humans move at once and tap Continue; bots take their time. */
function playOut(h: H, humans: string[], maxSteps = 20_000) {
  for (let i = 0; i < maxSteps; i++) {
    const m = h.room.state.match!;
    if (m.phase === 'MATCH_END') return;
    let acted = false;
    for (const p of humans) {
      const move = m.phase === 'ROUND_EVAL' ? ({ type: 'continue' } as const) : humanMove(h, p);
      if (move && !(m.phase === 'ROUND_EVAL' && h.room.state.continued.includes(p))) {
        h.send(p, move);
        acted = true;
        break;
      }
    }
    if (!acted && !h.tick()) throw new Error(`stalled in ${m.phase}`);
  }
  throw new Error('match did not finish');
}

describe('lobby', () => {
  it('seats players in order, lets the host fill bots, and starts after the countdown', () => {
    const h = harness({ humans: ['host', 'ben'] });
    expect(h.room$('host').you).toBe(0);
    expect(h.room$('ben').you).toBe(1);
    expect(h.room$('ben').seats[0]).toMatchObject({ name: 'host', isHost: true, ready: true });

    h.send('ben', { type: 'fillBot', seat: 2 });
    expect(h.last('ben', 'error')?.code).toBe('NOT_HOST');
    h.send('host', { type: 'fillBot', seat: 2 });
    h.send('host', { type: 'fillBot', seat: 3 });
    expect(h.room$('ben').seats[2]?.isBot).toBe(true);

    h.send('host', { type: 'start' });
    expect(h.last('host', 'error')?.code).toBe('NOT_READY');
    h.send('ben', { type: 'setReady', ready: true });
    h.send('host', { type: 'start' });
    expect(h.room$('ben').status).toBe('starting');
    // Un-readying during the countdown cancels it.
    h.send('ben', { type: 'setReady', ready: false });
    expect(h.room$('ben').status).toBe('lobby');
    h.send('ben', { type: 'setReady', ready: true });
    h.send('host', { type: 'start' });
    h.advance(ONLINE.startSeconds * 1000 - 1);
    expect(h.room.state.match).toBeNull();
    h.advance(1);
    expect(h.room.state.match?.phase).toBe('BIDDING');
    expect(h.room$('ben').status).toBe('playing');
    const u = h.last('ben', 'update')!;
    expect(u.view.you).toBe(1);
    expect(u.view.hand).toHaveLength(5);
    expect(u.events.map((e) => e.t)).toEqual(['roundStarted', 'dealt']);
    expect(u.animBudgetMs).toBeGreaterThan(0);
    expect(u.view.players?.[2]).toMatchObject({ isBot: true, connected: true });
    expect(h.db.map((d) => d.op)).toEqual(['matchStart', 'roomStatus']);
  });

  it('applies host settings, seat moves and team swaps', () => {
    const h = harness({ humans: ['host', 'ben'] });
    h.send('host', { type: 'hostSettings', turnSeconds: 10, botLevel: 'hard', matchLength: 'standard' });
    expect(h.room$('ben').settings).toEqual({ turnSeconds: 10, botLevel: 'hard', matchLength: 'standard' });
    h.send('ben', { type: 'takeSeat', seat: 2 });
    expect(h.room$('ben').you).toBe(2);
    h.send('ben', { type: 'takeSeat', seat: 0 });
    expect(h.last('ben', 'error')?.code).toBe('SEAT_TAKEN');
    h.send('host', { type: 'swapTeams', a: 2, b: 1 });
    expect(h.room$('ben').you).toBe(1);
  });

  it('frees a dropped seat after the grace period and passes the host on', () => {
    const h = harness({ humans: ['host', 'ben'] });
    h.disconnect('host');
    expect(h.room$('ben').seats[0]).toMatchObject({ connected: false, control: 'held' });
    h.advance(ONLINE.graceMs);
    expect(h.room$('ben').seats[0]).toBeNull();
    expect(h.room$('ben').seats[1]?.isHost).toBe(true);
    h.connect('host');
    expect(h.room$('host').you).toBe(0);
    expect(h.room$('host').seats[0]?.isHost).toBe(false);
  });

  it('a reconnect within the grace keeps the seat', () => {
    const h = harness({ humans: ['host', 'ben'] });
    h.disconnect('ben');
    h.advance(ONLINE.graceMs - 1);
    h.connect('ben');
    h.advance(ONLINE.graceMs);
    expect(h.room$('ben').you).toBe(1);
  });

  it('a human joining a full lobby takes a bot seat', () => {
    const h = harness({ humans: ['host'], bots: [1, 2, 3] });
    h.connect('ben');
    expect(h.room$('ben').you).toBe(1);
    expect(h.room$('host').seats[1]).toMatchObject({ name: 'ben', isBot: false });
    h.connect('cara');
    expect(h.room$('cara').you).toBe(2);
  });
});

describe('match', () => {
  it('plays a full match with two humans: paced, ordered, no leaks, history in D1', () => {
    const humans = ['host', 'ben'];
    const h = started(humans);
    playOut(h, humans);
    const m = h.room.state.match!;
    expect(m.phase).toBe('MATCH_END');
    expect(m.history.length).toBeGreaterThan(1);
    expect(Math.abs(m.ledger) >= 26 || m.winReason === 'KOT').toBe(true);

    for (const p of humans) {
      const seqs = h.msgs(p).filter((x): x is Msg<'update'> => x.type === 'update').map((u) => u.seq);
      expect(seqs.every((s, i) => i === 0 || s > seqs[i - 1]!)).toBe(true);
    }
    expect(h.db.filter((d) => d.op === 'round')).toHaveLength(m.history.length);
    expect(h.db.find((d) => d.op === 'matchEnd')).toMatchObject({ winner: m.winner, reason: m.winReason, ledger: m.ledger });
    expect(h.room$('ben').status).toBe('over');

    // Only the host may start the rematch: same seats, ledger reset.
    h.send('ben', { type: 'rematch' });
    expect(h.last('ben', 'error')?.code).toBe('NOT_HOST');
    h.send('host', { type: 'rematch' });
    expect(h.room.state.match).toMatchObject({ phase: 'BIDDING', ledger: 0, history: [] });
    expect(h.room$('ben').you).toBe(1);
  });

  it('starts the turn timer only after the animation budget (and a bot run’s start offset)', () => {
    const h = started(['host']);
    // Find the host's first turn.
    while (h.room.state.match!.round!.turn !== 0) h.tick();
    const u = h.last('host', 'update')!;
    expect(u.view.turnDeadline).toBe(h.now + (u.offsetMs ?? 0) + u.animBudgetMs + 20_000);
  });

  it('rejects out-of-turn moves with the error code and the client seq', () => {
    const h = started(['host', 'ben']);
    const turn = h.room.state.match!.round!.turn!;
    const idle = turn === 1 ? 'host' : 'ben';
    h.send(idle, { type: 'pass', seq: 7 });
    expect(h.last(idle, 'error')).toMatchObject({ code: 'NOT_YOUR_TURN', refSeq: 7 });
  });

  it('times out a turn with a bot move, and two timeouts in a row hand the seat to a bot until imBack', () => {
    const h = started(['host']);
    const m0 = () => h.room.state.match!;
    while (m0().round!.turn !== 0) h.tick();
    const before = m0().round!.auction.log.length;
    h.advance(h.room.state.turnDeadline! - h.now);
    expect(m0().round!.auction.log.length).toBeGreaterThan(before);
    expect(h.room.state.seats[0]!.afkStrikes).toBe(1);
    expect(h.room$('host').seats[0]?.control).toBe('human');

    while (m0().round!.turn !== 0 || !h.room.state.turnDeadline) h.tick();
    h.advance(h.room.state.turnDeadline! - h.now);
    expect(h.room$('host').seats[0]?.control).toBe('afk');
    expect(h.last('host', 'presence')).toMatchObject({ seat: 0, isBot: true, control: 'afk' });

    // While AFK the bot plays the seat at bot pace, with no turn timer.
    while (m0().round?.turn !== 0 || !['BIDDING', 'TRUMP_SELECTION', 'TRICK_LOOP'].includes(m0().phase)) {
      if (m0().phase === 'ROUND_EVAL') h.send('host', { type: 'continue' }); else h.tick();
    }
    expect(h.room.state.turnDeadline).toBeNull();
    expect(h.room.state.botMoveAt).not.toBeNull();

    h.send('host', { type: 'imBack' });
    expect(h.room$('host').seats[0]?.control).toBe('human');
    expect(h.room.state.turnDeadline).not.toBeNull();
    expect(h.room.state.botMoveAt).toBeNull();
  });

  it('round summary advances when every connected human continues, or after 6 s', () => {
    const humans = ['host', 'ben'];
    const h = started(humans);
    const toSummary = () => {
      for (let i = 0; i < 5000 && h.room.state.match!.phase !== 'ROUND_EVAL'; i++) {
        const m = humans.map((p) => [p, humanMove(h, p)] as const).find(([, mv]) => mv);
        if (m) h.send(m[0], m[1]!); else h.tick();
      }
    };
    toSummary();
    if (h.room.state.match!.phase !== 'ROUND_EVAL') return; // match ended in round 1
    const round = h.room.state.match!.round!.roundNo;
    h.send('host', { type: 'continue' });
    expect(h.room.state.match!.round!.roundNo).toBe(round);
    expect(h.room$('ben').continued).toEqual([0]);
    h.send('ben', { type: 'continue' });
    expect(h.room.state.match!.round!.roundNo).toBe(round + 1);

    toSummary();
    if (h.room.state.match!.phase !== 'ROUND_EVAL') return;
    const at = h.room.state.continueAt!;
    h.advance(at - h.now - 1);
    expect(h.room.state.match!.phase).toBe('ROUND_EVAL');
    h.advance(1);
    expect(h.room.state.match!.phase).toBe('BIDDING');
  });
});

describe('leak check', () => {
  it('catches another seat’s card and the seed', () => {
    const h = started(['host']);
    const m = h.room.state.match!;
    const view = h.view('host')!;
    const other = m.round!.hands[1][0]!;
    const update = h.last('host', 'update')!;
    expect(leaks(update, m)).toBeNull();
    expect(leaks({ ...update, view: { ...view, hand: [...view.hand, other] } }, m)).toBe(other);
    expect(leaks({ type: 'error', code: 'BAD_MESSAGE', message: m.seed, refSeq: 0 }, m)).toBe('seed');
  });
});

describe('disconnects', () => {
  /** Three humans and a bot; ben drops and play reaches ben's turn. */
  function heldBen() {
    const humans = ['host', 'ben', 'cara'];
    const h = started(humans);
    h.disconnect('ben');
    for (let i = 0; i < 2000 && h.room.state.match!.round!.turn !== 1; i++) {
      const m = ['host', 'cara'].map((p) => [p, humanMove(h, p)] as const).find(([, mv]) => mv);
      if (m) h.send(m[0], m[1]!); else h.tick();
    }
    expect(h.room.state.match!.round!.turn).toBe(1);
    return h;
  }

  it('holds the dropped player’s turn: no timer and no bot while the hold runs', () => {
    const h = heldBen();
    expect(h.room.state.turnDeadline).toBeNull();
    expect(h.room.state.botMoveAt).toBeNull();
    const hold = h.room$('host').holds[0]!;
    expect(hold).toMatchObject({ seat: 1, voters: 2, votes: { wait: 0, bot: 0 }, yourVote: null });
    expect(h.room$('host').seats[1]?.control).toBe('held');
    const log = h.room.state.match!.round!.auction.log.length;
    h.advance(hold.until - h.now - 1);
    expect(h.room.state.match!.round!.auction.log.length).toBe(log);
    // The hold runs out: a bot plays for ben until ben reconnects.
    h.advance(1);
    expect(h.room$('host').seats[1]?.control).toBe('dropped');
    expect(h.room.state.botMoveAt).not.toBeNull();
    h.advance(2000);
    expect(h.room.state.match!.round!.auction.log.length).toBeGreaterThan(log);
  });

  it('a majority voting wait adds a minute; wait reopens only in the last 30 s', () => {
    const h = heldBen();
    const until = h.room.state.away[1]!.until;
    h.send('host', { type: 'vote', seat: 1, choice: 'wait' });
    expect(h.room$('cara').holds[0]?.votes.wait).toBe(1);
    expect(h.room$('host').holds[0]?.yourVote).toBe('wait');
    h.send('cara', { type: 'vote', seat: 1, choice: 'wait' });
    expect(h.room.state.away[1]!.until).toBe(until + ONLINE.extendByMs);
    expect(h.room$('cara').holds[0]?.votes).toEqual({ wait: 0, bot: 0 });

    h.send('host', { type: 'vote', seat: 1, choice: 'wait' });
    expect(h.last('host', 'error')?.code).toBe('VOTE_CLOSED');
  });

  it('a majority voting bot ends the hold at once; reconnecting takes the seat back', () => {
    const h = heldBen();
    h.send('host', { type: 'vote', seat: 1, choice: 'bot' });
    expect(h.room$('host').seats[1]?.control).toBe('held');
    h.send('cara', { type: 'vote', seat: 1, choice: 'bot' });
    expect(h.room$('host').seats[1]?.control).toBe('dropped');
    expect(h.last('host', 'presence')).toMatchObject({ seat: 1, isBot: true, control: 'dropped' });
    expect(h.room.state.botMoveAt).not.toBeNull();

    h.connect('ben');
    expect(h.room$('ben').seats[1]?.control).toBe('human');
    const sync = h.last('ben', 'sync')!;
    expect(sync.view?.you).toBe(1);
    expect(sync.view?.hand.length).toBeGreaterThan(0);
    expect(h.room.state.turnDeadline).not.toBeNull();
    expect(h.room.state.botMoveAt).toBeNull();
  });

  it('pauses with no humans connected, then closes the idle room after 30 min', () => {
    const h = started(['host']);
    h.disconnect('host');
    const before = JSON.stringify(h.room.state.match);
    h.advance(10 * 60_000);
    expect(JSON.stringify(h.room.state.match)).toBe(before);
    expect(h.closed).toBe(false);
    h.advance(20 * 60_000);
    expect(h.closed).toBe(true);
    expect(h.db.at(-1)).toEqual({ op: 'roomStatus', code: 'K7QXM', status: 'closed' });
  });

  it('a returning player resumes a paused room with a fresh timer', () => {
    const h = started(['host']);
    while (h.room.state.match!.round!.turn !== 0) h.tick();
    h.disconnect('host');
    h.advance(5 * 60_000);
    h.connect('host');
    expect(h.room$('host').seats[0]?.control).toBe('human');
    expect(h.room.state.turnDeadline).toBe(h.now + 20_000);
  });
});

describe('alarms', () => {
  it('never arms for a time that is not in the future', () => {
    const h = started(['host', 'ben']);
    for (let i = 0; i < 300 && h.room.state.match!.phase !== 'MATCH_END'; i++) {
      const at = h.room.nextAlarm();
      if (at !== null) expect(at).toBeGreaterThan(h.now);
      expect(h.room.stuck()).toBeNull();
      if (!h.tick()) break;
    }
  });

  it('drops a summary timer left over outside the summary', () => {
    const h = started(['host']);
    h.room.state.continueAt = h.now - 1;
    expect(h.room.stuck()).toBe(h.now - 1);
    h.room.alarm();
    expect(h.room.state.continueAt).toBeNull();
    expect(h.room.stuck()).toBeNull();
  });

  it('closes an idle lobby after 30 min even with a socket open', () => {
    const h = harness({ humans: ['host'] });
    h.advance(29 * 60_000);
    h.send('host', { type: 'setReady', ready: true });
    h.advance(29 * 60_000);
    expect(h.closed).toBe(false);
    h.advance(2 * 60_000);
    expect(h.closed).toBe(true);
    expect(h.last('host', 'closed')).toEqual({ type: 'closed', reason: 'idle' });
    expect(h.room.nextAlarm()).toBeNull();
  });

  it('closes an idle results screen with sockets open, but never a match in progress', () => {
    const h = started(['host']);
    // Nobody acts: timeouts hand the seat to a bot, and the room stays open however long the match runs.
    for (let i = 0; i < 20_000 && h.room.state.match!.phase !== 'MATCH_END'; i++) {
      if (h.room.state.match!.phase === 'ROUND_EVAL') h.send('host', { type: 'continue' });
      else h.tick();
      expect(h.closed).toBe(false);
    }
    expect(h.room.state.match!.phase).toBe('MATCH_END');
    h.advance(29 * 60_000);
    expect(h.closed).toBe(false);
    h.advance(2 * 60_000);
    expect(h.closed).toBe(true);
  });
});

describe('bot runs', () => {
  /** Plays the host's turns at once until `n` alarms have fired. */
  function alarmsFor(level: 'medium' | 'hard') {
    const h = harness({ humans: ['host'], bots: [1, 2, 3] });
    h.send('host', { type: 'hostSettings', botLevel: level });
    h.send('host', { type: 'start' });
    h.advance(ONLINE.startSeconds * 1000);
    let alarms = 0;
    for (let i = 0; i < 400 && h.room.state.match!.history.length < 1; i++) {
      const m = h.room.state.match!;
      const move = m.phase === 'ROUND_EVAL' ? ({ type: 'continue' } as const) : humanMove(h, 'host');
      if (move) h.send('host', move);
      else if (h.tick()) alarms++;
    }
    return { h, alarms };
  }

  it('plays a run of bot moves in one alarm, each with the offset its own alarm would have had', () => {
    const { h } = alarmsFor('medium');
    const updates = h.msgs('host').filter((m): m is Msg<'update'> => m.type === 'update');
    const ahead = updates.filter((u) => (u.offsetMs ?? 0) > 0);
    expect(ahead.length).toBeGreaterThan(10);
    // Offsets within one batch grow: each move starts after the previous one's animation and think time.
    for (let i = 1; i < updates.length; i++) {
      const [a, b] = [updates[i - 1]!, updates[i]!];
      if ((b.offsetMs ?? 0) > 0 && a.serverNow === b.serverNow) {
        expect(b.offsetMs!).toBeGreaterThanOrEqual((a.offsetMs ?? 0) + a.animBudgetMs);
      }
    }
  });

  it('cuts alarms per round at least in half; hard bots keep one move per alarm', () => {
    const medium = alarmsFor('medium');
    const hard = alarmsFor('hard');
    const moves = (h: H) => h.msgs('host').filter((m) => m.type === 'update').length;
    expect(medium.alarms).toBeLessThan(moves(medium.h) / 2);
    expect(hard.h.msgs('host').some((m) => m.type === 'update' && (m.offsetMs ?? 0) > 0)).toBe(false);
  });
});
