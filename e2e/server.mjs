// Server smoke test (GDD §10): the real Worker, GameRoom Durable Object and local D1 in
// workerd through `vite dev`. Two guests make a room, fill two bots, play a round, drop
// and rejoin a socket, and read their history. Every message is checked for cards the
// receiver may not see. Run: `npm run db:migrate && node e2e/server.mjs`.

import { createServer } from 'vite';

const server = await createServer({ server: { port: 5196, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const wsBase = base.replace(/^http/, 'ws');

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
};

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

/** A socket that keeps every message and can wait for one matching a test. */
function connect(code, token, name) {
  const ws = new WebSocket(`${wsBase}/parties/game-room/${code}?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}`);
  const msgs = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    msgs.push(m);
    for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const closed = new Promise((r) => ws.addEventListener('close', (e) => r(e.code)));
  return {
    ws, msgs, closed,
    send: (m) => ws.send(JSON.stringify(m)),
    next(test, ms = 60_000, what = 'message') {
      const hit = msgs.find(test);
      if (hit) { msgs.splice(msgs.indexOf(hit), 1); return Promise.resolve(hit); }
      return new Promise((resolve, reject) => {
        const w = { test, resolve: (m) => { msgs.splice(msgs.indexOf(m), 1); clearTimeout(t); resolve(m); } };
        const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`timed out waiting for ${what}`)); }, ms);
        waiters.push(w);
      });
    },
    opened: new Promise((r) => ws.addEventListener('open', r)),
  };
}

