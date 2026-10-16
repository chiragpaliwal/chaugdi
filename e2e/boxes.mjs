// Compare element boxes between a reference export in docs/html and a /dev route.
//   node e2e/boxes.mjs <docs/html/file.html> <dev-route> <ref selector> <our selector> [width height]
import { chromium } from 'playwright';
import { createServer } from 'vite';

const [refHtml, route, refSel, mySel, w = '390', h = '844'] = process.argv.slice(2);
const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();

async function boxes(url, sel) {
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.$$eval(sel, (els) => els.map((e) => {
    const b = e.getBoundingClientRect();
    const f = (n) => Math.round(n * 10) / 10;
    return { text: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 14), x: f(b.x), y: f(b.y), w: f(b.width), h: f(b.height) };
  }));
  await page.close();
  return r;
}

try {
  const a = await boxes(`file://${process.cwd()}/${refHtml}`, refSel);
  const b = await boxes(`${base}dev/${route}`, mySel);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const p = a[i], q = b[i];
    const d = p && q ? ['x', 'y', 'w', 'h'].map((k) => (q[k] - p[k]).toFixed(1)).join(' ') : '—';
    console.log(`${String(i).padStart(2)} ref ${p ? `${p.text.padEnd(14)} ${p.x},${p.y} ${p.w}×${p.h}` : '—'.padEnd(30)} | ours Δ(x y w h) ${d}`);
  }
} finally {
  await browser.close();
  await server.close();
}
