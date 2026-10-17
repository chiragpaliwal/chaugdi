// How to Play end to end (milestone 4): Home → 6 coach marks → "Play it" → the practice
// hand with its tips → Finish → Home. Also checks that the solo save is untouched.
// Run after `npm run build`: node e2e/tutorial.mjs
import { chromium } from 'playwright';
import { preview } from 'vite';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const OUT = 'e2e/.out';
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 5195, strictPort: false }, logLevel: 'error' });
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);
const title = () => page.locator('.coach h2').innerText();

try {
  await page.goto(base);
  await page.evaluate(() => {
    localStorage.setItem('chaugadi.settings.v1', JSON.stringify({ motion: 'fast' }));
    localStorage.setItem('chaugadi.solo.v1', 'SENTINEL');
  });
  await page.reload();
  await page.getByRole('button', { name: /how to play/i }).click();
  await page.waitForURL(/\/learn$/);

  // Intro: Next ×3, then step 4 lets you tap K♥ twice to move on, Back works, Next ×2.
  const intro = [];
  for (let i = 0; i < 3; i++) { intro.push(await title()); await page.click('.coach .cb.nx'); }
  intro.push(await title());
  await page.screenshot({ path: `${OUT}/tutorial-intro-hand.png` });
  const k = page.locator('#hand-KH');
  await k.click();
  await k.click();
  intro.push(await title());
  await page.click('.coach .cb.bk:has-text("Back")');
  assert.equal(await title(), intro[3]);
  await page.click('.coach .cb.nx');
  await page.click('.coach .cb.nx');
  intro.push(await title());
  assert.equal(await page.locator('.coach .cb.nx').innerText(), 'Play it');
  assert.deepEqual(intro, ['Asha is your partner', 'Asha bid 7', 'Spades are Hukum', 'Follow suit', 'Dev cut', 'Race to the contract']);
  console.log('ok  intro coach marks 1–6, tap-to-advance and Back');
  await page.click('.coach .cb.nx');

  // Practice hand.
  const tips = [];
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await visible('.coach')) {
      const t = await title();
      tips.push(t);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/tutorial-tip-${tips.length}.png` });
      const btn = page.locator('.coach .cb.nx');
      const label = await btn.innerText();
      await btn.click();
      if (label === 'Finish') break;
      continue;
    }
    if (await visible('.sheet[aria-label="Your call"]')) {
      await page.locator('.bid-num:has-text("7"):not([aria-disabled])').first().click();
      await page.click('.sheet-btns .cta');
    } else if (await visible('.sheet[aria-label="Call Hukum"]')) {
      await page.click('.sheet > .cta');
    } else if (await visible('.dock .cta:has-text("Pick a card")')) {
      const card = page.locator('.fan > .card:not([aria-disabled])').first();
      await card.click();
      await card.click();
    } else await page.waitForTimeout(80);
  }
  console.log(`tips: ${tips.join(' → ')}`);
  assert.deepEqual(tips.slice(0, 5), ['Your first 5 cards', 'Bid or pass', 'Call Hukum', 'You lead', 'Race to the contract']);
  assert.equal(tips[tips.length - 1], 'That’s Chaugadi');
  assert.ok(tips.some((t) => / cut$/.test(t)), 'a cut tip');
  await page.waitForURL((u) => u.pathname === '/');
  assert.equal(await page.evaluate(() => localStorage.getItem('chaugadi.solo.v1')), 'SENTINEL', 'solo save untouched');
  console.log('ok  practice hand with tips, Finish returns Home, solo save untouched');

  // End practice from a tip goes Home too.
  await page.getByRole('button', { name: /how to play/i }).click();
  await page.click('.coach .cb.bk:has-text("Skip")');
  await page.click('.coach .cb.nx');
  await page.waitForSelector('.coach .cb.bk:has-text("End practice")');
  await page.click('.coach .cb.bk:has-text("End practice")');
  await page.waitForURL((u) => u.pathname === '/');
  console.log('ok  Skip and End practice');

  assert.deepEqual(errors, [], 'no console errors');
} catch (e) {
  await page.screenshot({ path: `${OUT}/tutorial-failure.png` });
  console.error(errors);
  throw e;
} finally {
  await browser.close();
  await server.close();
}
