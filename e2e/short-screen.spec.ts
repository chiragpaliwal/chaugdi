// Short phone screens: a phone browser's toolbars leave far less than the 844 the boards
// are drawn for. Settings scrolls to its last group; the bid and Hukum sheets keep their
// buttons on screen (the table gives up the height), and still work below that.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, openApp, playUntil, step } from './helpers';

/** True when the element sits inside the first screenful, no scrolling needed. */
const onFirstScreen = (l: Locator) => l.evaluate((e) => {
  const r = e.getBoundingClientRect();
  return r.top + scrollY >= 0 && r.bottom + scrollY <= innerHeight;
});

async function playFirstRound(page: Page, check?: (s: 'bid' | 'hukum' | 'play') => Promise<void>) {
  const noErrors = collectErrors(page);
  await openApp(page);
  await page.getByRole('button', { name: /play vs bots/i }).click();
  const seen = new Set<string>();
  await playUntil(page, async (s) => {
    if (s === 'bid' || s === 'hukum' || s === 'play') seen.add(s);
    return s === 'summary' || s === 'result';
  }, {
    bid: true,
    ms: 120_000,
    inspect: async (s) => { if (s === 'bid' || s === 'hukum' || s === 'play') await check?.(s); },
  });
  expect(seen.has('bid') && seen.has('play'), 'reached the auction and the tricks').toBe(true);
  noErrors();
}

test.describe('390 × 700', () => {
  test.use({ viewport: { width: 390, height: 700 } });

  test('the bid sheet, Hukum sheet and play dock fit without scrolling', async ({ page }) => {
    await playFirstRound(page, async (s) => {
      if (s === 'bid') {
        await expect(page.locator('.sheet-btns .pass')).toBeVisible();
        expect(await onFirstScreen(page.locator('.sheet-btns .pass')), 'Pass on screen').toBe(true);
        expect(await onFirstScreen(page.locator('.sheet-btns .cta')), 'Bid on screen').toBe(true);
      } else if (s === 'hukum') {
        expect(await onFirstScreen(page.locator('.sheet > .cta')), 'Call Hukum on screen').toBe(true);
      } else {
        expect(await onFirstScreen(page.locator('.dock .cta')), 'Play on screen').toBe(true);
      }
    });
  });
});

test.describe('390 × 640', () => {
  test.use({ viewport: { width: 390, height: 640 } });

  test('settings scrolls down to the Bots and You groups', async ({ page }) => {
    await openApp(page, {}, '/settings');
    const hard = page.getByRole('radio', { name: 'Hard' });
    await hard.click();
    await expect(hard).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('textbox', { name: 'Nickname' }).fill('Kabir');
    await expect(page.getByRole('textbox', { name: 'Nickname' })).toBeInViewport();
    expect(await page.evaluate(() => scrollY), 'the page scrolled').toBeGreaterThan(0);
  });

  test('a round plays through: Pass and Bid are reachable', async ({ page }) => {
    await playFirstRound(page);
  });
});

test('a bid sends with the Bid button after picking a number', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await openApp(page);
  await page.getByRole('button', { name: /play vs bots/i }).click();
  await expect(page.locator('.sheet[aria-label="Your call"]')).toBeVisible({ timeout: 60_000 });
  const open = page.locator('.bid-num:not([aria-disabled])').first();
  const n = (await open.getAttribute('data-bid'))!;
  await open.click();
  await expect(page.locator('.sheet-btns .cta')).toHaveText(`Bid ${n}`);
  await page.locator('.sheet-btns .cta').click();
  await expect(page.locator('.sheet[aria-label="Your call"]')).toBeHidden();
  // Keep going so nothing breaks after the bid lands.
  for (let i = 0; i < 20; i++) await step(page, { bid: true });
});
