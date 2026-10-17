import { describe, expect, it } from 'vitest';
import { apply, createLobby } from '../../engine/reducer';
import { viewFor } from '../../engine/view';
import { DEFAULT_CONFIG, type PlayerView, type Seat } from '../../engine/types';
import type { RoomView, ServerMessage } from '../../shared/protocol';
import { toTableView } from '../view/adapter';
import { decorateOnline, newlyDropped, onlineLayer, type OnlineCtx } from '../view/online';
import { RemoteDriver, type SocketLike } from './remote';
import type { DriverUpdate } from './types';

type Listener = (e: { data?: unknown; code?: number }) => void;

/** An in-memory socket: the test opens, closes and feeds it, and reads what was sent. */
function fakeSocket() {
  const on: Record<string, Listener[]> = {};
  const sent: Record<string, unknown>[] = [];
  const s = {
    readyState: 0,
    closed: false,
    reconnects: 0,
    send: (d: string) => { sent.push(JSON.parse(d)); },
    close: () => { s.closed = true; s.readyState = 3; },
    reconnect: () => { s.reconnects++; },
    addEventListener: (t: string, fn: Listener) => { (on[t] ??= []).push(fn); },
    open() { s.readyState = 1; for (const f of on.open ?? []) f({}); },
    drop(code = 1006) { s.readyState = 3; for (const f of on.close ?? []) f({ code }); },
    feed(m: ServerMessage) { for (const f of on.message ?? []) f({ data: JSON.stringify(m) }); },
  };
  return { s, sent };
}

function setup() {
  let now = 1_000_000;
  const { s, sent } = fakeSocket();
  let unauthorized = 0;
  const driver = new RemoteDriver({
    code: 'K7QXM',
    auth: async () => ({ token: 't', name: 'Asha' }),
    onUnauthorized: () => { unauthorized++; },
    socket: () => s as unknown as SocketLike,
    now: () => now,
    heartbeat: false,
  });
  const updates: DriverUpdate[] = [];
  driver.subscribe((u) => updates.push(u));
  return { driver, s, sent, updates, advance: (ms: number) => { now += ms; }, get now() { return now; }, get unauthorized() { return unauthorized; } };
}

const started = apply(createLobby(DEFAULT_CONFIG), { type: 'START_MATCH', seed: 'remote-test', dealer: 0 });

function view(seat: Seat, seq: number, extra: Partial<PlayerView> = {}): PlayerView {
  return {
    ...viewFor(started.state, seat),
    players: { 0: { name: 'Asha', isBot: false, connected: true }, 1: { name: 'Ben', isBot: false, connected: true }, 2: { name: 'Dev', isBot: true, connected: true }, 3: { name: 'Mira', isBot: true, connected: true } },
    seq, turnDeadline: null, ...extra,
  };
}

function room(extra: Partial<RoomView> = {}): RoomView {
  const human = (name: string, isHost = false) => ({ name, isBot: false, isHost, ready: true, connected: true, control: 'human' as const });
  const bot = (name: string) => ({ name, isBot: true, isHost: false, ready: true, connected: true, control: 'bot' as const });
  return {
    code: 'K7QXM', status: 'playing', you: 0,
    seats: { 0: human('Asha', true), 1: human('Ben'), 2: bot('Dev'), 3: bot('Mira') },
    settings: { turnSeconds: 20, botLevel: 'medium', matchLength: 'short' },
    startingAt: null, holds: [], continued: [], ...extra,
  };
}

