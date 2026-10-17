// Haptics (GDD §12.4, HANDOFF §7) through navigator.vibrate where it exists.

export const HAPTIC = {
  yourTurn: 15,
  trickOurs: 10,
  hukum: 25,
  made: [20, 40, 20],
  failed: 60,
  matchWon: [40, 60, 40, 60, 120],
  kot: [60, 40, 60, 40, 60, 40, 200],
} as const;

export type Pattern = number | readonly number[];

export function vibrate(p: Pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(p as number | number[]);
  } catch {
    // unsupported or blocked: no haptic
  }
}
