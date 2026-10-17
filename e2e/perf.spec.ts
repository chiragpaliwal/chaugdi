// Performance budgets (GDD §13, §17): initial JS ≤ 200 KB gzip, LCP < 2 s on a
// mid-range phone over 4G, and a smooth trick sweep with the CPU slowed down.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { openApp, step, visible } from './helpers';

const DIST = 'dist/client';
const KB = 1024;

test('initial JS is at most 200 KB gzip (the bots load later in a worker)', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const urls = [...html.matchAll(/<script[^>]+src="([^"]+)"|<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1] ?? m[2]!);
  expect(urls.length).toBeGreaterThan(0);
  const sizes = urls.map((u) => ({ u, gz: gzipSync(readFileSync(join(DIST, u))).length }));
  const total = sizes.reduce((s, x) => s + x.gz, 0);
  test.info().annotations.push({ type: 'initial JS', description: `${(total / KB).toFixed(1)} KB gzip: ${sizes.map((s) => `${s.u} ${(s.gz / KB).toFixed(1)}`).join(', ')}` });
  expect(total).toBeLessThanOrEqual(200 * KB);
});

test('LCP under 2 s on 4G with a 4× slower CPU', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // A mid-range 4G link: 100 ms round trip, 4 Mbps down, 3 Mbps up.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: (4e6 / 8), uploadThroughput: (3e6 / 8) });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/');
  const lcp = await page.evaluate(() => new Promise<number>((resolve) => {
    let last = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) last = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => resolve(last), 3000);
  }));
  test.info().annotations.push({ type: 'LCP', description: `${Math.round(lcp)} ms` });
  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThan(2000);
});

test('trick sweep stays smooth with a 4× slower CPU', async ({ page }) => {
  await openApp(page, { motion: 'normal' });
  await page.getByRole('button', { name: /play vs bots/i }).click();
  // Get to trick play, then measure frames across the next sweep.
  const deadline = Date.now() + 90_000;
  while (!(await visible(page, '.trick-card')) && Date.now() < deadline) await step(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const frames = await page.evaluate(() => new Promise<number[]>((resolve) => {
    const gaps: number[] = [];
    let measuring = false;
    let prev = 0;
    const stopAt = performance.now() + 60_000;
    const tick = (t: number) => {
      const sweeping = !!document.querySelector('.trick-card.sweeping');
      if (sweeping && !measuring) { measuring = true; prev = t; }
      else if (measuring) { gaps.push(t - prev); prev = t; }
      if (measuring && !sweeping) return resolve(gaps);
      if (t > stopAt) return resolve(gaps);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Keep the game moving while we wait: the human seat plays its first legal card.
    const auto = setInterval(() => {
      const cta = document.querySelector<HTMLElement>('.dock .cta');
      if (cta?.textContent?.match(/Pick a card|^Play /)) {
        // Tap to select, then tap the selected card on the next tick (React re-renders between).
        const c = document.querySelector<HTMLElement>('.fan > .card.is-selected') ?? document.querySelector<HTMLElement>('.fan > .card:not([aria-disabled])');
        c?.click();
      }
      if (gaps.length && !measuring) clearInterval(auto);
    }, 200);
  }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  expect(frames.length, 'saw a sweep').toBeGreaterThan(5);
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  const avg = frames.reduce((s, x) => s + x, 0) / frames.length;
  test.info().annotations.push({ type: 'sweep', description: `${frames.length} frames, avg ${avg.toFixed(1)} ms (${(1000 / avg).toFixed(0)} fps), p95 ${p95.toFixed(1)} ms` });
  expect(1000 / avg).toBeGreaterThanOrEqual(50);
  expect(p95).toBeLessThan(34);
});
