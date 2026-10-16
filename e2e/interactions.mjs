// Interaction checks for the step 4 screens (HANDOFF §6). Run: node e2e/interactions.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const server = await createServer({ server: { port: 5193, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const open = async (id) => { await page.goto(`${base}/dev/${id}~app`); await page.waitForSelector('.game-scr, .result-scr, .menu-scr'); };
const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`ok  ${name}`); };

try {
  await check('07 bid sheet: locked numbers ignore taps, picking previews on seat and centre', async () => {
    await open('07-bid-sheet');
    assert.equal(await text('.sheet-btns .cta'), 'Bid 9');
    await page.click('.bid-num:has-text("8")', { force: true });
    assert.equal(await text('.sheet-btns .cta'), 'Bid 9', 'a locked number never selects');
    await page.click('.bid-num:has-text("10")');
    assert.equal(await text('.sheet-btns .cta'), 'Bid 10');
    assert.equal(await text('.seat.me .nb.pending'), '10');
    assert.equal(await text('.high-bid .n'), '10');
    await page.keyboard.press('2'); // GDD §11.4: 2 = 12
    assert.equal(await text('.sheet-btns .cta'), 'Bid 12');
    await page.click('.sheet-btns .pass');
    assert.equal(await text('.sheet-btns .cta'), 'Passed');
    assert.match(await text('.pass-line'), /You passed\. Three in a row: Ben plays 8\./);
    assert.equal(await text('.high-bid .k-label'), 'Auction closed');
  });

  await check('08 Hukum: picking hearts re-sorts the hand hearts-first with the notch', async () => {
    await open('08-hukum-pick');
    await page.click('.suit-tile:has-text("Hearts")');
    const first = await page.$eval('.fan > .card', (e) => e.getAttribute('aria-label'));
    assert.equal(first, 'King of hearts, Hukum');
    assert.match(await text('.sheet > .cta'), /Call\s*Hukum/);
    assert.equal(await text('.hukum-pick .w'), 'Hearts · not called yet');
  });

  await check('10 your turn: illegal tap explains, clears after 2.5 s; second tap plays', async () => {
    await open('10-your-turn-13-cards');
    assert.equal(await text('.dock .cta'), 'Play A♣');
    await page.click('#hand-KH', { force: true });
    assert.equal(await text('.hint'), 'Must follow ♣. You have 3 clubs.');
    assert.ok(await page.$('.hint.warn'));
    assert.equal(await page.$eval('#hand-AC', (e) => e.classList.contains('is-selected')), true, 'illegal tap keeps the selection');
    await page.waitForTimeout(2700);
    assert.equal(await text('.hint'), 'A♣ follows ♣. Dev’s 4♠ cut still wins this trick.');
    await page.click('#hand-9C');
    assert.equal(await text('.dock .cta'), 'Play 9♣');
    await page.click('#hand-9C');
    assert.equal(await text('.dock .cta'), 'Trick resolving');
    assert.equal(await page.$$eval('.fan > .card', (els) => els.length), 12);
    assert.ok(await page.$('.trick-card[aria-label^="You played 9 of clubs"]'));
  });

  await check('13 held: cards are not playable and the toast dismisses', async () => {
    await open('13-reconnecting-bot');
    await page.click('#hand-AS', { force: true });
    assert.equal(await page.$$eval('.fan > .card', (els) => els.length), 5);
    await page.click('.toast .x');
    assert.equal(await page.$('.toast'), null);
  });

  await check('14 round summary: Ready marks you ready', async () => {
    await open('14-round-summary');
    await page.click('.rs-dock .cta');
    assert.match(await text('.rs-ready .t'), /^3 of 4 ready/);
  });

  await check('01 home: join stays off until 5 valid characters; banned letters are dropped', async () => {
    await page.goto(`${base}/`);
    await page.waitForSelector('.menu-scr');
    assert.equal(await page.$('.join-row .jb.go'), null);
    await page.fill('.code-field input', 'k7q0dlm');
    assert.equal(await page.inputValue('.code-field input'), 'K7QDM', '0 and L are not in the room alphabet');
    assert.ok(await page.$('.join-row .jb.go'));
    await page.click('.join-row .jb');
    await page.waitForSelector('.room-code');
    assert.equal(new URL(page.url()).pathname, '/r/K7QDM');
  });

  await check('03 lobby: fill with bot, pick a partner, start, cancel', async () => {
    assert.match(await text('.lobby-cta'), /^Start · waiting for 1 seat/);
    await page.click('.lslot .fill');
    assert.ok(await page.$('.lslot .nm:has-text("· bot")'));
    await page.waitForFunction(() => document.querySelector('.lobby-cta')?.textContent?.includes('everyone’s ready'), null, { timeout: 4000 });
    await page.click('.seg[aria-label="Your partner"] button:has-text("Ben")');
    assert.equal(await page.$$eval('.lslot .nm', (els) => els[2].textContent), 'Ben', 'Ben moved to the top seat');
    await page.click('.lobby-cta');
    assert.match(await text('.lobby-cta'), /^Dealing in 3/);
    await page.click('.lobby-cancel');
    assert.match(await text('.lobby-cta'), /everyone’s ready/);
  });

  await check('02 settings: theme, deck and motion switch the <html> attributes and persist', async () => {
    await page.goto(`${base}/settings`);
    await page.waitForSelector('.set-grp');
    await page.click('.seg[aria-label="Theme"] button:has-text("Light")');
    await page.click('.seg[aria-label="Deck colours"] button:has-text("2-colour")');
    await page.click('.seg[aria-label="Animation speed"] button:has-text("Reduced")');
    const attrs = await page.evaluate(() => ({ ...document.documentElement.dataset }));
    assert.deepEqual([attrs.theme, attrs.deck, attrs.motion], ['light', '2', 'reduced']);
    await page.reload();
    await page.waitForSelector('.set-grp');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await page.evaluate(() => localStorage.clear());
  });

  await check('13 vote: wait is locked above 0:30; a majority to wait adds a minute; bot hands the seat over', async () => {
    await open('13-vote-locked');
    assert.equal(await page.$eval('.vote .opts button:first-child', (e) => e.getAttribute('aria-disabled')), 'true');
    await open('13-vote');
    const before = await text('.vote .r');
    await page.click('.vote .opts button:has-text("Wait 1 more minute")');
    await page.waitForTimeout(1300);
    const after = await text('.vote .r');
    const secs = (t) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
    assert.ok(secs(after) > secs(before) + 50, `${before} → ${after}`);
    await page.click('.vote .opts button:has-text("Let a bot play")');
    await page.waitForSelector('.toast');
    assert.match(await text('.toast'), /A bot is playing Ben’s hand/);
    assert.ok(await page.$('.seat .nm:has-text("Ben · bot")'));
  });

  await check('all buttons are at least 44 × 44 on every screen', async () => {
    for (const id of ['01-home', '02-settings', '03-lobby', '03b-lobby-full', '03c-lobby-starting', '13-vote', '05-dealing-5', '06-bidding-waiting', '07-bid-sheet', '08-hukum-pick', '09-hukum-reveal-deal-8', '10-your-turn-13-cards', '11-waiting-cut', '12-trick-resolving', '13-reconnecting-bot', '14-round-summary', '15-match-result']) {
      await open(id);
      const small = await page.$$eval('button', (els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        // Count an absolutely positioned ::before as the hit area (negative insets extend it).
        const ext = (v) => (v.endsWith('px') ? Math.max(0, -parseFloat(v)) : 0);
        let w = r.width, h = r.height;
        for (const pseudo of ['::before', '::after']) {
          const b = getComputedStyle(e, pseudo);
          if (b.content === 'none' || b.position !== 'absolute') continue;
          w = Math.max(w, r.width + ext(b.left) + ext(b.right));
          h = Math.max(h, r.height + ext(b.top) + ext(b.bottom));
        }
        return { l: e.getAttribute('aria-label') ?? e.textContent.trim(), w, h };
      }).filter((b) => b.w < 44 || b.h < 44));
      assert.deepEqual(small, [], `${id}: ${JSON.stringify(small)}`);
    }
  });
  console.log(`\n${passed} checks passed`);
} finally {
  await browser.close();
  await server.close();
}
