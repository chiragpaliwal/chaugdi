// Full keyboard play on desktop (GDD §11.4, §14): bid with 7–3 / P / arrows + Enter,
// call Hukum with S/H/D/C or arrows + Enter, play with ←/→ + Enter. No mouse after Start.
import { expect, test } from '@playwright/test';
import { openApp, visible } from './helpers';

test('a round is playable with the keyboard alone', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /play vs bots/i }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.game-scr')).toBeVisible();

  let bids = 0, hukum = 0, plays = 0;
  const deadline = Date.now() + 120_000;
  while (plays < 6 && Date.now() < deadline) {
    if (await visible(page, '.sheet[aria-label="Your call"] .sheet-btns .pass:not(.on)')) {
      const open = await page.locator('.bid-num:has-text("7"):not([aria-disabled])').count();
      if (await page.locator('.sheet-btns .pass[aria-disabled]').count()) {
        await expect(page.locator('.sheet-btns .cta')).toHaveText('Bid 7'); // the compulsory 7 is preselected
        await page.keyboard.press('p'); // ignored: the opener cannot pass
        await expect(page.locator('.sheet-btns .pass')).not.toHaveClass(/\bon\b/);
        await page.keyboard.press('Enter');
      } else if (open && bids === 0) {
        await page.keyboard.press('ArrowRight'); // selects the lowest open number
        await expect(page.locator('.sheet-btns .cta')).toHaveText('Bid 7');
        await page.keyboard.press('Enter');
      } else await page.keyboard.press('p');
      bids++;
    } else if (await visible(page, '.sheet[aria-label="Call Hukum"]')) {
      await page.keyboard.press('h');
      await expect(page.locator('#suit-H')).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#suit-D')).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Enter');
      hukum++;
      await expect(page.locator('.sheet[aria-label="Call Hukum"]')).toHaveCount(0);
    } else if (await visible(page, '.dock .cta:has-text("Pick a card")')) {
      const before = await page.locator('.fan > .card').count();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.dock .cta')).toHaveText(/^Play /);
      // Focus follows the selection and the ring is visible.
      const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
      expect(ring).not.toBe('none');
      await page.keyboard.press('Enter');
      await expect(page.locator('.fan > .card')).toHaveCount(before - 1);
      plays++;
    } else await page.waitForTimeout(60);
  }
  expect(bids).toBeGreaterThan(0);
  expect(plays).toBe(6);
  test.info().annotations.push({ type: 'keyboard', description: `bids ${bids}, hukum ${hukum}, plays ${plays}` });
});
