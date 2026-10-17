import { describe, expect, it } from 'vitest';
import { cleanNickname } from '../shared/nickname';
import { parseClientMessage } from '../shared/protocol';
import { signToken, verifyToken } from './auth';
import { RateLimiter, payloadBytes } from './limits';
import { isRoomCode, newRoomCode } from '../shared/roomCode';

const ID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';

describe('guest tokens', () => {
  it('round-trips and rejects tampering, the wrong secret and expiry', async () => {
    const t = await signToken(ID, 'secret', 1000, 5000);
    expect(await verifyToken(t, 'secret', 2000)).toBe(ID);
    expect(await verifyToken(t, 'other', 2000)).toBeNull();
    expect(await verifyToken(t, 'secret', 6000)).toBeNull();
    const [id, exp, sig] = t.split('.');
    expect(await verifyToken(`${id}.${Number(exp) + 1}.${sig}`, 'secret', 2000)).toBeNull();
    expect(await verifyToken(`${ID.replace('3', '4')}.${exp}.${sig}`, 'secret', 2000)).toBeNull();
    expect(await verifyToken('junk', 'secret', 2000)).toBeNull();
    expect(await verifyToken(null, 'secret', 2000)).toBeNull();
  });
});

describe('protocol', () => {
  it('accepts known messages and rejects junk, extra fields and bad values', () => {
    expect(parseClientMessage('{"type":"play","card":"TH","seq":4}')).toEqual({ type: 'play', card: 'TH', seq: 4 });
    expect(parseClientMessage('{"type":"vote","seat":2,"choice":"wait"}')).toMatchObject({ type: 'vote', seat: 2 });
    expect(parseClientMessage('{"type":"play","card":"1H"}')).toBeNull();
    expect(parseClientMessage('{"type":"takeSeat","seat":4}')).toBeNull();
    expect(parseClientMessage('{"type":"pass","extra":1}')).toBeNull();
    expect(parseClientMessage('{"type":"hostSettings","turnSeconds":15}')).toBeNull();
    expect(parseClientMessage('{"type":"nope"}')).toBeNull();
    expect(parseClientMessage('not json')).toBeNull();
  });
});

describe('nicknames', () => {
  it('trims, enforces 2–16 characters and blocks profanity', () => {
    expect(cleanNickname('  Asha   K ')).toBe('Asha K');
    expect(cleanNickname('A')).toBeNull();
    expect(cleanNickname('x'.repeat(17))).toBeNull();
    expect(cleanNickname('Sh1t head')).toBeNull();
    expect(cleanNickname('a​b')).toBe('ab');
    expect(cleanNickname(42)).toBeNull();
  });
});

describe('limits', () => {
  it('allows 10 messages a second', () => {
    const r = new RateLimiter(10, 0);
    for (let i = 0; i < 10; i++) expect(r.take(0)).toBe(true);
    expect(r.take(0)).toBe(false);
    expect(r.take(100)).toBe(true);
    expect(r.take(100)).toBe(false);
  });
  it('measures UTF-8 bytes', () => {
    expect(payloadBytes('é')).toBe(2);
  });
});

describe('room codes', () => {
  it('uses 5 characters without 0/O/1/I/L', () => {
    for (let i = 0; i < 200; i++) {
      const c = newRoomCode();
      expect(isRoomCode(c)).toBe(true);
      expect(c).not.toMatch(/[01OIL]/);
    }
    expect(isRoomCode('K7QX0')).toBe(false);
  });
});
