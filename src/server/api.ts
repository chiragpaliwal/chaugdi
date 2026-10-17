// REST API (GDD §10.8). JSON in and out; errors are `{ error: code }`.

import { getServerByName } from 'partyserver';
import { cleanNickname } from '../shared/nickname';
import { isRoomCode, newRoomCode } from '../shared/roomCode';
import { bearer, signToken, verifyToken } from './auth';
import { createPlayer, history, insertRoom, renamePlayer, roomStatus } from './db';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (error: string, status: number) => json({ error }, status);

async function body(req: Request): Promise<Record<string, unknown>> {
  if (Number(req.headers.get('Content-Length') ?? 0) > 2048) return {};
  try {
    const b: unknown = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const now = Date.now();
  const me = () => verifyToken(bearer(req), env.TOKEN_SECRET, now);

  if (path === '/api/guest' && req.method === 'POST') {
    const nickname = cleanNickname((await body(req)).nickname);
    if (!nickname) return fail('BAD_NICKNAME', 400);
    const playerId = crypto.randomUUID();
    await createPlayer(env.DB, playerId, nickname, now);
    return json({ playerId, token: await signToken(playerId, env.TOKEN_SECRET, now), nickname });
  }

  if (path === '/api/me' && req.method === 'PATCH') {
    const id = await me();
    if (!id) return fail('UNAUTHORIZED', 401);
    const nickname = cleanNickname((await body(req)).nickname);
    if (!nickname) return fail('BAD_NICKNAME', 400);
    await renamePlayer(env.DB, id, nickname, now);
    return json({ playerId: id, nickname });
  }

  if (path === '/api/me/history' && req.method === 'GET') {
    const id = await me();
    if (!id) return fail('UNAUTHORIZED', 401);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    return json({ matches: await history(env.DB, id, limit) });
  }

  if (path === '/api/rooms' && req.method === 'POST') {
    const id = await me();
    if (!id) return fail('UNAUTHORIZED', 401);
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = newRoomCode();
      if (!(await insertRoom(env.DB, code, id, now))) continue;
      const room = await getServerByName(env.GameRoom, code);
      if (!(await room.init(code, id))) continue; // a closed room's object still holds this code
      return json({ code }, 201);
    }
    return fail('NO_CODE', 503);
  }

  const m = path.match(/^\/api\/rooms\/([^/]+)$/);
  if (m && req.method === 'GET') {
    const code = m[1]!.toUpperCase();
    if (!isRoomCode(code)) return json({ exists: false, status: null, seatsOpen: 0 });
    const status = await roomStatus(env.DB, code);
    if (!status || status === 'closed') return json({ exists: false, status, seatsOpen: 0 });
    const info = await (await getServerByName(env.GameRoom, code)).info();
    return json({ exists: !!info, status: info?.status ?? status, seatsOpen: info?.seatsOpen ?? 0 });
  }

  return fail('NOT_FOUND', 404);
}
