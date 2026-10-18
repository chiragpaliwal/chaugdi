import { expect, type Locator, type Page } from '@playwright/test';

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

/** Clicks unless the element goes away first (online, a sheet closes when the update lands). */
const tap = (l: Locator) => l.click({ timeout: 3000 }).then(() => true, () => false);

/** One move of a simple human: open at 7, or bid 7 when allowed (if `bid`), else pass; call Hukum; play the first legal card. */
export interface StepOptions {
  bid?: boolean;
  /** Called with the screen just found, before the move answers it (audits, screenshots). */
  inspect?: (s: Exclude<Step, null | 'tip'>) => Promise<void>;
}

export async function step(page: Page, opts: StepOptions = {}): Promise<Step> {
  const seen = async (s: Exclude<Step, null | 'tip'>) => { await opts.inspect?.(s); return s; };
  if (await visible(page, '.sheet[aria-label="Your call"]')) {
    await seen('bid');
    const seven = page.locator('.bid-num:has-text("7"):not([aria-disabled])');
    const mustOpen = await page.locator('.sheet-btns .pass[aria-disabled]').count();
    if (mustOpen) await tap(page.locator('.sheet-btns .cta')); // the compulsory 7 is preselected
    else if (opts.bid && await seven.count()) { if (await tap(seven.first())) await tap(page.locator('.sheet-btns .cta')); }
    else await tap(page.locator('.sheet-btns .pass'));
    return 'bid';
  }
  if (await visible(page, '.sheet[aria-label="Call Hukum"]')) { await seen('hukum'); await tap(page.locator('.sheet > .cta')); return 'hukum'; }
  if (await visible(page, '.dock .cta:has-text("Pick a card")')) {
    await seen('play');
    const card = page.locator('.fan > .card:not([aria-disabled])').first();
    if (await tap(card)) await tap(card);
    return 'play';
  }
  if (await visible(page, '.result-scr .rs-dock .cta')) { await seen('summary'); await tap(page.locator('.rs-dock .cta')); return 'summary'; }
  if (await visible(page, '.mr-btns')) return seen('result');
  await page.waitForTimeout(60);
  return null;
}

/** Steps until `until` returns true or the deadline passes. */
export async function playUntil(page: Page, until: (s: Step) => boolean | Promise<boolean>, opts: StepOptions & { ms?: number } = {}) {
  const deadline = Date.now() + (opts.ms ?? 90_000);
  while (Date.now() < deadline) {
    const s = await step(page, opts);
    if (await until(s)) return s;
  }
  throw new Error('playUntil: deadline passed');
}
