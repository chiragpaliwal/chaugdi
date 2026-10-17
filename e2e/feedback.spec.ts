// Audio, haptics and the ARIA live region (GDD §12.3, §12.4, §14).
import { expect, test, type Page } from '@playwright/test';
import { openApp, playUntil } from './helpers';

type Fx = { contexts: number; nodes: number; vibrate: unknown[] };

/** Records AudioContext creation, sound nodes started and vibrate patterns. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __fx: Fx };
    w.__fx = { contexts: 0, nodes: 0, vibrate: [] };
    const AC = window.AudioContext;
    window.AudioContext = class extends AC {
      constructor(o?: AudioContextOptions) { super(o); w.__fx.contexts++; }
    } as typeof AudioContext;
    for (const P of [OscillatorNode.prototype, AudioBufferSourceNode.prototype]) {
      const start = P.start;
      P.start = function (this: AudioScheduledSourceNode, ...a: [number?]) { w.__fx.nodes++; return start.apply(this, a); };
    }
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p: unknown) => { w.__fx.vibrate.push(p); return true; } });
  });
}
const fx = (page: Page) => page.evaluate(() => (window as unknown as { __fx: Fx }).__fx);

test('audio waits for a gesture, then cues, haptics and announcements follow the game', async ({ page }) => {
  await instrument(page);
  await openApp(page);
  expect((await fx(page)).contexts, 'no audio before a gesture').toBe(0);
  await page.getByRole('button', { name: /play vs bots/i }).click();
  expect((await fx(page)).contexts).toBe(1);

  const log = page.getByRole('log', { name: 'Game events' });
  await expect(log).toContainText(/(passed|bid \d+)\./);
  await playUntil(page, (s) => s === 'play');
  await expect(log).toContainText(/You played .+\./);
  await expect(log.locator('p')).toHaveCount(5); // keeps the last five lines

  const after = await fx(page);
  expect(after.nodes, 'sound nodes played').toBeGreaterThan(20);
  expect(after.vibrate, 'your-turn haptic').toContainEqual(15);
});

test('Sound and Haptics off silence everything', async ({ page }) => {
  await instrument(page);
  await openApp(page, { sound: false, haptics: false });
  await page.getByRole('button', { name: /play vs bots/i }).click();
  await playUntil(page, (s) => s === 'play');
  const after = await fx(page);
  expect(after.nodes).toBe(0);
  expect(after.vibrate).toEqual([]);
  await expect(page.getByRole('log', { name: 'Game events' })).toContainText(/You played/);
});
