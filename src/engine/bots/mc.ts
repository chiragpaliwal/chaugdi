// Hard: determinised Monte Carlo (GDD §9.4). Samples deals of the unseen cards that respect
// hand sizes and known voids, plays each to the end of the round with Medium for all four
// seats, and scores from the bot's team's point of view.
//
// Cost savers: equivalent cards are evaluated once,
// a 4th-hand follow under a partner who already wins is left to Medium, and candidates that
// are clearly worse on the shared deals are dropped early (successive halving).

import { legalCards, trickWinner } from '../tricks';
import { nextSeat, otherTeam, partnerOf, RANKS, rankValue, SEATS, suitOf, teamOf, type CardId, type Contract, type Play, type PlayerView, type Seat, type Suit } from '../types';
import { SORTED_DECK } from '../rng';
import { contextFromView, markVoid, type PlayContext } from './memory';
import { mediumPlay } from './play-medium';

export interface WorkStats { playouts: number; steps: number }

export interface Budget {
  rng: () => number;
  now: () => number;
  /** Wall-clock budget; GDD: ~120 ms in a Worker. 0 means a fixed sample count (server, tests). */
  budgetMs: number;
  /** Hard cap on samples (and the exact count when budgetMs is 0 and nothing is pruned). */
  maxSamples: number;
  minSamples: number;
  /** Work counter (playouts and simulated card plays): a machine-independent CPU measure. */
  stats?: WorkStats;
}

/** A full deal for the other three seats, or null when the constraints could not be met. */
export function sampleDeal(
  unseen: readonly CardId[], sizes: Record<Seat, number>, voids: PlayContext['voids'], you: Seat, rng: () => number,
): Record<Seat, CardId[]> | null {
  const others = SEATS.filter((s) => s !== you);
  const allowed = (s: Seat, c: CardId) => (voids[s] & ({ S: 1, H: 2, D: 4, C: 8 } as const)[suitOf(c)]) === 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    const cards = shuffled(unseen, rng);
    // Most constrained cards first.
    const options = new Map(cards.map((c) => [c, others.filter((s) => allowed(s, c)).length]));
    cards.sort((a, b) => options.get(a)! - options.get(b)!);
    const left = { ...sizes };
    const out = { 0: [], 1: [], 2: [], 3: [] } as Record<Seat, CardId[]>;
    let ok = true;
    for (const c of cards) {
      const seats = others.filter((s) => left[s] > 0 && allowed(s, c));
      let total = 0;
      for (const s of seats) total += left[s];
      if (!total) { ok = false; break; }
      let r = rng() * total;
      let pick = seats[seats.length - 1]!;
      for (const s of seats) { r -= left[s]; if (r < 0) { pick = s; break; } }
      out[pick].push(c);
      left[pick]--;
    }
    if (ok) return out;
  }
  return null;
}

function shuffled<T>(a: readonly T[], rng: () => number): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j]!, b[i]!];
  }
  return b;
}

interface Sim {
  hands: Record<Seat, CardId[]>;
  trump: Suit;
  contract: Contract;
  plays: Play[];
  turn: Seat;
  played: Set<CardId>;
  voids: PlayContext['voids'];
  tricksWon: { A: number; B: number };
  tricks: number;
}

/** Plays to the end with Medium for every seat. `full` ignores the early end (bid sampling). */
function playout(sim: Sim, full: boolean, stats?: WorkStats): void {
  const { contract } = sim;
  if (stats) stats.playouts++;
  for (;;) {
    const seat = sim.turn;
    const hand = sim.hands[seat];
    if (!hand.length) return;
    const ctx: PlayContext = { you: seat, hand, trump: sim.trump, contract, plays: sim.plays, played: sim.played, voids: sim.voids, tricksWon: sim.tricksWon };
    const card = mediumPlay(ctx);
    step(sim, seat, card);
    if (stats) stats.steps++;
    if (sim.plays.length === 0) {
      if (sim.tricks === 13) return;
      if (!full) {
        if (sim.tricksWon[contract.team] >= contract.bid) return;
        if (sim.tricksWon[otherTeam(contract.team)] >= 14 - contract.bid) return;
      }
    }
  }
}

