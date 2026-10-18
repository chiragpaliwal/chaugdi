// Bid calibration and policy sweep. Opt-in and slow: CALIBRATE=1 npx vitest run calibrate --silent=false

import { describe, it } from 'vitest';
import { decide, intentToAction, type BotLevel } from '../bots';
import { bidFeatures, estimateOdds, evaluateHand, ownFive, type BidPolicy } from '../bots/bid';
import { DISPLAY_SUIT_ORDER } from '../cards';
import { fullRoundTricks } from '../bots/mc';
import { apply, newMatch } from '../reducer';
import { rngFrom, shuffle, SORTED_DECK } from '../rng';
import { DEFAULT_CONFIG, suitOf, type CardId, type MatchState, type Seat } from '../types';
import { viewFor } from '../view';
import { env } from './selfplay';

/** One match where each team bids with its own policy. */
function match(seed: string, policies: [BidPolicy, BidPolicy], level: BotLevel = 'medium'): MatchState {
  const rng = rngFrom(`tune:${seed}`);
  let s = newMatch(DEFAULT_CONFIG, seed, Math.floor(rng() * 4) as Seat);
  while (s.phase !== 'MATCH_END') {
    if (s.phase === 'ROUND_EVAL') { s = apply(s, { type: 'NEXT_ROUND' }).state; continue; }
    const seat = s.round!.turn!;
    const intent = decide(viewFor(s, seat), level, { rng, bidPolicy: policies[seat % 2]! })!;
    s = apply(s, intentToAction(intent, seat)).state;
  }
  return s;
}

describe.skipIf(!env.CALIBRATE)('bid calibration', () => {
  it('fits team tricks against ownFive', () => {
    const rng = rngFrom('cal');
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const d = shuffle(SORTED_DECK, rng);
      const hands = { 0: d.slice(0, 13), 1: d.slice(13, 26), 2: d.slice(26, 39), 3: d.slice(39) } as Record<Seat, CardId[]>;
      const five = hands[0].slice(0, 5);
      const { trump } = evaluateHand(five);
      xs.push(ownFive(five, trump));
      ys.push(fullRoundTricks(hands, trump, 0));
    }
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; }
    const slope = sxy / sxx, intercept = my - slope * mx;
    let rss = 0;
    for (let i = 0; i < n; i++) rss += (ys[i]! - intercept - slope * xs[i]!) ** 2;
    console.info(`CALIBRATION intercept ${intercept.toFixed(2)} slope ${slope.toFixed(2)} sd ${Math.sqrt(rss / n).toFixed(2)}`);
  }, 600_000);

  it('fits Hard\'s bid model', () => {
    const rng = rngFrom('model');
    const n = Number(env.CALIBRATE_DEALS ?? 40000);
    const X: number[][] = [], y: number[] = [];
    // Would this five bid of its own accord (Medium's estimate meets τ = 2/3 at 7)?
    const bids = (five: CardId[]) => (estimateOdds(evaluateHand(five).best)[7] ?? 0) >= 2 / 3;
    for (let i = 0; i < n; i++) {
      const d = shuffle(SORTED_DECK, rng);
      const hands = { 0: d.slice(0, 13), 1: d.slice(13, 26), 2: d.slice(26, 39), 3: d.slice(39) } as Record<Seat, CardId[]>;
      const five = hands[0].slice(0, 5);
      // Half the deals use the preferred trump, half a random suit held in the five, so the
      // model also ranks the suits it does not prefer.
      const held = DISPLAY_SUIT_ORDER.filter((s) => five.some((c) => suitOf(c) === s));
      const trump = i % 2 ? evaluateHand(five).trump : held[Math.floor(rng() * held.length)]!;
      const sig = { partnerBid: bids(hands[2].slice(0, 5)), opponentBids: (bids(hands[1].slice(0, 5)) ? 1 : 0) + (bids(hands[3].slice(0, 5)) ? 1 : 0) };
      X.push(bidFeatures(five, trump, sig));
      y.push(fullRoundTricks(hands, trump, 0));
    }
    const k = X[0]!.length;
    // Normal equations (XᵀX) w = Xᵀy, solved by Gaussian elimination.
    const A = Array.from({ length: k }, (_, r) => Array.from({ length: k + 1 }, (_, c) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += X[i]![r]! * (c < k ? X[i]![c]! : y[i]!);
      return s;
    }));
    for (let c = 0; c < k; c++) {
      let p = c;
      for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
      [A[c], A[p]] = [A[p]!, A[c]!];
      for (let r = 0; r < k; r++) {
        if (r === c) continue;
        const f = A[r]![c]! / A[c]![c]!;
        for (let j = c; j <= k; j++) A[r]![j]! -= f * A[c]![j]!;
      }
    }
    const w = A.map((row, r) => row[k]! / row[r]!);
    let rss = 0;
    for (let i = 0; i < n; i++) rss += (y[i]! - X[i]!.reduce((a, v, j) => a + v * w[j]!, 0)) ** 2;
    console.info(`HARD_MODEL w: [${w.map((v) => v.toFixed(3)).join(', ')}] sd: ${Math.sqrt(rss / n).toFixed(2)}`);
  }, 1_800_000);

  it('sweeps bid policies', () => {
    const n = Number(env.CALIBRATE_N ?? 200);
    const ref: BidPolicy = { tau: 2 / 3, jump: false };
    const rows: string[] = [];
    for (const tau of [2 / 3, 0.6, 0.55, 0.5, 0.45, 0.4]) {
      for (const jump of [false, true]) {
        const p: BidPolicy = { tau, jump };
        let rounds = 0, made = 0, forced = 0, bidSum = 0, wins = 0;
        for (let i = 0; i < n; i++) {
          const s = match(`self${i}`, [p, p]);
          rounds += s.history.length;
          for (const h of s.history) { if (h.outcome !== 'FAILED') made++; if (h.contract.forced) forced++; bidSum += h.contract.bid; }
          // Head to head against the reference, both seatings.
          if (match(`h2h${i}`, [p, ref]).winner === 'A') wins++;
          if (match(`h2h${i}`, [ref, p]).winner === 'B') wins++;
        }
        rows.push(`tau ${tau.toFixed(2)} jump ${jump ? 'y' : 'n'} | rounds ${(rounds / n).toFixed(1)} made ${(made / rounds).toFixed(2)} forced ${(forced / rounds).toFixed(2)} avgBid ${(bidSum / rounds).toFixed(2)} | vs ref ${(wins / (2 * n)).toFixed(3)}`);
      }
    }
    console.info(`\nSWEEP (n=${n}; vs ref = win rate against tau 2/3, minimum bids)\n${rows.join('\n')}`);
  }, 3_600_000);
});
