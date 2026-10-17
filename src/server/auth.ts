// Guest tokens (GDD §10.4): `playerId.exp.HMAC-SHA256(TOKEN_SECRET)`, checked with Web
// Crypto so the Durable Object needs no D1 lookup on the hot path.

const enc = new TextEncoder();
export const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/** Constant-time string compare. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signToken(playerId: string, secret: string, now: number, ttlMs = TOKEN_TTL_MS): Promise<string> {
  const body = `${playerId}.${now + ttlMs}`;
  return `${body}.${await hmac(secret, body)}`;
}

/** The player id, or null when the token is malformed, forged or expired. */
export async function verifyToken(token: string | null | undefined, secret: string, now: number): Promise<string | null> {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts as [string, string, string];
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d+$/.test(exp)) return null;
  if (Number(exp) <= now) return null;
  return same(sig, await hmac(secret, `${id}.${exp}`)) ? id : null;
}

/** The bearer token of an API request. */
export const bearer = (req: Request) => req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1] ?? null;