function step(sim: Sim, seat: Seat, card: CardId) {
  if (sim.plays.length && suitOf(card) !== suitOf(sim.plays[0]!.card)) markVoid(sim.voids, seat, suitOf(sim.plays[0]!.card));
  sim.hands[seat] = sim.hands[seat].filter((c) => c !== card);
  sim.plays = [...sim.plays, { seat, card }];
  sim.played.add(card);
  if (sim.plays.length < 4) { sim.turn = nextSeat(seat); return; }
  const w = trickWinner(sim.plays, sim.trump)!.seat;
  sim.tricksWon[teamOf(w)]++;
  sim.tricks++;
  sim.plays = [];
  sim.turn = w;
}

/**
 * Round value for `team`: ±b made, ∓2b failed; Kot counts as a match win. A small trick
 * margin breaks the many ties early in a round, where most moves lead to the same outcome.
 */
function outcomeValue(sim: Sim, team: 'A' | 'B'): number {
  const c = sim.contract;
  const sign = team === c.team ? 1 : -1;
  const margin = 0.1 * (sim.tricksWon[team] - sim.tricksWon[otherTeam(team)]);
  if (sim.tricksWon[c.team] >= c.bid) return sign * (c.bid === 13 ? 52 : c.bid) + margin;
  return sign * -2 * c.bid + margin;
}

/**
 * Legal cards grouped into classes that play the same: two cards of a suit are equivalent
 * when every rank between them is already played or in the same hand. Each class is
 * represented by its lowest card.
 */
export function equivalenceClasses(legal: readonly CardId[], hand: readonly CardId[], played: ReadonlySet<CardId>): CardId[][] {
  const sorted = [...legal].sort((a, b) => (suitOf(a) === suitOf(b) ? rankValue(a) - rankValue(b) : suitOf(a) < suitOf(b) ? -1 : 1));
  const classes: CardId[][] = [];
  for (const c of sorted) {
    const last = classes[classes.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && suitOf(prev) === suitOf(c) && gapClosed(prev, c, hand, played)) last!.push(c);
    else classes.push([c]);
  }
  return classes;
}

function gapClosed(lo: CardId, hi: CardId, hand: readonly CardId[], played: ReadonlySet<CardId>) {
  const s = suitOf(lo);
  for (let v = rankValue(lo) + 1; v < rankValue(hi); v++) {
    const c = `${RANKS[v - 2]}${s}` as CardId;
    if (!played.has(c) && !hand.includes(c)) return false;
  }
  return true;
}

/** Decisions with nothing to search: following low under a partner who already wins as last hand. */
function trivial(ctx: PlayContext, classes: CardId[][]): boolean {
  if (classes.length === 1) return true;
  if (ctx.plays.length !== 3) return false;
  const led = suitOf(ctx.plays[0]!.card);
  const w = trickWinner(ctx.plays, ctx.trump)!;
  return w.seat === partnerOf(ctx.you) && ctx.hand.some((c) => suitOf(c) === led);
}

const PRUNE_AFTER = 12;
const PRUNE_EVERY = 6;

/** Best card by average round value over sampled deals (the same deals for every move). */
export function hardPlay(view: PlayerView, budget: Budget): CardId {
  const ctx = contextFromView(view);
  const legal = legalCards(ctx.hand, ctx.plays);
  if (legal.length === 1) return legal[0]!;
  const classes = equivalenceClasses(legal, ctx.hand, ctx.played);
  const medium = mediumPlay(ctx);
  if (trivial(ctx, classes)) return medium;

  const reps = classes.map((cl) => (cl.includes(medium) ? medium : cl[0]!));
  const unseen = SORTED_DECK.filter((c) => !ctx.played.has(c) && !ctx.hand.includes(c));
  const sizes = { ...view.handCounts };
  sizes[view.you] = 0;
  const team = teamOf(view.you);
  // values[k][i]: candidate k's round value on sample i.
  const values = reps.map(() => [] as number[]);
  let alive = reps.map((_, k) => k);
  const start = budget.now();
  let n = 0;
  while (alive.length > 1 && samplesFor(budget, n, start)) {
    const deal = sampleDeal(unseen, sizes, ctx.voids, view.you, budget.rng)
      ?? sampleDeal(unseen, sizes, [0, 0, 0, 0], view.you, budget.rng)!;
    deal[view.you] = ctx.hand;
    for (const k of alive) {
      const sim: Sim = {
        hands: { 0: [...deal[0]], 1: [...deal[1]], 2: [...deal[2]], 3: [...deal[3]] },
        trump: ctx.trump, contract: ctx.contract, plays: [...ctx.plays], turn: view.you,
        played: new Set(ctx.played), voids: [...ctx.voids], tricksWon: { ...ctx.tricksWon }, tricks: view.tricks.length,
      };
      step(sim, view.you, reps[k]!);
      playout(sim, false, budget.stats);
      values[k]![n] = outcomeValue(sim, team);
    }
    n++;
    if (n >= PRUNE_AFTER && (n - PRUNE_AFTER) % PRUNE_EVERY === 0) alive = prune(alive, values, reps.indexOf(medium));
  }
  // Ties go to Medium's choice, never to whatever happens to sort first.
  const avg = (k: number) => mean(values[k]!);
  let best = reps.indexOf(medium);
  if (!alive.includes(best)) best = alive[0]!;
  for (const k of alive) if (avg(k) > avg(best) + 1e-9) best = k;
  return reps[best]!;
}