try {
  // ---- REST
  const bad = await api('/api/guest', { method: 'POST', body: { nickname: 'x' } });
  check(bad.status === 400, 'guest: a 1-character nickname is refused');
  const asha = (await api('/api/guest', { method: 'POST', body: { nickname: 'Asha' } })).json;
  const ben = (await api('/api/guest', { method: 'POST', body: { nickname: 'Ben' } })).json;
  check(!!asha.token && !!ben.playerId, 'guest: two players created');
  check((await api('/api/rooms', { method: 'POST' })).status === 401, 'rooms: creating needs a token');
  const created = await api('/api/rooms', { method: 'POST', token: asha.token });
  const code = created.json.code;
  check(created.status === 201 && /^[2-9A-HJKMNP-Z]{5}$/.test(code), `rooms: created ${code}`);
  const info = (await api(`/api/rooms/${code}`)).json;
  check(info.exists && info.status === 'lobby' && info.seatsOpen === 4, 'rooms: lookup shows 4 open seats');
  check((await api('/api/rooms/ZZZZZ')).json.exists === false, 'rooms: an unknown code does not exist');
  check((await api('/api/me', { method: 'PATCH', token: ben.token, body: { nickname: 'Benji' } })).json.nickname === 'Benji', 'me: rename');

  // ---- sockets
  const forged = connect(code, `${asha.playerId}.9999999999999.bad`, 'Asha');
  check((await forged.closed) === 4001, 'socket: a forged token is closed with 4001');
  const ghost = connect('ZZZZZ', asha.token, 'Asha');
  check((await ghost.closed) === 4004, 'socket: an unknown room is closed with 4004');

  const a = connect(code, asha.token, 'Asha');
  const aSync = await a.next((m) => m.type === 'sync', 10_000, 'sync');
  check(aSync.room.you === 0 && aSync.room.seats[0].isHost, 'socket: the host is seated at 0');
  let b = connect(code, ben.token, 'Ben');
  const bSync = await b.next((m) => m.type === 'sync', 10_000, 'sync');
  check(bSync.room.you === 1, 'socket: the guest is seated at 1');

  a.send({ type: 'fillBot', seat: 2 });
  a.send({ type: 'fillBot', seat: 3 });
  b.send({ type: 'fillBot', seat: 2 });
  check((await b.next((m) => m.type === 'error')).code === 'NOT_HOST', 'lobby: only the host fills seats');
  b.send({ type: 'setReady', ready: true });
  await a.next((m) => m.type === 'lobby' && m.room.seats[1]?.ready && m.room.seats[3]);
  a.send({ type: 'start' });
  check(!!(await a.next((m) => m.type === 'lobby' && m.room.status === 'starting')), 'lobby: the countdown starts');
  const first = await a.next((m) => m.type === 'update', 10_000, 'first deal');
  check(first.view.hand.length === 5 && first.events[0].t === 'roundStarted', 'match: 5 cards dealt after the countdown');

  // ---- play one round: humans move as soon as it is their turn
  const players = { 0: a, 1: b };
  const latest = { 0: first.view, 1: null };
  const seen = { 0: [], 1: [] };
  let leaks = 0;
  let lastSeq = { 0: first.seq, 1: 0 };
  let ordered = true;
  const onUpdate = (seat, m) => {
    if (m.type !== 'update' && !(m.type === 'sync' && m.view)) return;
    if (m.type === 'update') { if (m.seq <= lastSeq[seat]) ordered = false; lastSeq[seat] = m.seq; }
    latest[seat] = m.view;
    seen[seat].push(m);
  };
  for (const seat of [0, 1]) players[seat].msgs.splice(0).forEach((m) => onUpdate(seat, m));
  const hook = (seat) => players[seat].ws.addEventListener('message', (e) => onUpdate(seat, JSON.parse(e.data)));
  hook(0); hook(1);

  const act = (seat) => {
    const v = latest[seat];
    if (!v || v.turn !== v.you) return false;
    if (v.phase === 'BIDDING') players[seat].send({ type: v.auction.high ? 'pass' : 'bid', ...(v.auction.high ? {} : { value: 7 }), seq: v.seq });
    else if (v.phase === 'TRUMP_SELECTION') players[seat].send({ type: 'chooseTrump', suit: 'S', seq: v.seq });
    else if (v.phase === 'TRICK_LOOP') players[seat].send({ type: 'play', card: v.legal[0], seq: v.seq });
    else return false;
    latest[seat] = { ...v, turn: null }; // wait for the next update
    return true;
  };

  const deadline = Date.now() + 120_000;
  let dropped = false;
  while (Date.now() < deadline) {
    const v = latest[0];
    if (v?.phase === 'ROUND_EVAL' || v?.phase === 'MATCH_END') break;
    // Mid-round, Ben's socket dies and comes back.
    if (!dropped && v?.phase === 'TRICK_LOOP' && v.tricks.length >= 2) {
      dropped = true;
      b.ws.close();
      const p = await a.next((m) => m.type === 'presence' && m.seat === 1 && !m.connected, 10_000, 'presence');
      check(p.control === 'held', 'reconnect: the dropped seat shows as held');
      b = connect(code, ben.token, 'Benji');
      players[1] = b;
      const sync = await b.next((m) => m.type === 'sync', 10_000, 'resync');
      check(sync.room.you === 1 && sync.view?.hand.length > 0 && sync.room.seats[1].control === 'human', 'reconnect: the seat comes back with a full view');
      onUpdate(1, sync);
      b.msgs.splice(0);
      hook(1);
      continue;
    }
    if (!act(0) && !act(1)) await new Promise((r) => setTimeout(r, 25));
  }
  check(latest[0]?.phase === 'ROUND_EVAL' || latest[0]?.phase === 'MATCH_END', `match: round 1 decided (${latest[0]?.phase})`);
  check(dropped, 'reconnect: exercised');
  check(ordered, 'protocol: update seqs strictly increase');

  // Leak check: before the reveal, nothing Ben received names a card in Asha's hand, and the reverse.
  for (const [me, other] of [[0, 1], [1, 0]]) {
    for (const m of seen[me]) {
      if (m.view?.revealedHands) continue;
      const otherView = [...seen[other]].reverse().find((x) => x.view && x.view.roundNo === m.view.roundNo && !x.view.revealedHands);
      if (!otherView) continue;
      const json = JSON.stringify(m);
      // Cards still in the other player's hand at the later point were hidden at this one.
      for (const c of otherView.view.hand) if (json.includes(`"${c}"`)) leaks++;
    }
  }
  check(leaks === 0, `protocol: no hidden cards reached the other player (${leaks})`);

  if (latest[0].phase === 'ROUND_EVAL') {
    const round = latest[0].roundNo;
    a.send({ type: 'continue' });
    b.send({ type: 'continue' });
    await a.next((m) => m.type === 'update' && m.view.roundNo === round + 1, 15_000, 'round 2');
    check(true, 'match: both continued and round 2 dealt');
  }

  const hist = (await api('/api/me/history', { token: asha.token })).json;
  check(hist.matches?.length === 1 && hist.matches[0].roomCode === code && hist.matches[0].seed === null, 'history: the match is listed with its seed hidden');
  a.send({ type: 'ping' });
  check(!!(await a.next((m) => m.type === 'pong')), 'ping: pong');
  a.ws.send('x'.repeat(3000));
  a.send({ type: 'nope' });
  check((await a.next((m) => m.type === 'error')).code === 'BAD_MESSAGE', 'protocol: oversize is dropped, junk is refused');
  a.ws.close();
  b.ws.close();
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await server.close();
}
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
