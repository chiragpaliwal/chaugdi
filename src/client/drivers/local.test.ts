import { describe, expect, it } from 'vitest';
import { decide, type BotLevel } from '../../engine/bots';
import { rngFrom } from '../../engine/rng';
import { assertInvariants } from '../../engine/view';
import type { PlayerView } from '../../engine/types';
import { AnimQueue } from '../anim/queue';
import { toTableView } from '../view/adapter';
import { LocalDriver } from './local';
import type { SoloSave } from './save';
import type { BotRunner } from './bots';
import type { DriverUpdate } from './types';

const inlineBots: BotRunner = {
  decide: async (view, level, seed) => decide(view, level, { rng: rngFrom(seed) }),
  destroy: () => {},
};

/** Manual clock: timers run in due order when the test drains them. */
function fakeTimers() {
  let now = 0;
  let id = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      set: (fn: () => void, ms: number) => { due.set(++id, { at: now + ms, fn }); return id; },
      clear: (t: unknown) => { due.delete(t as number); },
    },
    /** Runs the earliest timer; false when none are pending. */
    async step() {
      const next = [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) return false;
      due.delete(next[0]);
      now = next[1].at;
      next[1].fn();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      return true;
    },
  };
}

/** A simple human: pass, spades, first legal card, continue. */
function humanMove(driver: LocalDriver, v: PlayerView) {
  if (v.phase === 'ROUND_EVAL') return driver.send({ type: 'continue' });
  if (v.turn !== v.you) return;
  if (v.phase === 'BIDDING') driver.send({ type: 'pass' });
  else if (v.phase === 'TRUMP_SELECTION') driver.send({ type: 'chooseTrump', suit: 'S' });
  else if (v.phase === 'TRICK_LOOP') driver.send({ type: 'play', card: v.legal[0]! });
}

async function playOut(opts: { seed?: string; saved?: SoloSave | null; level?: BotLevel; stopAfter?: number; render?: boolean }) {
  const t = fakeTimers();
  const saves: SoloSave[] = [];
  const driver = new LocalDriver({
    level: opts.level ?? 'medium', seed: opts.seed, saved: opts.saved, bots: inlineBots, timers: t.timers,
    persist: (s) => saves.push(structuredClone(s)), watchVisibility: false,
  });
  const updates: DriverUpdate[] = [];
  driver.subscribe((u) => updates.push(u));
  let guard = 0;
  while (driver.match.phase !== 'MATCH_END' && guard++ < 20000) {
    if (opts.stopAfter !== undefined && saves.length >= opts.stopAfter) break;
    const v = updates[updates.length - 1]!.view;
    if (v.phase === 'ROUND_EVAL' || v.turn === v.you) humanMove(driver, v);
    else if (!(await t.step())) throw new Error(`stalled in ${v.phase}`);
    assertInvariants(driver.match);
  }
  driver.destroy();
  return { driver, updates, saves };
}

describe('LocalDriver', () => {
  it('plays a full solo match to the end, pacing bots by the animation budget', async () => {
    const { driver, updates, saves } = await playOut({ seed: 'm3-full' });
    expect(driver.match.phase).toBe('MATCH_END');
    expect(updates[0]!.events.map((e) => e.t)).toEqual(['roundStarted', 'dealt']);
    expect(updates.every((u) => u.animBudgetMs >= 0)).toBe(true);
    expect(saves.length).toBe(updates.length);
    // No update ever shows another seat's cards before the round is decided.
    for (const u of updates) if (!u.view.revealedHands) expect(Object.keys(u.view.handCounts).length).toBe(4);
  }, 60_000);

  it('renders every update and every animation frame through the adapter', async () => {
    const { updates } = await playOut({ seed: 'm3-render' });
    let prev: PlayerView | null = null;
    for (const u of updates) {
      for (const width of [360, 390]) {
        toTableView({ view: u.view, prev, players: u.players, playing: null, busy: false, width });
        u.events.forEach((event, i) => {
          for (const progress of [0, 0.5, 1]) {
            const ordinal = u.events.slice(0, i).filter((e) => e.t === event.t).length;
            toTableView({ view: u.view, prev, players: u.players, playing: { event, progress, durationMs: 500, ordinal }, busy: true, width });
          }
        });
      }
      prev = u.view;
    }
  }, 60_000);

  it('resumes from a save and finishes exactly as the uninterrupted match', async () => {
    const full = await playOut({ seed: 'm3-resume' });
    const half = await playOut({ seed: 'm3-resume', stopAfter: 120 });
    const resumed = await playOut({ saved: half.saves[half.saves.length - 1]! });
    expect(resumed.driver.match).toEqual(full.driver.match);
  }, 60_000);

  it('rematch starts a new match with the ledger reset', async () => {
    const { driver } = await playOut({ seed: 'm3-rematch' });
    const t = fakeTimers();
    const again = new LocalDriver({ level: 'easy', saved: { v: 1, state: driver.match, players: { names: { 0: 'You', 1: 'B', 2: 'A', 3: 'D' }, isBot: { 0: false, 1: true, 2: true, 3: true } }, level: 'easy', seq: 1 }, bots: inlineBots, timers: t.timers, watchVisibility: false });
    again.send({ type: 'rematch' });
    expect(again.match.phase).toBe('BIDDING');
    expect(again.match.ledger).toBe(0);
    expect(again.match.history).toEqual([]);
    again.destroy();
  }, 60_000);
});

