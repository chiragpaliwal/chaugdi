// Animation queue (GDD §11.3). Each driver update's events play one after another,
// then its view shows. Input is open only when the queue is empty. On a slow or bursty
// link updates arrive several at once: behind by a few, it plays them faster (catch-up);
// far behind, it drops the queued animations and jumps ahead
// (docs/MULTIPLAYER_LESSONS.md §6). A bot move the server played ahead carries a start
// offset: it waits until then, so a run of bot moves keeps its thinking pauses.

import type { GameEvent, PlayerView } from '../../engine/types';
import { MOTION, scaledEventMs, type MotionSpeed } from '../../shared/constants';
import type { DriverUpdate, GameDriver, Players } from '../drivers/types';

export interface Playing {
  event: GameEvent;
  /** 0..1 through this event. */
  progress: number;
  durationMs: number;
  /** Earlier events of the same kind in this update (which pass of Deal 8). */
  ordinal: number;
}

export interface AnimSnapshot {
  /** The view of the update being played (or the latest one when idle). */
  view: PlayerView;
  /** The last view shown in full before this update. */
  prev: PlayerView | null;
  players: Players;
  playing: Playing | null;
  busy: boolean;
}

/** Events whose frames change while they play; the rest render once. */
const CONTINUOUS = new Set<GameEvent['t']>(['dealt', 'trickWon']);

/** Catch-up starts this many updates behind, or when the next update has waited this long. */
export const CATCH_UP = { behind: 3, waitedMs: 3_000, scale: 0.5 } as const;
/** More than this many queued: skip the replay and show the latest view. */
export const FLUSH_BEHIND = 12;

/**
 * Catch-up floors: a card still lands before the next one replaces it, and a won trick
 * still registers before it sweeps.
 */
const FLOOR: Partial<Record<GameEvent['t'], number>> = {
  bid: 150, pass: 150, cardPlayed: 250, trickWon: MOTION.trickHold + 100,
};

/** One event's duration in catch-up: faster, never below its floor, never slower than normal. */
function catchUpMs(e: GameEvent, normal: number): number {
  if (normal === 0) return 0;
  return Math.min(normal, Math.max(FLOOR[e.t] ?? 0, Math.round(normal * CATCH_UP.scale)));
}

/** `dueAt`: when it should start (arrival plus the server's start offset). */
interface Queued { update: DriverUpdate; dueAt: number }

interface Current { update: DriverUpdate; prev: PlayerView | null; index: number; startedAt: number; durations: number[]; fired: number }

/** Called as each event starts playing (sound, haptics, announcements). Skipped-ahead updates fire nothing. */
export type EventListener = (event: GameEvent, update: DriverUpdate) => void;

export interface AnimQueueOptions {
  speed: () => MotionSpeed;
  now?: () => number;
  frame?: (cb: () => void) => void;
}

export class AnimQueue {
  private readonly opts: AnimQueueOptions;
  private queue: Queued[] = [];
  private current: Current | null = null;
  private shown: DriverUpdate | null = null;
  private snapshot: AnimSnapshot | null = null;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<EventListener>();
  private looping = false;
  /** Waiting for the head of the queue to come due. */
  private waiting = false;
  private unsubscribe: () => void;

  constructor(driver: GameDriver, opts: AnimQueueOptions) {
    this.opts = opts;
    this.unsubscribe = driver.subscribe((u) => this.push(u));
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };

  getSnapshot = (): AnimSnapshot => this.snapshot!;

  onEvent = (cb: EventListener) => {
    this.eventListeners.add(cb);
    return () => { this.eventListeners.delete(cb); };
  };

  destroy() {
    this.waiting = false;
    this.unsubscribe();
    this.listeners.clear();
    this.eventListeners.clear();
  }

  private fire(update: DriverUpdate, from: number, to: number) {
    for (let i = from; i < to; i++) for (const cb of this.eventListeners) cb(update.events[i]!, update);
  }

  private now() { return this.opts.now?.() ?? performance.now(); }

