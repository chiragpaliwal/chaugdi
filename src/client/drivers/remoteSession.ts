// The online room session lives outside React, like the solo one (session.ts), so
// StrictMode remounts keep one socket. Leaving the room page closes it (Settings opens
// inside the room page for that reason).

import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimQueue } from '../anim/queue';
import { ensureGuest, forgetGuest } from '../net/guest';
import { useSettings } from '../stores/settings';
import { RemoteDriver } from './remote';

export interface RemoteSession {
  code: string;
  driver: RemoteDriver;
  /** Created when the first game view arrives (the queue needs a view to show). */
  anim: AnimQueue | null;
  refs: number;
}

/**
 * Online pacing follows the server's Normal-speed budget, so Relaxed plays at Normal here
 * (a slower client would fall behind the turn timer). Fast and Reduced are unchanged.
 */
const speed = () => {
  const m = useSettings.getState().motion;
  return m === 'relaxed' ? 'normal' : m;
};

let current: RemoteSession | null = null;

function acquire(code: string): RemoteSession {
  if (current?.code === code) return current;
  if (current) destroy(current);
  const driver = new RemoteDriver({
    code,
    auth: async () => {
      const name = useSettings.getState().nickname;
      const g = await ensureGuest(name);
      return { token: g.token, name: g.nickname };
    },
    onUnauthorized: forgetGuest,
  });
  current = { code, driver, anim: null, refs: 0 };
  return current;
}

function destroy(s: RemoteSession) {
  s.anim?.destroy();
  s.driver.destroy();
  if (current === s) current = null;
}

/** The animation queue, made on first use once the driver has a view. */
export function animOf(s: RemoteSession): AnimQueue {
  s.anim ??= new AnimQueue(s.driver, { speed });
  return s.anim;
}

/** The live session for this room code. Unmounting the room page closes the socket. */
export function useRemoteSession(code: string): RemoteSession {
  const [session] = useState(() => acquire(code));
  useEffect(() => {
    session.refs++;
    return () => {
      session.refs--;
      setTimeout(() => { if (session.refs === 0) destroy(session); }, 0);
    };
  }, [session]);
  return session;
}

/** Leave on purpose: the server frees the seat (lobby) or hands it to a bot (match). */
export function leaveRoom(s: RemoteSession) {
  s.driver.leave();
  destroy(s);
}

export const useRoomSnapshot = (s: RemoteSession) => useSyncExternalStore(s.driver.watch, s.driver.getRoom);
