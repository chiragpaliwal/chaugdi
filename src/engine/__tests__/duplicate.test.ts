// Duplicate strength gates (bot plan Phase 0). Slow, opt-in: DUPLICATE=1 npx vitest run duplicate
// DUPLICATE_N sets the deal count; DUPLICATE_ONLY picks one comparison by name.
// DUPLICATE_SHARD=k plays a disjoint set of deals, so several processes can run one
// comparison in parallel; combine their DUPSTAT lines (n, sum, sum of squares).
import { describe, expect, it } from 'vitest';
import * as legacy from './legacy/index';
import { duplicateScore, env, levelBot, type BotFn } from './selfplay';

const legacyBot = (level: 'easy' | 'medium' | 'hard'): BotFn =>
  (view, rng) => legacy.decide(view, level, { rng, samples: 60, bidSamples: 100 });

const n = Number(env.DUPLICATE_N ?? 300);
const cases: [string, BotFn, BotFn, number][] = [
  // name, x, y, minimum mean points per round for x
  ['medium vs legacy medium', levelBot('medium'), legacyBot('medium'), 0],
  ['medium vs easy', levelBot('medium'), levelBot('easy'), 0.5],
  ['hard vs legacy hard', levelBot('hard'), legacyBot('hard'), 0],
  ['hard vs medium', levelBot('hard'), levelBot('medium'), 0],
  // Ablation: Hard's bid model against its old simulated bidding.
  ['hard vs hard with simulated bidding', levelBot('hard'), levelBot('hard', { mcBidding: true }), 0],
];

describe.skipIf(!env.DUPLICATE)('duplicate strength', () => {
  for (const [name, x, y, min] of cases) {
    it.skipIf(env.DUPLICATE_ONLY !== undefined && env.DUPLICATE_ONLY !== name)(name, () => {
      const shard = env.DUPLICATE_SHARD ?? '';
      const r = duplicateScore(name.includes('hard') ? Math.ceil(n / 3) : n, x, y, `${name.replace(/\W+/g, '-')}${shard}:`);
      (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(
        `\nDUPLICATE ${name}: ${r.mean.toFixed(2)} ± ${r.ci.toFixed(2)} pts/round (n=${r.n} deals)\nDUPSTAT ${r.n} ${r.sum} ${r.sumSq}\n`);
      expect(r.mean).toBeGreaterThanOrEqual(min);
    }, 3_600_000);
  }
});
