// How to Play (M4): 6 coach marks → "Play it" → the practice hand with its tips → Finish → Home.
import { expect, test } from '@playwright/test';
import { collectErrors, openApp, visible } from './helpers';

test('intro, practice hand with tips, Finish returns Home; the solo save is untouched', async ({ page }) => {
  const noErrors = collectErrors(page);
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('chaugadi.solo.v1', 'SENTINEL'));
  await page.reload();
  await page.getByRole('button', { name: /how to play/i }).click();
  await page.waitForURL(/\/learn$/);
  const title = () => page.locator('.coach h2').innerText();
  const next = page.locator('.coach .cb.nx');

  const intro: string[] = [];
  for (let i = 0; i < 3; i++) { intro.push(await title()); await next.click(); }
  intro.push(await title());
  const k = page.locator('#hand-KH');
  await k.click();
  await k.click();
  intro.push(await title());
  await page.click('.coach .cb.bk:has-text("Back")');
  expect(await title()).toBe(intro[3]);
  await next.click();
  await next.click();
  intro.push(await title());
  await expect(next).toHaveText('Play it');
  expect(intro).toEqual(['Asha is your partner', 'Asha bid 7', 'Spades are Hukum', 'Follow suit', 'Dev cut', 'Race to the contract']);
  await next.click();

  const tips: string[] = [];
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    if (await visible(page, '.coach')) {
      tips.push(await title());
      const label = await next.innerText();
      await next.click();
      if (label === 'Finish') break;
      continue;
    }
    // Short timeouts: a tip can open over the table between the check and the click.
    const tap = (sel: string) => page.locator(sel).first().click({ timeout: 2000 }).then(() => true, () => false);
    if (await visible(page, '.sheet[aria-label="Your call"]')) {
      if (await tap('.bid-num:has-text("7"):not([aria-disabled])')) await tap('.sheet-btns .cta');
    } else if (await visible(page, '.sheet[aria-label="Call Hukum"]')) {
      await tap('.sheet > .cta');
    } else if (await visible(page, '.dock .cta:has-text("Pick a card")')) {
      const card = '.fan > .card:not([aria-disabled])';
      if (await tap(card)) await tap(card);
    } else await page.waitForTimeout(60);
  }
  expect(tips.slice(0, 5)).toEqual(['Your first 5 cards', 'Bid or pass', 'Call Hukum', 'You lead', 'Race to the contract']);
  expect(tips.at(-1)).toBe('That’s Chaugadi');
  expect(tips.some((t) => / cut$/.test(t)), 'a cut tip').toBe(true);
  await page.waitForURL((u) => u.pathname === '/');
  expect(await page.evaluate(() => localStorage.getItem('chaugadi.solo.v1'))).toBe('SENTINEL');
  noErrors();
});

test('Skip and End practice go Home', async ({ page }) => {
  await openApp(page, {}, '/learn');
  await page.click('.coach .cb.bk:has-text("Skip")');
  await page.click('.coach .cb.nx');
  await page.click('.coach .cb.bk:has-text("End practice")');
  await page.waitForURL((u) => u.pathname === '/');
});