function samplesFor(b: Budget, done: number, start: number) {
  if (done < b.minSamples) return true;
  if (done >= b.maxSamples) return false;
  return b.budgetMs > 0 && b.now() - start < b.budgetMs;
}

const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

/**
 * Successive halving on paired samples. Candidates that scored the same on every sample so
 * far merge into one (Medium's choice when it is among them); then a candidate whose mean
 * deficit to the leader is more than two standard errors is dropped, at most half the
 * field per call.
 */
function prune(all: number[], values: number[][], preferred: number): number[] {
  const seen = new Map<string, number>();
  for (const k of [...all].sort((a, b) => (b === preferred ? 1 : 0) - (a === preferred ? 1 : 0))) {
    const key = values[k]!.join(',');
    if (!seen.has(key)) seen.set(key, k);
  }
  const alive = all.filter((k) => [...seen.values()].includes(k));
  if (alive.length === 1) return alive;
  const leader = alive.reduce((a, b) => (mean(values[b]!) > mean(values[a]!) ? b : a));
  const drop = alive
    .filter((k) => k !== leader)
    .map((k) => {
      const d = values[leader]!.map((v, i) => v - values[k]![i]!);
      const m = mean(d);
      const se = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, d.length - 1) / d.length);
      return { k, z: se > 0 ? m / se : m > 0 ? Infinity : 0 };
    })
    .filter((x) => x.z > 2)
    .sort((a, b) => b.z - a.z)
    .slice(0, Math.floor(alive.length / 2))
    .map((x) => x.k);
  return alive.filter((k) => !drop.includes(k));
}

/** P(team tricks ≥ b) for b = 0..13 with `you` as declarer and `trump`, over sampled full deals. */
export function bidOdds(view: Pick<PlayerView, 'hand' | 'you'>, trump: Suit, samples: number, rng: () => number, stats?: WorkStats): number[] {
  const known = view.hand;
  const unseen = SORTED_DECK.filter((c) => !known.includes(c));
  const atLeast = new Array<number>(14).fill(0);
  const contract: Contract = { seat: view.you, team: teamOf(view.you), bid: 7, forced: false };
  for (let i = 0; i < samples; i++) {
    const rest = shuffled(unseen, rng);
    const hands = { 0: [], 1: [], 2: [], 3: [] } as Record<Seat, CardId[]>;
    hands[view.you] = [...known, ...rest.splice(0, 13 - known.length)];
    for (const s of SEATS) if (s !== view.you) hands[s] = rest.splice(0, 13);
    const sim: Sim = { hands, trump, contract, plays: [], turn: view.you, played: new Set(), voids: [0, 0, 0, 0], tricksWon: { A: 0, B: 0 }, tricks: 0 };
    playout(sim, true, stats);
    const won = sim.tricksWon[contract.team];
    for (let b = 0; b <= won; b++) atLeast[b]!++;
  }
  return atLeast.map((n) => n / samples);
}

/** Tricks the declarer's team takes over all 13 tricks, Medium play for every seat (calibration). */
export function fullRoundTricks(hands: Record<Seat, CardId[]>, trump: Suit, declarer: Seat): number {
  const contract: Contract = { seat: declarer, team: teamOf(declarer), bid: 7, forced: false };
  const sim: Sim = {
    hands: { 0: [...hands[0]], 1: [...hands[1]], 2: [...hands[2]], 3: [...hands[3]] },
    trump, contract, plays: [], turn: declarer, played: new Set(), voids: [0, 0, 0, 0], tricksWon: { A: 0, B: 0 }, tricks: 0,
  };
  playout(sim, true);
  return sim.tricksWon[contract.team];
}
