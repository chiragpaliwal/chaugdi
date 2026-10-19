// One online match on production: host + 3 Hard bots, logging every WebSocket frame.
// Run: npx tsx e2e/prod-cost-probe.ts <outdir>
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { step } from './helpers';

const BASE = 'https://chaugadi.chiragpaliwal.com';
const out = process.argv[2] ?? '.';

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const frames: { t: number; dir: 'in' | 'out'; bytes: number; type: string; url: string }[] = [];
const http: { t: number; method: string; url: string; status?: number }[] = [];
const t0 = Date.now();
page.on('request', (r) => { if (r.url().includes('/api/')) http.push({ t: Date.now() - t0, method: r.method(), url: r.url() }); });
page.on('websocket', (ws) => {
  const rec = (dir: 'in' | 'out') => (f: { payload: string | Buffer }) => {
    const s = String(f.payload);
    let type = s;
    try { type = JSON.parse(s).type ?? s; } catch { /* ping/pong */ }
    frames.push({ t: Date.now() - t0, dir, bytes: Buffer.byteLength(s), type, url: ws.url() });
  };
  ws.on('framereceived', rec('in'));
  ws.on('framesent', rec('out'));
  ws.on('close', () => frames.push({ t: Date.now() - t0, dir: 'in', bytes: 0, type: '__close', url: ws.url() }));
});

await page.goto('/');
await page.evaluate(() => localStorage.setItem('chaugadi.settings.v1', JSON.stringify({ motion: 'fast', nickname: 'CostProbe' })));
await page.goto('/');
await page.getByRole('button', { name: /create room/i }).click();
await page.waitForURL(/\/r\/[A-Z0-9]{5}$/);
const code = page.url().slice(-5);
console.log('room', code);

const fill = page.getByRole('button', { name: /fill with bot/i });
for (let i = 0; i < 3; i++) { await fill.first().click(); await page.waitForTimeout(400); }
await page.getByRole('radio', { name: 'Hard' }).click().catch(() => page.getByText('Hard', { exact: true }).click());
await page.waitForTimeout(500);
await page.getByRole('button', { name: /everyone’s ready/i }).click();
await page.locator('.game-scr').waitFor({ timeout: 20_000 });
const tStart = Date.now() - t0;
console.log('match started at', tStart);

let rounds = 0;
const deadline = Date.now() + 25 * 60_000;
while (Date.now() < deadline) {
  const s = await step(page, { bid: true });
  if (s === 'summary') console.log('round', ++rounds, 'at', Date.now() - t0);
  if (s === 'result') break;
}
const tEnd = Date.now() - t0;
console.log('match over at', tEnd, 'rounds', rounds);
await page.screenshot({ path: `${out}/result.png` });
// Stay a little so the post-match messages and any alarms land, then leave.
await page.waitForTimeout(5000);
await context.close();
await browser.close();
writeFileSync(`${out}/probe.json`, JSON.stringify({ code, t0, tStart, tEnd, rounds, http, frames }, null, 1));
console.log('frames', frames.length);
