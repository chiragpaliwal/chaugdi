// Bot strength comparison. Skipped unless STRENGTH=1 (slow).
import { describe, expect, it } from 'vitest';
import { env, teamAWinRate } from './selfplay';

describe.skipIf(!env.STRENGTH)('bot strength', () => {
  it('Medium beats Easy; Hard beats Medium', () => {
    const n = Number(env.STRENGTH_N ?? 200);
    const me = (teamAWinRate(n, { 0: 'medium', 1: 'easy', 2: 'medium', 3: 'easy' }, 'me') + 1 - teamAWinRate(n, { 0: 'easy', 1: 'medium', 2: 'easy', 3: 'medium' }, 'em')) / 2;
    const hn = Math.max(10, Math.floor(n / 10));
    const hm = (teamAWinRate(hn, { 0: 'hard', 1: 'medium', 2: 'hard', 3: 'medium' }, 'hm') + 1 - teamAWinRate(hn, { 0: 'medium', 1: 'hard', 2: 'medium', 3: 'hard' }, 'mh')) / 2;
    console.info(`\nSTRENGTH medium-vs-easy ${me.toFixed(3)} (n=${2 * n}) hard-vs-medium ${hm.toFixed(3)} (n=${2 * hn})\n`);
    expect(me).toBeGreaterThan(0.5);
    expect(hm).toBeGreaterThan(0.5);
  }, 3_600_000);
});
