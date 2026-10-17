import { expect, type Page } from '@playwright/test';

export type Settings = Partial<{ motion: string; botLevel: string; sound: boolean; haptics: boolean; matchLength: string }>;

/** Fresh app with these settings saved (fast motion unless told otherwise). */
export async function openApp(page: Page, settings: Settings = {}, path = '/') {
  await page.goto('/');
  await page.evaluate((s) => localStorage.setItem('chaugadi.settings.v1', JSON.stringify(s)), { motion: 'fast', ...settings });
  await page.goto(path);
}

/** Fails the test on any page error or console error. */
export function collectErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return () => expect(errors, 'console errors').toEqual([]);
}

export const visible = (page: Page, sel: string) => page.locator(sel).first().isVisible().catch(() => false);

export type Step = 'bid' | 'hukum' | 'play' | 'summary' | 'result' | 'tip' | null;

/** One move of a simple human: bid 7 when allowed (if `bid`), else pass; call Hukum; play the first legal card. */
export async function step(page: Page, opts: { bid?: boolean } = {}): Promise<Step> {
  if (await visible(page, '.sheet[aria-label="Your call"]')) {
    const seven = page.locator('.bid-num:has-text("7"):not([aria-disabled])');
    if (opts.bid && await seven.count()) { await seven.first().click(); await page.click('.sheet-btns .cta'); }
    else await page.click('.sheet-btns .pass');
    return 'bid';
  }
  if (await visible(page, '.sheet[aria-label="Call Hukum"]')) { await page.click('.sheet > .cta'); return 'hukum'; }
  if (await visible(page, '.dock .cta:has-text("Pick a card")')) {
    const card = page.locator('.fan > .card:not([aria-disabled])').first();
    await card.click();
    await card.click();
    return 'play';
  }
  if (await visible(page, '.result-scr .rs-dock .cta')) { await page.click('.rs-dock .cta'); return 'summary'; }
  if (await visible(page, '.mr-btns')) return 'result';
  await page.waitForTimeout(60);
  return null;
}

/** Steps until `until` returns true or the deadline passes. */
export async function playUntil(page: Page, until: (s: Step) => boolean | Promise<boolean>, opts: { bid?: boolean; ms?: number } = {}) {
  const deadline = Date.now() + (opts.ms ?? 90_000);
  while (Date.now() < deadline) {
    const s = await step(page, opts);
    if (await until(s)) return s;
  }
  throw new Error('playUntil: deadline passed');
}
