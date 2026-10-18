// Socket identity and liveness against the real Worker and GameRoom in workerd
// (docs/MULTIPLAYER_LESSONS.md §2, §3). partysocket reuses its connection id (`_pk`) on
// every reconnect, so the server must not use `conn.id` to tell sockets apart: here a
// page reconnects with the same `_pk`, the old socket closes late, and the player must
// stay connected. Also checks the runtime's ping auto-response and a second tab.
// Run: `npm run e2e:race`.

import { createServer } from 'vite';

const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const wsBase = base.replace(/^http/, 'ws');

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

/** A socket with a chosen partysocket id (`_pk`). Raw frames ("pong") are kept as strings. */
function connect(code, token, name, pk) {
  const ws = new WebSocket(`${wsBase}/parties/game-room/${code}?_pk=${pk}&token=${encodeURIComponent(token)}&name=${name}&reason=initial`);
  const msgs = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    let m = e.data;
    try { m = JSON.parse(e.data); } catch { /* raw frame */ }
    msgs.push(m);
    for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const closed = new Promise((r) => ws.addEventListener('close', (e) => r(e.code)));
  return {
    ws, msgs, closed,
    send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
    next(test, ms = 10_000, what = 'message') {
      const hit = msgs.find(test);
      if (hit !== undefined) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms);
        waiters.push({ test, resolve: (m) => { clearTimeout(t); resolve(m); } });
      });
    },
  };
}

/** Ben's seat (1) as Asha last saw it. */
function benSeat(asha) {
  const rooms = asha.msgs.filter((m) => m?.type === 'lobby' || m?.type === 'sync');
  return rooms.at(-1)?.room.seats[1] ?? null;
}

try {
  const asha = await api('/api/guest', { method: 'POST', body: { nickname: 'Asha' } });
  const ben = await api('/api/guest', { method: 'POST', body: { nickname: 'Ben' } });
  const { code } = await api('/api/rooms', { method: 'POST', token: asha.token });

  const a = connect(code, asha.token, 'Asha', 'page-asha');
  await a.next((m) => m?.type === 'sync', 10_000, 'Asha sync');

  // ---- the same page reconnects: same `_pk`, the old socket closes late
  const old = connect(code, ben.token, 'Ben', 'page-ben');
  await old.next((m) => m?.type === 'sync', 10_000, 'Ben sync');
  const fresh = connect(code, ben.token, 'Ben', 'page-ben');
  await fresh.next((m) => m?.type === 'sync', 10_000, 'Ben resync');
  check((await old.closed) === 1000, 'race: the leftover socket of the same page is closed as superseded');
  await sleep(500);
  check(benSeat(a)?.connected === true, 'race: after the late close Ben is still connected');

  fresh.send({ type: 'setReady', ready: true });
  await a.next((m) => m?.type === 'lobby' && m.room.seats[1]?.ready, 10_000, 'ready');
  check(benSeat(a)?.connected === true, 'race: the new socket still acts for Ben');

  // ---- heartbeat: the runtime answers a raw ping
  fresh.send('ping');
  check((await fresh.next((m) => m === 'pong', 5_000, 'pong')) === 'pong', 'ping: a raw ping gets a raw pong');
  check(!fresh.msgs.some((m) => m?.type === 'error'), 'ping: no BAD_MESSAGE or RATE_LIMITED from pings');

  // ---- a second tab (another `_pk`) opens and closes: the first keeps Ben connected
  const tab = connect(code, ben.token, 'Ben', 'page-ben-2');
  await tab.next((m) => m?.type === 'sync', 10_000, 'second tab sync');
  check(fresh.ws.readyState === WebSocket.OPEN, 'tabs: a second tab does not close the first');
  tab.ws.close();
  await tab.closed;
  await sleep(500);
  check(benSeat(a)?.connected === true, 'tabs: closing the second tab keeps Ben connected');

  // ---- the last socket closes: now Ben is offline
  fresh.ws.close();
  await a.next((m) => m?.type === 'lobby' && m.room.seats[1] && !m.room.seats[1].connected, 10_000, 'Ben offline');
  check(true, 'close: closing the last socket marks Ben offline');
  a.ws.close();
} catch (e) {
  check(false, String(e));
} finally {
  await server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