describe('RemoteDriver', () => {
  it('applies updates in seq order, ignores duplicates and resyncs on a gap', () => {
    const t = setup();
    t.s.open();
    t.s.feed({ type: 'sync', room: room(), view: view(0, 3), seq: 3, serverNow: t.now + 500 });
    expect(t.updates).toHaveLength(1);
    expect(t.updates[0]!.events).toEqual([]);
    expect(t.updates[0]!.players.names).toEqual({ 0: 'You', 1: 'Ben', 2: 'Dev', 3: 'Mira' });
    expect(t.driver.getRoom().skew).toBe(500);
    expect(t.driver.local(t.now + 1500)).toBe(t.now + 1000);

    t.s.feed({ type: 'update', seq: 4, view: view(0, 4), events: started.events, animBudgetMs: 900, serverNow: t.now });
    expect(t.updates).toHaveLength(2);
    expect(t.updates[1]!.events).toEqual(started.events);
    t.s.feed({ type: 'update', seq: 4, view: view(0, 4), events: [], animBudgetMs: 0, serverNow: t.now });
    expect(t.updates).toHaveLength(2);

    t.s.feed({ type: 'update', seq: 6, view: view(0, 6), events: [], animBudgetMs: 0, serverNow: t.now });
    expect(t.updates).toHaveLength(2);
    expect(t.sent.at(-1)).toEqual({ type: 'ping', resync: true, seq: 4 });
    t.s.feed({ type: 'sync', room: room(), view: view(0, 6), seq: 6, serverNow: t.now });
    expect(t.updates).toHaveLength(3);
  });

  it('sends one move at a time, released by the update or an error', () => {
    const t = setup();
    t.s.open();
    t.s.feed({ type: 'sync', room: room(), view: view(0, 1), seq: 1, serverNow: t.now });
    t.driver.send({ type: 'pass' });
    t.driver.send({ type: 'pass' });
    expect(t.sent).toEqual([{ type: 'pass', seq: 1 }]);
    t.s.feed({ type: 'error', code: 'NOT_YOUR_TURN', message: 'no', refSeq: 1 });
    expect(t.driver.getRoom().error?.code).toBe('NOT_YOUR_TURN');
    t.driver.send({ type: 'bid', value: 7 });
    expect(t.sent).toHaveLength(2);
    t.s.feed({ type: 'update', seq: 2, view: view(0, 2), events: [], animBudgetMs: 0, serverNow: t.now });
    t.driver.send({ type: 'continue' });
    t.driver.send({ type: 'continue' });
    expect(t.sent.slice(2)).toEqual([{ type: 'continue', seq: 2 }, { type: 'continue', seq: 2 }]);
  });

  it('drops moves while reconnecting and tracks when the socket dropped', () => {
    const t = setup();
    t.s.open();
    t.s.feed({ type: 'sync', room: room(), view: view(0, 1), seq: 1, serverNow: t.now });
    t.s.drop();
    expect(t.driver.getRoom()).toMatchObject({ conn: 'reconnecting', droppedAt: t.now });
    t.driver.send({ type: 'pass' });
    expect(t.sent).toEqual([]);
    t.advance(5000);
    t.s.open();
    expect(t.driver.getRoom()).toMatchObject({ conn: 'open', droppedAt: null });
  });

  it('stops for a closed or unknown room, and retries a refused token once as a new guest', () => {
    const a = setup();
    a.s.drop(4004);
    expect(a.driver.getRoom().closed).toBe('notFound');
    expect(a.s.closed).toBe(true);

    const b = setup();
    b.s.drop(4001);
    expect(b.unauthorized).toBe(1);
    expect(b.driver.getRoom().closed).toBeNull();
    b.s.drop(4001);
    expect(b.driver.getRoom().closed).toBe('unauthorized');

    const c = setup();
    c.s.open();
    c.s.feed({ type: 'closed', reason: 'idle' });
    expect(c.driver.getRoom().closed).toBe('idle');
  });

  it('patches presence into the room', () => {
    const t = setup();
    t.s.open();
    t.s.feed({ type: 'sync', room: room(), view: view(0, 1), seq: 1, serverNow: t.now });
    t.s.feed({ type: 'presence', seat: 1, connected: false, isBot: false, control: 'held' });
    expect(t.driver.getRoom().room?.seats[1]).toMatchObject({ connected: false, control: 'held' });
  });
});

describe('online table extras', () => {
  const ctx = (o: Partial<OnlineCtx> = {}): OnlineCtx => ({
    room: room(), view: view(0, 1), conn: 'open', droppedAt: null, now: 1_000_000, skew: 0, dropped: null, onImBack: () => {}, ...o,
  });
  const screen = (v: PlayerView) => toTableView({ view: v, prev: null, players: { names: { 0: 'You', 1: 'Ben', 2: 'Dev', 3: 'Mira' }, isBot: { 0: false, 1: false, 2: true, 3: true } }, playing: null, busy: false, width: 390 });

  it('holds your input with a countdown while you reconnect, then says a bot plays', () => {
    const v = view(0, 1);
    const c = ctx({ view: v, conn: 'reconnecting', droppedAt: 1_000_000 - 6_000 });
    const layer = onlineLayer(c);
    expect(layer.held).toBe(true);
    expect(layer.banner).toMatchObject({ countdown: '0:24' });
    const s = decorateOnline(screen(v), c, layer);
    expect(s.kind === 'auction' && s.v.yourTurn).toBe(false);
    expect(onlineLayer({ ...c, droppedAt: 1_000_000 - 31_000 }).banner?.text).toMatch(/bot plays for you/);
  });

  it('shows the vote for another held seat and the held tag on their badge', () => {
    const r = room({
      seats: { ...room().seats, 1: { ...room().seats[1]!, connected: false, control: 'held' } },
      holds: [{ seat: 1, until: 1_000_000 + 24_000, voters: 1, votes: { wait: 0, bot: 0 }, yourVote: null }],
    });
    const c = ctx({ room: r });
    const layer = onlineLayer(c);
    expect(layer.vote).toMatchObject({ seat: 1, name: 'Ben', team: 'B', secondsLeft: 24 });
    const s = decorateOnline(screen(c.view), c, layer);
    expect(s.kind).toBe('auction');
    if (s.kind === 'auction') expect(s.v.seats.find((x) => x.seat === 1)).toMatchObject({ connected: false, tag: { text: 'held' } });
  });

  it('turns the server deadline into the ring', () => {
    const v = view(1, 1, { turnDeadline: 1_000_000 + 10_000 });
    const c = ctx({ view: v, room: room({ you: 1 }) });
    const s = decorateOnline(screen(v), c, onlineLayer(c));
    expect(s.kind === 'auction' && s.v.yourTurn && s.v.turnLeft).toBe(50);
  });

  it('offers I’m back when a bot plays your seat, and finds seats that just went to a bot', () => {
    const r = room({ seats: { ...room().seats, 0: { ...room().seats[0]!, control: 'afk' } } });
    expect(onlineLayer(ctx({ room: r })).banner?.action?.label).toBe('I’m back');
    const before = room({ seats: { ...room().seats, 1: { ...room().seats[1]!, control: 'held' } } });
    const after = room({ seats: { ...room().seats, 1: { ...room().seats[1]!, control: 'dropped' } } });
    expect(newlyDropped(before, after)).toEqual([1]);
    expect(onlineLayer(ctx({ room: after, dropped: 1 })).toast?.title).toBe('Ben left.');
  });
});