  private push(u: DriverUpdate) {
    const now = this.now();
    this.queue.push({ update: u, dueAt: now + (u.offsetMs ?? 0) });
    // Updates still waiting on their offset are on schedule, not behind.
    if (this.queue.filter((q) => q.dueAt <= now).length > FLUSH_BEHIND) {
      // Skip ahead: show the latest view without its animations.
      this.current = null;
      this.waiting = false;
      this.shown = this.queue[this.queue.length - 1]!.update;
      this.queue = [];
      this.emit();
      return;
    }
    if (!this.current && !this.waiting) this.next();
  }

  /** Behind enough that queued updates should play faster. */
  private catchingUp(next: Queued): boolean {
    const now = this.now();
    const due = this.queue.filter((q) => q.dueAt <= now).length;
    return due > CATCH_UP.behind || now - next.dueAt > CATCH_UP.waitedMs;
  }

  /** Waits (busy, input closed) until the head of the queue is due, then plays on. */
  private wait() {
    this.waiting = true;
    this.emit();
    const tick = () => {
      if (!this.waiting) return;
      const head = this.queue[0];
      if (head && head.dueAt > this.now()) return this.frame(tick);
      this.waiting = false;
      this.next();
    };
    this.frame(tick);
  }

  private frame(cb: () => void) {
    if (this.opts.frame) return this.opts.frame(cb);
    // rAF stops in a hidden tab; the timeout keeps the queue moving.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') setTimeout(cb, 100);
    else requestAnimationFrame(() => cb());
  }

  private next() {
    while (this.queue.length) {
      if (this.queue[0]!.dueAt > this.now()) { this.current = null; this.wait(); return; }
      const fast = this.catchingUp(this.queue[0]!);
      const { update } = this.queue.shift()!;
      const speed = this.opts.speed();
      const durations = update.events.map((e) => {
        const ms = scaledEventMs(e, speed);
        return fast ? catchUpMs(e, ms) : ms;
      });
      if (durations.some((d) => d > 0)) {
        this.current = { update, prev: this.shown?.view ?? null, index: 0, startedAt: this.now(), durations, fired: 0 };
        this.skipZero();
        if (this.current) { this.emit(); this.loop(); return; }
        continue;
      }
      this.fire(update, 0, update.events.length);
      this.shown = update;
    }
    this.current = null;
    this.emit();
  }

  /** Steps past zero-length events; finishes the update when none are left. */
  private skipZero() {
    const c = this.current!;
    while (c.index < c.durations.length && c.durations[c.index] === 0) c.index++;
    const upTo = Math.min(c.index + 1, c.durations.length);
    this.fire(c.update, c.fired, upTo);
    c.fired = upTo;
    if (c.index >= c.durations.length) { this.shown = c.update; this.current = null; }
  }

  private loop() {
    if (this.looping) return;
    this.looping = true;
    const frame = (cb: () => void) => this.frame(cb);
    const tick = () => {
      const c = this.current;
      if (!c) { this.looping = false; return; }
      const t = this.now();
      let changed = false;
      while (this.current === c && t - c.startedAt >= c.durations[c.index]!) {
        c.startedAt += c.durations[c.index]!;
        c.index++;
        changed = true;
        this.skipZero();
      }
      if (!this.current) { this.looping = false; this.next(); return; }
      if (changed || CONTINUOUS.has(c.update.events[c.index]!.t)) this.emit();
      frame(tick);
    };
    frame(tick);
  }

  private emit() {
    const c = this.current;
    const base = c?.update ?? this.shown ?? this.queue[0]!.update;
    let playing: Playing | null = null;
    if (c) {
      const event = c.update.events[c.index]!;
      const durationMs = c.durations[c.index]!;
      const ordinal = c.update.events.slice(0, c.index).filter((e) => e.t === event.t).length;
      playing = { event, durationMs, ordinal, progress: Math.min(1, Math.max(0, (this.now() - c.startedAt) / durationMs)) };
    }
    this.snapshot = { view: base.view, prev: c ? c.prev : null, players: base.players, playing, busy: !!c || this.waiting || this.queue.length > 0 };
    for (const cb of this.listeners) cb();
  }
}
