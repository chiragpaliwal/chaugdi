// LocalDriver (GDD §4.1, §11.2): the match runs in the tab. You are seat 0; bots hold
// seats 1–3. Bots move only after the last update's animation budget plus think time,
// the same pacing rule the server follows (GDD §10.3, §9.5).

import { botName, intentToAction, thinkTimeMs, type BotLevel } from '../../engine/bots';
import { apply, createLobby, legalActions, type Applied } from '../../engine/reducer';
import { randomSeed, rngFrom } from '../../engine/rng';
import { viewFor } from '../../engine/view';
import { DEFAULT_CONFIG, teamOf, type Action, type GameEvent, type MatchState, type Seat } from '../../engine/types';
import { animBudgetMs, type MotionSpeed } from '../../shared/constants';
import { createBotRunner, type BotRunner } from './bots';
import type { LastResult, SoloSave } from './save';
import type { ClientIntent, DriverUpdate, GameDriver, Players } from './types';

const YOU: Seat = 0;
const LIVE = new Set(['BIDDING', 'TRUMP_SELECTION', 'TRICK_LOOP']);

export interface LocalDriverOptions {
  level: BotLevel;
  /** Points to win a new match (settings: match length). Saved matches keep theirs. */
  targetScore?: number;
  saved?: SoloSave | null;
  /** Fixed match seed (tests). New matches use a random one. */
  seed?: string;
  bots?: BotRunner;
  speed?: () => MotionSpeed;
  persist?: (s: SoloSave) => void;
  onFinished?: (r: LastResult) => void;
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void };
  /** Pause bot timers while the page is hidden (GDD §13). Off in tests. */
  watchVisibility?: boolean;
}

/** Bot names from the fixed pool, seeded by the match so a resumed match keeps them. */
export function soloPlayers(seed: string): Players {
  const rng = rngFrom(`${seed}:names`);
  const taken: string[] = [];
  const pick = () => { const n = botName(rng, taken); taken.push(n); return n; };
  const partner = pick();
  const left = pick();
  const right = pick();
  return { names: { 0: 'You', 1: left, 2: partner, 3: right }, isBot: { 0: false, 1: true, 2: true, 3: true } };
}

const randomDealer = (seed: string) => Math.floor(rngFrom(`${seed}:dealer`)() * 4) as Seat;

export class LocalDriver implements GameDriver {
  private state: MatchState;
  private players: Players;
  private seq: number;
  private readonly level: BotLevel;
  private readonly bots: BotRunner;
  private readonly opts: LocalDriverOptions;
  private listeners = new Set<(u: DriverUpdate) => void>();
  private last: DriverUpdate;
  private timer: unknown = null;
  private paused = false;
  private destroyed = false;

  constructor(opts: LocalDriverOptions) {
    this.opts = opts;
    this.level = opts.saved?.level ?? opts.level;
    this.bots = opts.bots ?? createBotRunner();
    let events: GameEvent[] = [];
    if (opts.saved) {
      this.state = opts.saved.state;
      this.players = opts.saved.players;
      this.seq = opts.saved.seq;
    } else {
      const seed = opts.seed ?? randomSeed();
      const started = apply(createLobby({ ...DEFAULT_CONFIG, targetScore: opts.targetScore ?? DEFAULT_CONFIG.targetScore }), { type: 'START_MATCH', seed, dealer: randomDealer(seed) });
      this.state = started.state;
      this.players = soloPlayers(seed);
      this.seq = 0;
      events = started.events;
    }
    this.last = this.update(events);
    this.save();
    if (opts.watchVisibility !== false && typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    this.schedule(this.last.animBudgetMs);
  }

  subscribe(cb: (u: DriverUpdate) => void): () => void {
    this.listeners.add(cb);
    cb(this.last);
    // Later subscribers (a remount) see the current view without replaying old events.
    this.last = { ...this.last, events: [], animBudgetMs: 0 };
    return () => { this.listeners.delete(cb); };
  }

  send(intent: ClientIntent): void {
    if (this.destroyed) return;
    const { phase } = this.state;
    let action: Action | null = null;
    if (intent.type === 'continue') action = phase === 'ROUND_EVAL' ? { type: 'NEXT_ROUND' } : null;
    else if (intent.type === 'rematch') {
      // Same seats, ledger reset, a new random dealer (GDD §4.2).
      const seed = randomSeed();
      action = phase === 'MATCH_END' ? { type: 'START_MATCH', seed, dealer: randomDealer(seed) } : null;
    }
    else if (this.state.round?.turn === YOU) action = intentToAction(intent, YOU);
    if (!action) return;
    try {
      this.commit(apply(this.state, action));
    } catch {
      // An illegal intent changes nothing; the UI only offers legal ones.
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.clearTimer();
    this.bots.destroy();
    this.listeners.clear();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Current match state, for tests. */
  get match(): MatchState { return this.state; }

  private update(events: GameEvent[]): DriverUpdate {
    const speed = this.opts.speed?.() ?? 'normal';
    return { view: viewFor(this.state, YOU), events, animBudgetMs: animBudgetMs(events, speed), players: this.players };
  }

  private commit({ state, events }: Applied) {
    this.state = state;
    this.seq++;
    this.last = this.update(events);
    this.save();
    for (const cb of this.listeners) cb(this.last);
    if (state.phase === 'MATCH_END' && state.winner) {
      const w = state.winner;
      this.opts.onFinished?.({ team: w === teamOf(YOU) ? 'A' : 'B', names: this.teamNames(w), value: Math.abs(state.ledger) });
    }
    this.schedule(this.last.animBudgetMs);
  }

  private teamNames(t: 'A' | 'B') {
    const [a, b] = t === 'A' ? [0, 2] as const : [1, 3] as const;
    return `${this.players.names[a]} & ${this.players.names[b]}`;
  }

  private save() {
    this.opts.persist?.({ v: 1, state: this.state, players: this.players, level: this.level, seq: this.seq });
  }

  private schedule(budgetMs: number) {
    this.clearTimer();
    if (this.paused || this.destroyed || !LIVE.has(this.state.phase)) return;
    const seat = this.state.round?.turn;
    if (seat === null || seat === undefined || seat === YOU) return;
    const view = viewFor(this.state, seat);
    const delay = budgetMs + thinkTimeMs(view, rngFrom(`${this.state.seed}:think:${this.seq}`));
    const t = this.opts.timers;
    const run = () => { this.timer = null; void this.runBot(seat); };
    this.timer = t ? t.set(run, delay) : setTimeout(run, delay);
  }

  private clearTimer() {
    if (this.timer === null) return;
    const t = this.opts.timers;
    if (t) t.clear(this.timer); else clearTimeout(this.timer as ReturnType<typeof setTimeout>);
    this.timer = null;
  }

  private async runBot(seat: Seat) {
    const seq = this.seq;
    const view = viewFor(this.state, seat);
    let intent = null;
    try {
      intent = await this.bots.decide(view, this.level, `${this.state.seed}:bot:${seq}`);
    } catch {
      intent = null;
    }
    if (this.destroyed || this.paused || seq !== this.seq || this.state.round?.turn !== seat) return;
    try {
      if (!intent) throw new Error('no move');
      this.commit(apply(this.state, intentToAction(intent, seat)));
    } catch {
      // Never stall the table: take the first legal action.
      const fallback = legalActions(this.state)[0];
      if (fallback) this.commit(apply(this.state, fallback));
    }
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.paused = true;
      this.clearTimer();
    } else if (this.paused) {
      this.paused = false;
      this.schedule(0);
    }
  };
}
