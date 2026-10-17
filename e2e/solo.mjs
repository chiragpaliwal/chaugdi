// Solo match end to end (milestone 3): Home → deal → auction → Hukum → tricks → round
// summary, then auto-save resume and offline play from the service worker.
// Run after `npm run build`: node e2e/solo.mjs [rounds=2]
import { chromium } from 'playwright';
import { preview } from 'vite';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const ROUNDS = Number(process.argv[2] ?? 2);
const OUT = 'e2e/.out';
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 5194, strictPort: false }, logLevel: 'error' });
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const seen = new Set();
const shot = async (name) => { if (!seen.has(name)) { seen.add(name); await page.screenshot({ path: `${OUT}/solo-${name}.png` }); } };
const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);

/** One step of a simple human: bid 7 when open, else pass; call Hukum; play the first legal card. */
async function step(round) {
  if (await visible('.sheet[aria-label="Your call"]')) {
    await shot('bid-sheet');
    const seven = page.locator('.bid-num:has-text("7"):not([aria-disabled])');
    if (round === 1 && await seven.count()) { await seven.first().click(); await page.click('.sheet-btns .cta'); }
    else await page.click('.sheet-btns .pass');
    return 'bid';
  }
  if (await visible('.sheet[aria-label="Call Hukum"]')) { await shot('hukum'); await page.click('.sheet > .cta'); return 'hukum'; }
  if (await visible('.dock .cta:has-text("Pick a card")')) {
    await shot('your-turn');
    const card = page.locator('.fan > .card:not([aria-disabled])').first();
    await card.click();
    await card.click();
    return 'play';
  }
  if (await visible('.result-scr .rs-dock .cta')) { await shot('summary'); await page.click('.rs-dock .cta'); return 'summary'; }
  if (await visible('.mr-btns')) { await shot('result'); return 'result'; }
  if (await visible('.hukum-reveal')) await shot('reveal');
  if (await visible('.deal-slots')) await shot('deal5');
  if (await visible('.trick-card.sweeping')) await shot('sweep');
  if (await visible('.high-bid')) await shot('auction');
  await page.waitForTimeout(80);
  return null;
}

try {
  await page.goto(base);
  await page.evaluate(() => localStorage.setItem('chaugadi.settings.v1', JSON.stringify({ motion: 'fast', botLevel: 'medium' })));
  await page.reload();
  await page.getByRole('button', { name: /play vs bots/i }).click();
  await page.waitForSelector('.game-scr');

  let rounds = 0;
  const deadline = Date.now() + ROUNDS * 120_000;
  while (rounds < ROUNDS && Date.now() < deadline) {
    const did = await step(rounds + 1);
    if (did === 'summary') rounds++;
    if (did === 'result') break;
  }
  assert.ok(rounds >= Math.min(ROUNDS, 1), `finished ${rounds} rounds`);
  console.log(`ok  played ${rounds} round(s) through the UI`);

  // Auto-save: a reload resumes the same round.
  await page.waitForSelector('.game-scr');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('chaugadi.solo.v1')).state.round.roundNo);
  await page.reload();
  await page.waitForSelector('.game-scr');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('chaugadi.solo.v1')).state.round.roundNo);
  assert.equal(after, before);
  console.log(`ok  reload resumes round ${after}`);

  // Home shows the resume banner.
  await page.goto(base);
  await page.waitForSelector('button:has-text("Resume")');
  console.log('ok  Home offers Resume');

  // Offline: the service worker serves the shell and solo mode still plays.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // controlled by the worker from here
  await context.setOffline(true);
  await page.goto(`${base}/play`);
  await page.waitForSelector('.game-scr', { timeout: 10_000 });
  let moved = false;
  for (let i = 0; i < 200 && !moved; i++) moved = (await step(1)) !== null;
  assert.ok(moved, 'made a move offline');
  await context.setOffline(false);
  console.log('ok  solo plays offline after first load');

  assert.deepEqual(errors, [], 'no console errors');
  console.log(`screens captured: ${[...seen].join(', ')}`);
} catch (e) {
  await page.screenshot({ path: `${OUT}/solo-failure.png` });
  console.error(errors);
  throw e;
} finally {
  await browser.close();
  await server.close();
}
