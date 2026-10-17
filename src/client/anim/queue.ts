// Animation queue (GDD §11.3). Each driver update's events play one after another,
// then its view shows. Input is open only when the queue is empty. More than two
// updates behind (a background tab), it drops the queued animations and jumps ahead.

import type { GameEvent, PlayerView } from '../../engine/types';
import { scaledEventMs, type MotionSpeed } from '../../shared/constants';
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
const MAX_BEHIND = 2;

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
  private queue: DriverUpdate[] = [];
  private current: Current | null = null;
  private shown: DriverUpdate | null = null;
  private snapshot: AnimSnapshot | null = null;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<EventListener>();
  private looping = false;
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
    this.unsubscribe();
    this.listeners.clear();
    this.eventListeners.clear();
  }

  private fire(update: DriverUpdate, from: number, to: number) {
    for (let i = from; i < to; i++) for (const cb of this.eventListeners) cb(update.events[i]!, update);
  }

  private now() { return this.opts.now?.() ?? performance.now(); }

  private push(u: DriverUpdate) {
    this.queue.push(u);
    if (this.queue.length > MAX_BEHIND) {
      // Skip ahead: show the latest view without its animations.
      this.current = null;
      this.shown = this.queue[this.queue.length - 1]!;
      this.queue = [];
      this.emit();
      return;
    }
    if (!this.current) this.next();
  }

  private next() {
    while (this.queue.length) {
      const update = this.queue.shift()!;
      const speed = this.opts.speed();
      const durations = update.events.map((e) => scaledEventMs(e, speed));
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
    const frame = this.opts.frame ?? ((cb: () => void) => {
      // rAF stops in a hidden tab; the timeout keeps the queue moving.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') setTimeout(cb, 100);
      else requestAnimationFrame(() => cb());
    });
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
    const base = c?.update ?? this.shown ?? this.queue[0]!;
    let playing: Playing | null = null;
    if (c) {
      const event = c.update.events[c.index]!;
      const durationMs = c.durations[c.index]!;
      const ordinal = c.update.events.slice(0, c.index).filter((e) => e.t === event.t).length;
      playing = { event, durationMs, ordinal, progress: Math.min(1, Math.max(0, (this.now() - c.startedAt) / durationMs)) };
    }
    this.snapshot = { view: base.view, prev: c ? c.prev : null, players: base.players, playing, busy: !!c || this.queue.length > 0 };
    for (const cb of this.listeners) cb();
  }
}
