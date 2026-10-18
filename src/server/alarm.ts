// Alarm planning for the GameRoom's single alarm slot, kept pure for tests. Free-tier
// budget: each alarm that fires is a billed request, and each setAlarm() is a row written
// (100k rows a day). Turn deadlines move later on almost every move, so re-arming each
// time would cost a row per move; instead an earlier alarm stays armed, fires early, finds
// nothing due and re-arms once.

/** A socket silent this long during a match is half-open: the sweep closes it. */
export const STALE_MS = 30_000;

/**
 * When the room needs to wake: its earliest deadline, or a sweep while seated sockets are
 * open mid-match. Any alarm runs the sweep, so a separate wake is needed only when no
 * deadline comes within `STALE_MS`. Never a time that is not in the future.
 */
export function wakeAt(deadline: number | null, sweeping: boolean, now: number): number | null {
  const want = deadline !== null && deadline > now ? deadline : null;
  if (sweeping && (want === null || want > now + STALE_MS)) return now + STALE_MS;
  return want;
}

/**
 * What to do with the alarm slot. `armed` is the alarm already set (null for none).
 * 'keep' when it fires no later than needed: an early fire is one request, cheaper than a
 * row per re-arm.
 */
export function planAlarm(armed: number | null, want: number | null, now: number): { set: number } | 'keep' | 'none' {
  if (armed !== null && armed > now && (want === null || armed <= want)) return 'keep';
  return want === null ? 'none' : { set: want };
}
