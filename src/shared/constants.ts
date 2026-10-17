// Animation timings shared by the client queue and the drivers' pacing (GDD §11.3, §12.2).
// HANDOFF §7 values win over GDD §12.2; each entry notes how it is built.

import type { GameEvent } from '../engine/types';

export const EASE = 'cubic-bezier(.2,.8,.2,1)';

export const MOTION = {
  roundStarted: 500, // deck appears at the dealer (GDD)
  deal5Stagger: 28,
  deal5Flight: 220,
  deal5Flip: 160,
  deal8Stagger: 70, // per 4-card packet
  deal8Flight: 260,
  bid: 300, // badge pop 240 + a beat to read it
  auctionWon: 800,
  hukumReveal: 400, // deal 8 starts at 400 underneath the reveal (HANDOFF)
  cardPlayed: 360, // 260 arc + 80 settle (you), 220 + 160 flip (others)
  cut: 200,
  trickHold: 400,
  trickSweep: 390, // 300 sweep + 3 × 30 stagger
  roundDecided: 900,
  dealerChanged: 400,
  dealerStays: 200,
  /** Round summary auto-advance (GDD §5). */
  summarySeconds: 6,
} as const;

export const DEAL5_MS = 19 * MOTION.deal5Stagger + MOTION.deal5Flight + MOTION.deal5Flip; // 912
export const DEAL8_PASS_MS = 3 * MOTION.deal8Stagger + MOTION.deal8Flight; // 470 per pass of 4 packets

export type MotionSpeed = 'reduced' | 'relaxed' | 'normal' | 'fast';

/**
 * Duration multiplier. Reduced keeps Normal pacing: the CSS removes the motion, but
 * the time is also the time to read what happened.
 */
export const SPEED_SCALE: Record<MotionSpeed, number> = { reduced: 1, relaxed: 1.25, normal: 1, fast: 0.7 };

/** Base duration of one event. Events the summary screens show take no table time. */
export function eventMs(e: GameEvent): number {
  switch (e.t) {
    case 'roundStarted': return MOTION.roundStarted;
    case 'dealt': return e.batch === 5 ? DEAL5_MS : DEAL8_PASS_MS;
    case 'bid': case 'pass': return MOTION.bid;
    case 'auctionWon': return MOTION.auctionWon;
    case 'trumpChosen': return MOTION.hukumReveal;
    case 'cardPlayed': return MOTION.cardPlayed;
    case 'cut': return MOTION.cut;
    case 'trickWon': return MOTION.trickHold + MOTION.trickSweep;
    case 'roundDecided': return MOTION.roundDecided;
    case 'handsRevealed': case 'scored': case 'dealerChanged': case 'dealerStays': case 'matchOver': return 0;
  }
}

export const scaledEventMs = (e: GameEvent, speed: MotionSpeed) => Math.round(eventMs(e) * SPEED_SCALE[speed]);

/** Time the client needs to play these events; turn timers and bot moves start after it (GDD §10.3). */
export function animBudgetMs(events: readonly GameEvent[], speed: MotionSpeed = 'normal'): number {
  return events.reduce((sum, e) => sum + scaledEventMs(e, speed), 0);
}
