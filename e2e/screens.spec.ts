// Screen interaction checks (HANDOFF §6) against the dev fixture routes (/dev/<id>~app).
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './urls';

test.use({ baseURL: DEV_URL });

const open = async (page: Page, id: string) => {
  await page.goto(`/dev/${id}~app`);
  await page.waitForSelector('.game-scr, .result-scr, .menu-scr');
};
const text = (page: Page, sel: string) => page.$eval(sel, (e) => e.textContent!.trim());

test('07 bid sheet: locked numbers ignore taps, picking previews on seat and centre', async ({ page }) => {
  await open(page, '07-bid-sheet');
  expect(await text(page, '.sheet-btns .cta')).toBe('Bid 9');
  await page.click('.bid-num:has-text("8")', { force: true });
  expect(await text(page, '.sheet-btns .cta'), 'a locked number never selects').toBe('Bid 9');
  await page.click('.bid-num:has-text("10")');
  expect(await text(page, '.sheet-btns .cta')).toBe('Bid 10');
  expect(await text(page, '.seat.me .nb.pending')).toBe('10');
  expect(await text(page, '.high-bid .n')).toBe('10');
  await page.keyboard.press('2'); // GDD §11.4: 2 = 12
  expect(await text(page, '.sheet-btns .cta')).toBe('Bid 12');
  await page.click('.sheet-btns .pass');
  expect(await text(page, '.sheet-btns .cta')).toBe('Passed');
  expect(await text(page, '.pass-line')).toMatch(/You passed\. Three in a row: Ben plays 8\./);
  expect(await text(page, '.high-bid .k-label')).toBe('Auction closed');
});

test('08 Hukum: picking hearts re-sorts the hand hearts-first with the notch', async ({ page }) => {
  await open(page, '08-hukum-pick');
  await page.click('.suit-tile:has-text("Hearts")');
  expect(await page.$eval('.fan > .card', (e) => e.getAttribute('aria-label'))).toBe('King of hearts, Hukum');
  expect(await text(page, '.sheet > .cta')).toMatch(/Call\s*Hukum/);
  expect(await text(page, '.hukum-pick .w')).toBe('Hearts · not called yet');
});

test('10 your turn: illegal tap explains, clears after 2.5 s; second tap plays', async ({ page }) => {
  await open(page, '10-your-turn-13-cards');
  expect(await text(page, '.dock .cta')).toBe('Play A♣');
  await page.click('#hand-KH', { force: true });
  expect(await text(page, '.hint')).toBe('Must follow ♣. You have 3 clubs.');
  await expect(page.locator('.hint.warn')).toHaveCount(1);
  await expect(page.locator('#hand-AC'), 'illegal tap keeps the selection').toHaveClass(/is-selected/);
  await page.waitForTimeout(2700);
  expect(await text(page, '.hint')).toBe('A♣ follows ♣. Dev’s 4♠ cut still wins this trick.');
  await page.click('#hand-9C');
  expect(await text(page, '.dock .cta')).toBe('Play 9♣');
  await page.click('#hand-9C');
  expect(await text(page, '.dock .cta')).toBe('Trick resolving');
  await expect(page.locator('.fan > .card')).toHaveCount(12);
  await expect(page.locator('.trick-card[aria-label^="You played 9 of clubs"]')).toHaveCount(1);
});

