import { describe, expect, it } from 'vitest';
import { planAlarm, STALE_MS, wakeAt } from './alarm';

describe('alarm planning', () => {
  const now = 1_000_000;

  it('wakes for the earliest future deadline, never a past one', () => {
    expect(wakeAt(now + 5000, false, now)).toBe(now + 5000);
    expect(wakeAt(now - 1, false, now)).toBeNull();
    expect(wakeAt(now, false, now)).toBeNull();
    expect(wakeAt(null, false, now)).toBeNull();
  });

  it('adds a sweep wake only when no deadline comes within STALE_MS', () => {
    expect(wakeAt(now + 5000, true, now)).toBe(now + 5000);
    expect(wakeAt(now + STALE_MS + 1, true, now)).toBe(now + STALE_MS);
    expect(wakeAt(null, true, now)).toBe(now + STALE_MS);
  });

  it('keeps an earlier alarm instead of moving it later', () => {
    expect(planAlarm(now + 1000, now + 20_000, now)).toBe('keep');
    expect(planAlarm(now + 1000, null, now)).toBe('keep');
    expect(planAlarm(now + 20_000, now + 1000, now)).toEqual({ set: now + 1000 });
    expect(planAlarm(null, now + 1000, now)).toEqual({ set: now + 1000 });
    // An alarm at or before now has fired (or is firing): set the next one.
    expect(planAlarm(now, now + 1000, now)).toEqual({ set: now + 1000 });
    expect(planAlarm(null, null, now)).toBe('none');
  });
});
