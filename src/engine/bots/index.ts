// Bots (GDD §9). They receive only a PlayerView, so they cannot see hidden cards.

import { legalBidValues } from '../auction';
import { partnerOf, SUITS, type Action, type CardId, type PlayerView, type Seat, type Suit } from '../types';
import { chooseBid, evaluateHand } from './bid';
import { contextFromView } from './memory';
import { bidOdds, hardPlay, type Budget } from './mc';
import { mediumPlay } from './play-medium';

export type BotLevel = 'easy' | 'medium' | 'hard';

/** What a player (or bot) asks for; the same shape as GameDriver.send (GDD §11.2). */
export type Intent =
  | { type: 'bid'; value: number }
  | { type: 'pass' }
  | { type: 'chooseTrump'; suit: Suit }
  | { type: 'play'; card: CardId };

export interface BotOptions {
  rng: () => number;
  /** Clock for Hard's time budget. Defaults to performance.now / Date.now. */
  now?: () => number;
  /** Hard: ms per card decision (default 120) and samples per trump when bidding (default 200). */
  budgetMs?: number;
  bidSamples?: number;
  /** Hard: fixed sample count, for deterministic tests. */
  samples?: number;
}

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function intentToAction(intent: Intent, seat: Seat): Action {
  switch (intent.type) {
    case 'bid': return { type: 'BID', seat, value: intent.value };
    case 'pass': return { type: 'PASS', seat };
    case 'chooseTrump': return { type: 'CHOOSE_TRUMP', seat, suit: intent.suit };
    case 'play': return { type: 'PLAY_CARD', seat, card: intent.card };
  }
}

/** The bot's move for this view, or null when it is not this seat's turn. */
export function decide(view: PlayerView, level: BotLevel, opts: BotOptions): Intent | null {
  if (view.turn !== view.you) return null;
  switch (view.phase) {
    case 'BIDDING': return decideBid(view, level, opts);
    case 'TRUMP_SELECTION': return { type: 'chooseTrump', suit: decideTrump(view, level, opts) };
    case 'TRICK_LOOP': return { type: 'play', card: decidePlay(view, level, opts) };
    default: return null;
  }
}

function decideBid(view: PlayerView, level: BotLevel, opts: BotOptions): Intent {
  const { high } = view.auction;
  const { minBid, maxBid } = view.config;
  if (!legalBidValues(view.auction, view.config).length) return { type: 'pass' };
  const partnerHigh = high !== null && high.seat === partnerOf(view.you);

  if (level === 'hard') {
    const odds = bestOdds(view, opts);
    if (partnerHigh) {
      const raise = high.value + 1;
      return raise <= maxBid && (odds[raise] ?? 0) >= 0.75 ? { type: 'bid', value: raise } : { type: 'pass' };
    }
    let maxWilling = 0;
    for (let b = minBid; b <= maxBid; b++) if ((odds[b] ?? 0) >= 0.7) maxWilling = b;
    const v = chooseBid(maxWilling, high?.value ?? null, minBid, maxBid);
    return v === null ? { type: 'pass' } : { type: 'bid', value: v };
  }

  if (partnerHigh) return { type: 'pass' };
  const aggression = level === 'easy' ? Math.floor(opts.rng() * 3) - 1 : 0;
  const maxWilling = Math.floor(evaluateHand(view.hand).best + aggression);
  const v = chooseBid(maxWilling, high?.value ?? null, minBid, maxBid);
  return v === null ? { type: 'pass' } : { type: 'bid', value: v };
}

/** Hard's P(team ≥ b) for its best trump. */
function bestOdds(view: PlayerView, opts: BotOptions): number[] {
  const samples = opts.bidSamples ?? 200;
  let best: number[] = [];
  let bestScore = -1;
  for (const s of SUITS) {
    const odds = bidOdds(view, s, samples, opts.rng);
    const score = odds.reduce((a, b) => a + b, 0); // expected tricks
    if (score > bestScore) { bestScore = score; best = odds; }
  }
  return best;
}

function decideTrump(view: PlayerView, level: BotLevel, opts: BotOptions): Suit {
  if (level !== 'hard') return evaluateHand(view.hand).trump;
  const samples = Math.max(50, Math.floor((opts.bidSamples ?? 200) / 2));
  let best: Suit = evaluateHand(view.hand).trump;
  let bestScore = -1;
  for (const s of SUITS) {
    const score = bidOdds(view, s, samples, opts.rng).reduce((a, b) => a + b, 0);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function decidePlay(view: PlayerView, level: BotLevel, opts: BotOptions): CardId {
  if (view.legal.length === 1) return view.legal[0]!;
  if (level === 'easy') {
    if (opts.rng() < 0.35) return view.legal[Math.floor(opts.rng() * view.legal.length)]!;
    return mediumPlay(contextFromView(view, false));
  }
  if (level === 'medium') return mediumPlay(contextFromView(view));
  const budget: Budget = {
    rng: opts.rng,
    now: opts.now ?? defaultNow,
    budgetMs: opts.samples !== undefined ? 0 : opts.budgetMs ?? 120,
    maxSamples: opts.samples ?? 150,
    minSamples: opts.samples ?? 30,
  };
  return hardPlay(view, budget);
}

// ---------------------------------------------------------------- human feel (GDD §9.5)

/** Think time added on top of the animation budget. */
export function thinkTimeMs(view: PlayerView, rng: () => number): number {
  const only = view.phase === 'TRICK_LOOP' ? view.legal.length <= 1 : view.phase === 'BIDDING' && view.auction.high?.value === view.config.maxBid;
  if (only) return 300;
  let ms = 450 + Math.floor(rng() * 500);
  if (view.phase === 'TRICK_LOOP' && view.contract && decidesRound(view)) ms += 400;
  return ms;
}

/** True when the trick being played can decide the round. */
function decidesRound(view: PlayerView): boolean {
  const c = view.contract!;
  const bidders = view.tricksWon[c.team];
  const defenders = view.tricksWon[c.team === 'A' ? 'B' : 'A'];
  return bidders + 1 >= c.bid || defenders + 1 >= 14 - c.bid;
}

const NAMES = ['Asha', 'Ben', 'Dev', 'Mira', 'Kiran', 'Ravi', 'Neha', 'Arjun', 'Zara', 'Ishan', 'Tara', 'Omar'];
/** Fictional bot names from a fixed pool (GDD §9.5), skipping names already used. */
export function botName(rng: () => number, taken: readonly string[] = []): string {
  const free = NAMES.filter((n) => !taken.includes(n));
  return free[Math.floor(rng() * free.length)] ?? 'Bot';
}