describe('AnimQueue', () => {
  function fakeDriver() {
    let cb: (u: DriverUpdate) => void = () => {};
    return { subscribe: (f: (u: DriverUpdate) => void) => { cb = f; return () => {}; }, send: () => {}, destroy: () => {}, push: (u: DriverUpdate) => cb(u) };
  }
  const players = { names: { 0: 'You', 1: 'Ben', 2: 'Asha', 3: 'Dev' }, isBot: { 0: false, 1: true, 2: true, 3: true } } as const;
  const view = (roundNo: number) => ({ roundNo } as unknown as PlayerView);

  it('plays events in order, then shows the view and opens input', () => {
    let now = 0;
    const frames: (() => void)[] = [];
    const d = fakeDriver();
    const q = new AnimQueue(d, { speed: () => 'normal', now: () => now, frame: (f) => frames.push(f) });
    d.push({ view: view(1), players, animBudgetMs: 0, events: [{ t: 'bid', seat: 1, value: 7 }, { t: 'pass', seat: 2 }] });
    expect(q.getSnapshot().playing?.event.t).toBe('bid');
    expect(q.getSnapshot().busy).toBe(true);
    now = 310; frames.shift()!();
    expect(q.getSnapshot().playing?.event.t).toBe('pass');
    now = 700; frames.shift()!();
    expect(q.getSnapshot().playing).toBeNull();
    expect(q.getSnapshot().busy).toBe(false);
  });

  it('plays a small backlog in catch-up time instead of skipping it', () => {
    let now = 0;
    const frames: (() => void)[] = [];
    const d = fakeDriver();
    const q = new AnimQueue(d, { speed: () => 'normal', now: () => now, frame: (f) => frames.push(f) });
    const card = { t: 'cardPlayed', seat: 1, card: 'AS' } as const;
    // The first update starts at normal speed before the burst lands behind it.
    for (let r = 1; r <= 5; r++) d.push({ view: view(r), players, animBudgetMs: 360, events: [card] });
    expect(q.getSnapshot().view.roundNo).toBe(1);
    expect(q.getSnapshot().playing?.durationMs).toBe(360);
    now = 360; frames.shift()!();
    // Four behind: half speed, floored so a card still lands (250 ms). Back to normal
    // once no more than three are queued.
    const durations: number[] = [];
    while (q.getSnapshot().playing) {
      durations.push(q.getSnapshot().playing!.durationMs);
      now += q.getSnapshot().playing!.durationMs;
      frames.shift()!();
    }
    expect(durations).toEqual([250, 360, 360, 360]);
    expect(q.getSnapshot().view.roundNo).toBe(5);
    expect(q.getSnapshot().busy).toBe(false);
  });

  it('waits for a bot move’s start offset, keeping input closed, and does not count it as behind', () => {
    let now = 0;
    const frames: (() => void)[] = [];
    const d = fakeDriver();
    const q = new AnimQueue(d, { speed: () => 'normal', now: () => now, frame: (f) => frames.push(f) });
    const card = { t: 'cardPlayed', seat: 1, card: 'AS' } as const;
    // A run of five bot moves arrives at once, each due 2 s after the last.
    for (let r = 1; r <= 5; r++) d.push({ view: view(r), players, animBudgetMs: 360, events: [card], offsetMs: (r - 1) * 2000 });
    expect(q.getSnapshot().playing?.durationMs).toBe(360);
    const started: number[] = [];
    for (let i = 0; i < 2000 && frames.length; i++) {
      now += 50;
      const before = q.getSnapshot().view.roundNo;
      frames.shift()!();
      const s = q.getSnapshot();
      if (s.playing && s.view.roundNo !== before) {
        started.push(now);
        // On schedule, so never catch-up speed.
        expect(s.playing.durationMs).toBe(360);
      }
      if (!s.playing && s.view.roundNo < 5) expect(s.busy).toBe(true);
    }
    expect(started).toEqual([2000, 4000, 6000, 8000]);
    expect(q.getSnapshot().busy).toBe(false);
  });

  it('skips ahead when more than twelve updates are queued', () => {
    const d = fakeDriver();
    const q = new AnimQueue(d, { speed: () => 'normal', now: () => 0, frame: () => {} });
    const bid = { t: 'bid', seat: 1, value: 7 } as const;
    for (let r = 1; r <= 14; r++) d.push({ view: view(r), players, animBudgetMs: 300, events: [bid] });
    expect(q.getSnapshot().view.roundNo).toBe(14);
    expect(q.getSnapshot().busy).toBe(false);
  });

  it('fires each event as it starts, including zero-length ones, in order', () => {
    let now = 0;
    const frames: (() => void)[] = [];
    const d = fakeDriver();
    const q = new AnimQueue(d, { speed: () => 'normal', now: () => now, frame: (f) => frames.push(f) });
    const seen: string[] = [];
    q.onEvent((e) => seen.push(e.t));
    d.push({ view: view(1), players, animBudgetMs: 0, events: [
      { t: 'roundDecided', outcome: 'MADE', afterTrick: 9 },
      { t: 'handsRevealed', hands: { 0: [], 1: [], 2: [], 3: [] } },
      { t: 'scored', team: 'A', delta: 7, ledger: 7 },
    ] });
    expect(seen).toEqual(['roundDecided']);
    now = 1000; frames.shift()!();
    expect(seen).toEqual(['roundDecided', 'handsRevealed', 'scored']);
    d.push({ view: view(2), players, animBudgetMs: 0, events: [{ t: 'dealerStays', seat: 1 }] });
    expect(seen.at(-1)).toBe('dealerStays');
  });
});
