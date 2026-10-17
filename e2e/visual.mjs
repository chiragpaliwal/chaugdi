// Visual check against docs/screens (HANDOFF §14): render /dev/<id> at the board size with
// deviceScaleFactor 2, then write <out>/<name>.actual.png and <name>.compare.png
// (reference | actual | diff) and print the mismatch inside the checked regions.
//
//   node e2e/visual.mjs [filter] [--out dir]

import { chromium } from 'playwright';
import { createServer } from 'vite';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : process.env.VISUAL_OUT ?? 'e2e/.out';
const filter = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');

// Regions are CSS px [y0, y1) bands that this build step covers; `mask` bands are skipped.
const CHECKS = [
  { name: '31-card-system', route: '31-card-system', w: 1440, h: 1200, ref: '31-card-system' },
  { name: '10-table', route: '10-table', w: 390, h: 844, ref: '10-your-turn-13-cards', regions: [[0, 708]], mask: [[524, 548]] },
  { name: '06-table', route: '06-table', w: 390, h: 844, ref: '06-bidding-waiting', regions: [[0, 524], [598, 724]] },
  { name: '20-table', route: '20-table', w: 390, h: 844, ref: '20-light-theme', regions: [[0, 708]], mask: [[524, 548]] },
  { name: '21-table', route: '21-table', w: 360, h: 800, ref: '21-stress-360', regions: [[0, 668]], mask: [[484, 508]] },
  { name: 'fan-lab', route: 'fan-lab', w: 1700, h: 900, fullPage: true },
  // step 4: full in-game screens
  ...['05-dealing-5', '06-bidding-waiting', '07-bid-sheet', '07b-bid-sheet-passed', '08-hukum-pick', '09-hukum-reveal-deal-8',
    '10-your-turn-13-cards', '10b-your-turn-illegal-tap', '10c-your-turn-played', '11-waiting-cut', '12-trick-resolving',
    '13-reconnecting-bot', '14-round-summary', '15-match-result', '15b-match-result-kot', '20-light-theme'].map((id) => ({ name: id, route: id, w: 390, h: 844, ref: id, step: 4 })),
  { name: '21-stress-360', route: '21-stress-360', w: 360, h: 800, ref: '21-stress-360', step: 4 },
  // step 5: menus
  ...['01-home', '02-settings', '03-lobby', '03b-lobby-full', '03c-lobby-starting'].map((id) => ({ name: id, route: id, w: 390, h: 844, ref: id, step: 5 })),
  ...['01-home~app', '01-home-resume~app', '03-lobby-guest~app', '13-vote~app', '13-vote-locked~app'].map((id) => ({ name: id, route: id, w: 390, h: 844, step: 5 })),
  // milestone 4: How to Play coach marks
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((l, i) => `04${l}-how-to-play-step-${i + 1}`).map((id) => ({ name: id, route: id, w: 390, h: 844, ref: id, step: 'tutorial' })),
  // the app as it ships (chat off): screenshots for review
  ...['05-dealing-5', '10-your-turn-13-cards', '11-waiting-cut', '12-trick-resolving'].map((id) => ({ name: `${id}~app`, route: `${id}~app`, w: 390, h: 844, step: 4 })),
];

const SCALE = 2;

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function bandMask(h, regions, mask) {
  const keep = new Uint8Array(h);
  for (const [a, b] of regions ?? [[0, h / SCALE]]) for (let y = a * SCALE; y < Math.min(h, b * SCALE); y++) keep[y] = 1;
  for (const [a, b] of mask ?? []) for (let y = a * SCALE; y < Math.min(h, b * SCALE); y++) keep[y] = 0;
  return keep;
}

function compare(check, actualFile) {
  const ref = readPng(path.join('docs/screens', `${check.ref}.png`));
  const act = readPng(actualFile);
  const w = Math.min(ref.width, act.width);
  const h = Math.min(ref.height, act.height);
  const crop = (img) => {
    const out = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) img.data.copy(out.data, y * w * 4, y * img.width * 4, y * img.width * 4 + w * 4);
    return out;
  };
  const a = crop(ref);
  const b = crop(act);
  const diff = new PNG({ width: w, height: h });
  pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.12, includeAA: false, alpha: 0.25 });

  const keep = bandMask(h, check.regions, check.mask);
  let bad = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    if (!keep[y]) {
      // grey out rows that are not part of this check
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = 40; diff.data[i + 3] = 255; }
      continue;
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      total++;
      // pixelmatch paints differing pixels pure red
      if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) bad++;
    }
  }

  const gap = 16;
  const sheet = new PNG({ width: w * 3 + gap * 2, height: h });
  sheet.data.fill(0);
  [a, b, diff].forEach((img, k) => {
    for (let y = 0; y < h; y++) img.data.copy(sheet.data, (y * sheet.width + k * (w + gap)) * 4, y * w * 4, (y + 1) * w * 4);
  });
  fs.writeFileSync(path.join(OUT, `${check.name}.compare.png`), PNG.sync.write(sheet));
  return { pct: (bad / Math.max(1, total)) * 100, sizeOk: ref.width === act.width && ref.height === act.height, ref: `${ref.width}x${ref.height}`, act: `${act.width}x${act.height}` };
}

fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch();

try {
  for (const check of CHECKS) {
    if (filter && !check.name.includes(filter)) continue;
    if (!filter && check.step && process.argv.includes('--steps123')) continue;
    const page = await browser.newPage({ viewport: { width: check.w, height: check.h }, deviceScaleFactor: SCALE });
    await page.goto(`${base}/dev/${check.route}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // freeze the looping turn/breathe animations at their bright frame
    await page.addStyleTag({ content: '*, *::before, *::after { animation-play-state: paused !important; animation-delay: -0.8s !important; transition: none !important; }' });
    await page.waitForTimeout(150);
    const file = path.join(OUT, `${check.name}.actual.png`);
    await page.screenshot({ path: file, fullPage: !!check.fullPage });
    await page.close();
    if (!check.ref) { console.log(`${check.name.padEnd(16)} screenshot only → ${file}`); continue; }
    const r = compare(check, file);
    console.log(`${check.name.padEnd(16)} ${r.pct.toFixed(2).padStart(6)}% differing  ${r.sizeOk ? '' : `(size ref ${r.ref} vs ${r.act})`}`);
  }
} finally {
  await browser.close();
  await server.close();
}
