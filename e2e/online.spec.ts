// Online play (M6, GDD §4.2, §10.6, §17): two guests in separate browser contexts make a
// room on the real Worker, GameRoom Durable Object and local D1 (`vite preview`), fill
// two bots and play; a killed tab gets its seat back. Needs `npm run db:migrate`.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { collectErrors, openApp, step, visible, type Step } from './helpers';

/** A fresh guest in its own context (own localStorage, own guest id). */
async function guest(browser: Browser, nickname: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await openApp(page, { nickname } as never);
  return { context, page };
}

/** Host creates a room, the guest joins by code, the host fills two bots, both start. */
async function startRoom(browser: Browser) {
  const asha = await guest(browser, 'Asha');
  const ben = await guest(browser, 'Ben');
  await asha.page.getByRole('button', { name: /create room/i }).click();
  await asha.page.waitForURL(/\/r\/[A-Z0-9]{5}$/);
  const code = asha.page.url().slice(-5);
  await expect(asha.page.locator('.room-code .c')).toHaveText(code);

  await ben.page.getByLabel(/room code/i).fill(code);
  await ben.page.getByRole('button', { name: 'Join', exact: true }).click();
  await ben.page.waitForURL(`**/r/${code}`);
  await expect(asha.page.locator('.lslot .nm', { hasText: 'Ben' })).toBeVisible();

  const fill = asha.page.getByRole('button', { name: /fill with bot/i });
  await fill.first().click();
  await expect(fill).toHaveCount(1);
  await fill.first().click();
  await expect(fill).toHaveCount(0);
  await ben.page.getByRole('button', { name: /i’m ready/i }).click();
  await asha.page.getByRole('button', { name: /everyone’s ready/i }).click();
  await expect(asha.page.locator('.game-scr')).toBeVisible({ timeout: 15_000 });
  await expect(ben.page.locator('.game-scr')).toBeVisible({ timeout: 15_000 });
  return { asha, ben, code };
}

/** Both players act on their own pages until `done` says stop. */
async function playBoth(pages: Page[], done: (steps: Step[]) => boolean | Promise<boolean>, ms = 150_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const steps: Step[] = [];
    for (const p of pages) steps.push(await step(p, { bid: true }));
    if (await done(steps)) return;
  }
  throw new Error('playBoth: deadline passed');
}

test('two guests make a room, fill bots and play a round', async ({ browser }) => {
  const { asha, ben } = await startRoom(browser);
  const errors = [collectErrors(asha.page), collectErrors(ben.page)];
  // Seats are absolute in the room and relative on screen: each sees "You" at the bottom.
  await expect(asha.page.locator('.seat.me')).toBeVisible();
  await expect(ben.page.locator('.seat.me')).toBeVisible();

  let summaries = 0;
  await playBoth([asha.page, ben.page], (s) => (summaries += s.filter((x) => x === 'summary').length) >= 2 || s.includes('result'));
  // The table announces events for screen readers online too.
  await expect(asha.page.locator('[role="log"][aria-label="Game events"] p').first()).toBeAttached();
  // Both summaries advance together into round 2 (the server waits for both or 6 s).
  await expect(asha.page.locator('.game-scr')).toBeVisible({ timeout: 20_000 });
  for (const e of errors) e();
  await asha.context.close();
  await ben.context.close();
});

test('a killed tab rejoins its seat; the others vote a bot in meanwhile', async ({ browser }) => {
  const { asha, ben, code } = await startRoom(browser);
  // Ben's tab dies mid-match.
  await ben.page.close();
  await expect(asha.page.getByRole('status', { name: /ben is reconnecting/i })).toBeVisible({ timeout: 15_000 });
  await asha.page.getByRole('radio', { name: /let a bot play/i }).click();
  await expect(asha.page.getByText('Ben left.')).toBeVisible({ timeout: 10_000 });

  // The table keeps going with a bot in Ben's seat (Asha still has to act on her turns).
  const progressed = async () => (await asha.page.locator('.trick-card').count()) > 0 || await visible(asha.page, '.result-scr');
  const deadline = Date.now() + 60_000;
  while (!(await progressed()) && Date.now() < deadline) await step(asha.page, { bid: true });

  // Same device, new tab: the guest id in localStorage takes the seat back with a fresh view.
  const back = await ben.context.newPage();
  const noErrors = collectErrors(back);
  const started = Date.now();
  await back.goto(`/r/${code}`);
  await expect(back.locator('.game-scr, .result-scr')).toBeVisible({ timeout: 30_000 });
  expect(Date.now() - started).toBeLessThan(30_000);
  await expect(back.locator('.seat.me')).toHaveCount(await back.locator('.game-scr').count());
  await expect(asha.page.getByRole('status', { name: /ben is reconnecting/i })).toHaveCount(0);
  noErrors();
  await asha.context.close();
  await ben.context.close();
});

test('joining a code with no room explains, and a room link without a nickname asks for one', async ({ page }) => {
  await openApp(page, { nickname: 'Cara' } as never);
  await page.getByLabel(/room code/i).fill('ZZZZZ');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/no open room/i);

  await openApp(page, { nickname: '' } as never, '/r/ZZZZZ');
  await expect(page.getByRole('dialog', { name: /pick a nickname/i })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nickname' }).fill('Cara');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/no room with that code/i)).toBeVisible({ timeout: 15_000 });
});
