// Bots (GDD §9). They receive only a PlayerView, so they cannot see hidden cards.

import { canPass, legalBidValues } from '../auction';
import { partnerOf, SUITS, type Action, type CardId, type PlayerView, type Seat, type Suit } from '../types';
import { estimateOdds, evaluateHand, modelMean, modelOdds, pickBid, type AuctionSignals, type BidPolicy } from './bid';
import { contextFromView } from './memory';
import { bidOdds, hardPlay, type Budget, type WorkStats } from './mc';
import { easyPlay } from './play-easy';
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
  /** Override the level's bidding policy (tuning). */
  bidPolicy?: BidPolicy;
  /** Hard: bid by simulating deals instead of the fitted model (the old way; tests). */
  mcBidding?: boolean;
  /** Counts Hard's simulated work (bench, server batching). */
  stats?: WorkStats;
}

/**
 * Bidding policy per level, from the self-play sweep in calibrate.test.ts. 2/3 is the
 * break-even for +b / −2b and beat every looser policy; jump bids lost at every tau.
 * Easy bids loosely on purpose: shorter matches and beatable.
 */
export const BID_POLICY: Record<BotLevel, BidPolicy> = {
  easy: { tau: 0.5, jump: false },
  medium: { tau: 2 / 3, jump: false },
  hard: { tau: 2 / 3, jump: false },
};

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
    case 'BIDDING': {
      const intent = decideBid(view, level, opts);
      // The opener cannot pass: a hand it would pass with plays the compulsory 7.
      return intent.type === 'pass' && !canPass(view.auction) ? { type: 'bid', value: view.config.minBid } : intent;
    }
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

  const policy = opts.bidPolicy ?? BID_POLICY[level];
  if (level === 'hard') {
    const odds = bestOdds(view, opts);
    if (partnerHigh) {
      const raise = high.value + 1;
      return raise <= maxBid && (odds[raise] ?? 0) >= 0.75 ? { type: 'bid', value: raise } : { type: 'pass' };
    }
    const v = pickBid(odds, high?.value ?? null, policy, minBid, maxBid);
    return v === null ? { type: 'pass' } : { type: 'bid', value: v };
  }

  if (partnerHigh) return { type: 'pass' };
  // Easy misjudges its hand by up to a trick either way (GDD §9.3).
  const shift = level === 'easy' ? Math.floor(opts.rng() * 3) - 1 : 0;
  const v = pickBid(estimateOdds(evaluateHand(view.hand).best, shift), high?.value ?? null, policy, minBid, maxBid);
  return v === null ? { type: 'pass' } : { type: 'bid', value: v };
}

/**
 * The five cards do not change during the auction, so each (hand, trump) is simulated once
 * per round: bid turns and the trump choice share the result. Losing it (a new Worker or a
 * hibernated room) only means simulating again.
 */
const oddsCache = new Map<string, number[]>();
function cachedOdds(view: PlayerView, trump: Suit, samples: number, opts: BotOptions): number[] {
  const key = `${view.roundNo}|${view.you}|${[...view.hand].sort().join('')}|${trump}|${samples}`;
  let odds = oddsCache.get(key);
  if (!odds) {
    odds = bidOdds(view, trump, samples, opts.rng, opts.stats);
    if (oddsCache.size >= 32) oddsCache.delete(oddsCache.keys().next().value!);
    oddsCache.set(key, odds);
  }
  return odds;
}

/** Bids made of a seat's own accord: every bid but the opener's compulsory first call. */
function auctionSignals(view: PlayerView): AuctionSignals {
  const p = partnerOf(view.you);
  const bidders = new Set(view.auction.log.filter((e, i) => e.kind === 'bid' && i > 0).map((e) => e.seat));
  return { partnerBid: bidders.has(p), opponentBids: [...bidders].filter((s) => s !== p && s !== view.you).length };
}

/** Hard's P(team ≥ b) for its best trump. */
function bestOdds(view: PlayerView, opts: BotOptions): number[] {
  if (!opts.mcBidding) {
    const sig = auctionSignals(view);
    return modelOdds(view.hand, hardTrump(view, sig), sig);
  }
  const samples = opts.bidSamples ?? 200;
  let best: number[] = [];
  let bestScore = -1;
  for (const s of SUITS) {
    const odds = cachedOdds(view, s, samples, opts);
    const score = odds.reduce((a, b) => a + b, 0); // expected tricks
    if (score > bestScore) { bestScore = score; best = odds; }
  }
  return best;
}

/** The suit with the most expected tricks under the bid model; ties keep evaluateHand's choice. */
function hardTrump(view: PlayerView, sig: AuctionSignals): Suit {
  let best = evaluateHand(view.hand).trump;
  for (const s of SUITS) if (modelMean(view.hand, s, sig) > modelMean(view.hand, best, sig) + 1e-9) best = s;
  return best;
}

function decideTrump(view: PlayerView, level: BotLevel, opts: BotOptions): Suit {
  if (level !== 'hard') return evaluateHand(view.hand).trump;
  if (!opts.mcBidding) return hardTrump(view, auctionSignals(view));
  const samples = opts.bidSamples ?? 200;
  let best: Suit = evaluateHand(view.hand).trump;
  let bestScore = -1;
  for (const s of SUITS) {
    const score = cachedOdds(view, s, samples, opts).reduce((a, b) => a + b, 0);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function decidePlay(view: PlayerView, level: BotLevel, opts: BotOptions): CardId {
  if (view.legal.length === 1) return view.legal[0]!;
  if (level === 'easy') return easyPlay(view.you, view.hand, view.current?.plays ?? [], view.trump!, opts.rng);
  if (level === 'medium') return mediumPlay(contextFromView(view));
  const budget: Budget = {
    rng: opts.rng,
    now: opts.now ?? defaultNow,
    budgetMs: opts.samples !== undefined ? 0 : opts.budgetMs ?? 120,
    maxSamples: opts.samples ?? 150,
    minSamples: opts.samples ?? 30,
    stats: opts.stats,
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
