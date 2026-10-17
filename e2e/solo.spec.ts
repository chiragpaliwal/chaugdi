// Solo match (M3): Home → deal → auction → Hukum → tricks → round summary; auto-save
// resume; offline play from the service worker (GDD §13, §17).
import { expect, test } from '@playwright/test';
import { collectErrors, openApp, playUntil, step } from './helpers';

const saved = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('chaugadi.solo.v1') ?? 'null')?.state?.round?.roundNo as number | undefined);

test('plays two rounds through the UI', async ({ page }) => {
  const noErrors = collectErrors(page);
  await openApp(page, { botLevel: 'medium' });
  await page.getByRole('button', { name: /play vs bots/i }).click();
  await expect(page.locator('.game-scr')).toBeVisible();
  let rounds = 0;
  await playUntil(page, (s) => (s === 'summary' && ++rounds >= 2) || s === 'result', { bid: true, ms: 240_000 });
  expect(rounds).toBeGreaterThanOrEqual(1);
  noErrors();
});

test('a reload resumes the same round and Home offers Resume', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /play vs bots/i }).click();
  await playUntil(page, (s) => s === 'play');
  const before = await saved(page);
  expect(before).toBe(1);
  await page.reload();
  await expect(page.locator('.game-scr')).toBeVisible();
  expect(await saved(page)).toBe(before);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /resume/i })).toBeVisible();
});

test('solo plays offline after the first load', async ({ page, context }) => {
  await openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // controlled by the worker from here
  await context.setOffline(true);
  await page.goto('/play');
  await expect(page.locator('.game-scr')).toBeVisible();
  let moved = false;
  for (let i = 0; i < 300 && !moved; i++) moved = (await step(page)) !== null;
  expect(moved, 'made a move offline').toBe(true);
  await context.setOffline(false);
});