test('13 held: cards are not playable and the toast dismisses', async ({ page }) => {
  await open(page, '13-reconnecting-bot');
  await page.click('#hand-AS', { force: true });
  await expect(page.locator('.fan > .card')).toHaveCount(5);
  await page.click('.toast .x');
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('14 round summary: Ready marks you ready', async ({ page }) => {
  await open(page, '14-round-summary');
  await page.click('.rs-dock .cta');
  expect(await text(page, '.rs-ready .t')).toMatch(/^3 of 4 ready/);
});

test('01 home → 03 lobby: room code input, fill with bot, partner, start, cancel', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.menu-scr');
  await expect(page.locator('.join-row .jb.go')).toHaveCount(0);
  await page.fill('.code-field input', 'k7q0dlm');
  expect(await page.inputValue('.code-field input'), '0 and L are not in the room alphabet').toBe('K7QDM');
  await expect(page.locator('.join-row .jb.go')).toHaveCount(1);
  await page.click('.join-row .jb');
  await page.waitForSelector('.room-code');
  expect(new URL(page.url()).pathname).toBe('/r/K7QDM');

  expect(await text(page, '.lobby-cta')).toMatch(/^Start · waiting for 1 seat/);
  await page.click('.lslot .fill');
  await expect(page.locator('.lslot .nm:has-text("· bot")')).not.toHaveCount(0);
  await expect(page.locator('.lobby-cta')).toContainText('everyone’s ready', { timeout: 4000 });
  await page.click('.seg[aria-label="Your partner"] button:has-text("Ben")');
  expect(await page.$$eval('.lslot .nm', (els) => els[2]!.textContent), 'Ben moved to the top seat').toBe('Ben');
  await page.click('.lobby-cta');
  expect(await text(page, '.lobby-cta')).toMatch(/^Dealing in 3/);
  await page.click('.lobby-cancel');
  expect(await text(page, '.lobby-cta')).toMatch(/everyone’s ready/);
});

test('02 settings: theme, deck and motion switch the <html> attributes and persist', async ({ page }) => {
  await page.goto('/settings');
  await page.waitForSelector('.set-grp');
  await page.click('.seg[aria-label="Theme"] button:has-text("Light")');
  await page.click('.seg[aria-label="Deck colours"] button:has-text("2-colour")');
  await page.click('.seg[aria-label="Animation speed"] button:has-text("Reduced")');
  const attrs = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  expect([attrs.theme, attrs.deck, attrs.motion]).toEqual(['light', '2', 'reduced']);
  await page.reload();
  await page.waitForSelector('.set-grp');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});

test('02 settings: volume shows only with sound on and persists', async ({ page }) => {
  await page.goto('/settings');
  const volume = page.getByRole('slider', { name: 'Volume' });
  await expect(volume).toBeVisible();
  await volume.fill('40');
  await page.reload();
  await expect(volume).toHaveValue('40');
  await page.getByRole('switch', { name: 'Sound' }).click();
  await expect(volume).toHaveCount(0);
});

test('13 vote: wait is locked above 0:30; a majority to wait adds a minute; bot hands the seat over', async ({ page }) => {
  await open(page, '13-vote-locked');
  expect(await page.$eval('.vote .opts button:first-child', (e) => e.getAttribute('aria-disabled'))).toBe('true');
  await open(page, '13-vote');
  const before = await text(page, '.vote .r');
  await page.click('.vote .opts button:has-text("Wait 1 more minute")');
  await page.waitForTimeout(1300);
  const after = await text(page, '.vote .r');
  const secs = (t: string) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
  expect(secs(after), `${before} → ${after}`).toBeGreaterThan(secs(before) + 50);
  await page.click('.vote .opts button:has-text("Let a bot play")');
  await expect(page.locator('.toast')).toContainText('A bot is playing Ben’s hand');
  await expect(page.locator('.seat .nm[aria-label="Bot, Ben"]')).toHaveCount(1);
});

test('every button is at least 44 × 44 on every screen (GDD §13)', async ({ page }) => {
  for (const id of ['01-home', '02-settings', '03-lobby', '03b-lobby-full', '03c-lobby-starting', '13-vote', '05-dealing-5', '06-bidding-waiting', '07-bid-sheet', '08-hukum-pick', '09-hukum-reveal-deal-8', '10-your-turn-13-cards', '11-waiting-cut', '12-trick-resolving', '13-reconnecting-bot', '14-round-summary', '15-match-result']) {
    await open(page, id);
    const small = await page.$$eval('button', (els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      // Count an absolutely positioned ::before as the hit area (negative insets extend it).
      const ext = (v: string) => (v.endsWith('px') ? Math.max(0, -parseFloat(v)) : 0);
      let w = r.width, h = r.height;
      for (const pseudo of ['::before', '::after']) {
        const b = getComputedStyle(e, pseudo);
        if (b.content === 'none' || b.position !== 'absolute') continue;
        w = Math.max(w, r.width + ext(b.left) + ext(b.right));
        h = Math.max(h, r.height + ext(b.top) + ext(b.bottom));
      }
      return { l: e.getAttribute('aria-label') ?? e.textContent!.trim(), w, h };
    }).filter((b) => b.w < 44 || b.h < 44));
    expect(small, id).toEqual([]);
  }
});
