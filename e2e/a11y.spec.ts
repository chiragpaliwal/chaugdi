// Accessibility pass (GDD §14, §17; HANDOFF §9): axe finds no serious or critical
// WCAG A/AA issues on the main screens, in both themes. A11Y_REPORT=1 lists them all without failing.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp, playUntil, visible } from './helpers';

async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`) }));
  if (process.env.A11Y_REPORT) { for (const b of bad) console.log(`A11Y ${name} ${b.id} ${b.nodes.join(" | ")}`); return; }
  expect(bad, `${name}: ${JSON.stringify(bad, null, 1)}`).toEqual([]);
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test('Home and Settings', async ({ page }) => {
      await openApp(page, { theme } as never);
      await page.waitForSelector('.menu-scr');
      await audit(page, 'home');
      await page.goto('/settings');
      await page.waitForSelector('.set-grp');
      await audit(page, 'settings');
    });

    test('online lobby', async ({ page }) => {
      await openApp(page, { theme, nickname: 'Asha' } as never);
      await page.getByRole('button', { name: /create room/i }).click();
      await page.waitForSelector('.room-code');
      await page.getByRole('button', { name: /fill with bot/i }).first().click();
      await expect(page.getByRole('button', { name: /^remove /i })).toBeVisible();
      await audit(page, 'lobby');
    });

    test('bid sheet, Hukum, your turn and round summary', async ({ page }) => {
      await openApp(page, { theme } as never);
      await page.getByRole('button', { name: /play vs bots/i }).click();
      const seen = new Set<string>();
      const names = { bid: 'bid sheet', hukum: 'hukum', play: 'your turn', summary: 'round summary', result: 'match result' } as const;
      // Audit each screen once, just before the move answers it.
      const inspect = async (s: keyof typeof names) => {
        if (seen.has(s)) return;
        seen.add(s);
        await audit(page, names[s]);
      };
      await playUntil(page, (s) => s === 'summary' || s === 'result', { bid: true, ms: 150_000, inspect });
      expect([...seen]).toEqual(expect.arrayContaining(['bid', 'play', 'summary']));
    });
  });
}

test('How to Play coach mark', async ({ page }) => {
  await openApp(page, {}, '/learn');
  await page.waitForSelector('.coach');
  await audit(page, 'coach mark');
});
