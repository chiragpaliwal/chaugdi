// Guest identity and the REST API (GDD §10.4, §10.8). The first online action creates a
// guest; the id and token live in localStorage so this device keeps its seats.

import { cleanNickname } from '../../shared/nickname';
import { useSettings } from '../stores/settings';

const KEY = 'chaugadi.guest.v1';

export interface Guest { playerId: string; token: string; nickname: string }

export interface RoomInfo { exists: boolean; status: 'lobby' | 'starting' | 'playing' | 'over' | 'open' | 'closed' | null; seatsOpen: number }

/** `OFFLINE` when the request never reached the server. Otherwise the API's error code. */
export class ApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

export function loadGuest(): Guest | null {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Guest | null;
    return g && typeof g.playerId === 'string' && typeof g.token === 'string' ? g : null;
  } catch {
    return null;
  }
}

function saveGuest(g: Guest | null) {
  try {
    if (g) localStorage.setItem(KEY, JSON.stringify(g));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the guest lives for this tab only
  }
  memory = g;
}

let memory: Guest | null = null;
const current = () => loadGuest() ?? memory;

/** The token was refused (the server's secret changed): the next call makes a new guest. */
export function forgetGuest() { saveGuest(null); }

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('OFFLINE', 0);
  }
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? 'SERVER_ERROR', res.status);
  return data as T;
}

let pending: Promise<Guest> | null = null;

/** This device's guest, created on first use and renamed when the nickname changed. */
export function ensureGuest(nickname: string): Promise<Guest> {
  pending ??= (async () => {
    const name = cleanNickname(nickname);
    if (!name) throw new ApiError('BAD_NICKNAME', 400);
    const g = current();
    if (g) {
      if (g.nickname === name) return g;
      try {
        await call('/api/me', { method: 'PATCH', token: g.token, body: { nickname: name } });
        const renamed = { ...g, nickname: name };
        saveGuest(renamed);
        return renamed;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        forgetGuest();
      }
    }
    const made = await call<{ playerId: string; token: string; nickname: string }>('/api/guest', { method: 'POST', body: { nickname: name } });
    const fresh = { playerId: made.playerId, token: made.token, nickname: made.nickname };
    saveGuest(fresh);
    return fresh;
  })().finally(() => { pending = null; });
  return pending;
}

/** POST /api/rooms: a new room hosted by this guest. */
export async function createRoom(nickname: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const g = await ensureGuest(nickname);
    try {
      return (await call<{ code: string }>('/api/rooms', { method: 'POST', token: g.token })).code;
    } catch (e) {
      if (attempt > 0 || !(e instanceof ApiError && e.status === 401)) throw e;
      forgetGuest();
    }
  }
}

/** GET /api/rooms/:code, for the join field. */
export const roomInfo = (code: string) => call<RoomInfo>(`/api/rooms/${encodeURIComponent(code)}`);

/** Copy for a failed create or join. */
export function apiMessage(e: unknown): string {
  const code = e instanceof ApiError ? e.code : 'SERVER_ERROR';
  switch (code) {
    case 'OFFLINE': return 'You’re offline. Rooms need a connection; Play vs bots works offline.';
    case 'BAD_NICKNAME': return 'Pick a nickname of 2–16 letters first.';
    case 'NO_CODE': return 'The server is busy. Try again in a moment.';
    default: return 'Something went wrong. Try again.';
  }
}

/** Renames the guest on the server when the nickname setting changes. */
export function bindGuestRename(): () => void {
  let timer: number | undefined;
  return useSettings.subscribe((s, prev) => {
    if (s.nickname === prev.nickname || !current() || !cleanNickname(s.nickname)) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { ensureGuest(s.nickname).catch(() => {}); }, 800);
  });
}
