// Bid evaluation on the first five cards (GDD §9.1), calibrated by self-play.

import { DISPLAY_SUIT_ORDER } from '../cards';
import { rankOf, rankValue, suitOf, type CardId, type Suit } from '../types';

const TRUMP_HONOUR: Partial<Record<string, number>> = { A: 1.2, K: 1.0, Q: 0.7, J: 0.4 };
const LENGTH_BONUS = [0, 0, 0.3, 1.0, 2.0, 3.0];

/**
 * Team tricks for a declarer with five cards scoring `ownFive` (best trump, declarer leads,
 * Medium play for all seats): mean = intercept + slope × ownFive, normal spread `sd`.
 * Fitted on 20,000 simulated deals (src/engine/__tests__/calibrate.test.ts), 2026-10-18.
 */
export const CALIBRATION = { intercept: 6.01, slope: 0.62, sd: 1.97 };

const count = (hand: readonly CardId[], s: Suit) => hand.filter((c) => suitOf(c) === s).length;

export function ownFive(hand: readonly CardId[], trump: Suit): number {
  let v = 0;
  for (const c of hand) {
    const s = suitOf(c);
    const r = rankOf(c);
    if (s === trump) { v += TRUMP_HONOUR[r] ?? 0; continue; }
    const len = count(hand, s);
    if (r === 'A') v += 1.0;
    else if (r === 'K') v += len === 1 ? 0.4 : 0.75;
    else if (r === 'Q') v += len < 2 ? 0 : 0.35;
  }
  return v + (LENGTH_BONUS[Math.min(5, count(hand, trump))] ?? 0);
}


const honours = (hand: readonly CardId[], s: Suit) => hand.filter((c) => suitOf(c) === s).map(rankValue).sort((a, b) => b - a);

/** Best ownFive over the four suits. Ties: more cards, then higher honours, then ♠ ♥ ♣ ♦. */
export function evaluateHand(hand: readonly CardId[]): { best: number; trump: Suit } {
  let trump: Suit = 'S';
  let best = -Infinity;
  for (const s of DISPLAY_SUIT_ORDER) {
    const e = ownFive(hand, s);
    if (e > best + 1e-9) { best = e; trump = s; continue; }
    if (Math.abs(e - best) > 1e-9) continue;
    const dc = count(hand, s) - count(hand, trump);
    if (dc > 0) { trump = s; continue; }
    if (dc < 0) continue;
    const a = honours(hand, s), b = honours(hand, trump);
    for (let i = 0; i < a.length; i++) {
      if (a[i]! !== b[i]!) { if (a[i]! > b[i]!) trump = s; break; }
    }
  }
  return { best, trump };
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, error < 1.5e-7). */
function phi(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** P(team tricks ≥ b) for b = 0..13 from the calibrated estimate; `shift` adds tricks to the mean (Easy's noise). */
export function estimateOdds(own: number, shift = 0): number[] {
  const { intercept, slope, sd } = CALIBRATION;
  const mean = intercept + slope * own + shift;
  return Array.from({ length: 14 }, (_, b) => (b === 0 ? 1 : 1 - phi((b - 0.5 - mean) / sd)));
}

export interface BidPolicy {
  /** Bid only when P(make) is at least this. Break-even for +b / −2b is 2/3. */
  tau: number;
  /** Bid the highest value that still meets tau, instead of the minimum legal bid. */
  jump: boolean;
}

/** The bid to make given P(team ≥ b), or null to pass. */
export function pickBid(odds: readonly number[], high: number | null, policy: BidPolicy, minBid = 7, maxBid = 13): number | null {
  const need = Math.max(minBid, (high ?? 0) + 1);
  let pick: number | null = null;
  for (let b = need; b <= maxBid; b++) {
    if ((odds[b] ?? 0) < policy.tau) break;
    pick = b;
    if (!policy.jump) break;
  }
  return pick;
}

// ---------------------------------------------------------------- Hard's bid model

/** What the auction says about the other hands: partner bid of its own accord; opponents who did. */
export interface AuctionSignals { partnerBid: boolean; opponentBids: number }

/** Features of five cards with `trump` as Hukum, for Hard's bid model (order matches HARD_MODEL.w). */
export function bidFeatures(five: readonly CardId[], trump: Suit, sig: AuctionSignals): number[] {
  const has = (r: string, s: Suit) => five.some((c) => rankOf(c) === r && suitOf(c) === s) ? 1 : 0;
  let sideA = 0, sideKGuarded = 0, sideKSingle = 0, sideQGuarded = 0, short = 0;
  for (const s of DISPLAY_SUIT_ORDER) {
    if (s === trump) continue;
    const n = count(five, s);
    if (n <= 1) short++;
    sideA += has('A', s);
    if (has('K', s)) { if (n >= 2) sideKGuarded++; else sideKSingle++; }
    if (has('Q', s) && n >= 3) sideQGuarded++;
  }
  return [
    1, count(five, trump), has('A', trump), has('K', trump), has('Q', trump), has('J', trump),
    sideA, sideKGuarded, sideKSingle, sideQGuarded, short,
    sig.partnerBid ? 1 : 0, sig.opponentBids,
  ];
}

/**
 * Team tricks ~ Normal(w · features, sd) for a declarer with these five cards (declarer
 * leads, Medium play for all seats). Fitted by least squares on simulated deals:
 * CALIBRATE=1 npx vitest run calibrate -t "bid model".
 */
export const HARD_MODEL = {
  w: [5.6, 0.522, 0.682, 0.43, 0.271, 0.144, 0.553, 0.492, 0.297, 0.347, -0.082, 0.655, -0.563],
  sd: 1.94,
};

export function modelMean(five: readonly CardId[], trump: Suit, sig: AuctionSignals): number {
  const x = bidFeatures(five, trump, sig);
  return x.reduce((a, v, i) => a + v * HARD_MODEL.w[i]!, 0);
}

/** P(team ≥ b) for b = 0..13 from the bid model. */
export function modelOdds(five: readonly CardId[], trump: Suit, sig: AuctionSignals): number[] {
  const mean = modelMean(five, trump, sig);
  return Array.from({ length: 14 }, (_, b) => (b === 0 ? 1 : 1 - phi((b - 0.5 - mean) / HARD_MODEL.sd)));
}
