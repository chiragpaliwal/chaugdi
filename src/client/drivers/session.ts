// The solo session lives outside React so StrictMode remounts and route changes
// (Settings and back) keep one driver. Released sessions are destroyed a tick later
// unless something acquired them again.

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BotLevel } from '../../engine/bots';
import { AnimQueue } from '../anim/queue';
import { TARGET_SCORE, useSettings } from '../stores/settings';
import { LocalDriver } from './local';
import { loadSolo, saveLastResult, saveSolo } from './save';

export interface SoloSession { driver: LocalDriver; anim: AnimQueue; refs: number }

let current: SoloSession | null = null;

const speed = () => useSettings.getState().motion;

function create(level: BotLevel, resume: boolean): SoloSession {
  const driver = new LocalDriver({ level, targetScore: TARGET_SCORE[useSettings.getState().matchLength], saved: resume ? loadSolo() : null, speed, persist: saveSolo, onFinished: saveLastResult });
  return { driver, anim: new AnimQueue(driver, { speed }), refs: 0 };
}

function destroy(s: SoloSession) {
  s.anim.destroy();
  s.driver.destroy();
  if (current === s) current = null;
}

/** Throw away any running or saved match; the next acquire starts a new one. */
export function newSoloMatch() {
  if (current) destroy(current);
  saveSolo(null);
}

/** Idempotent, so StrictMode's double state initialiser is harmless. */
function acquire(level: BotLevel): SoloSession {
  current ??= create(level, true);
  return current;
}

function release(s: SoloSession) {
  s.refs--;
  setTimeout(() => { if (s.refs === 0) destroy(s); }, 0);
}

export function useSoloSession(level: BotLevel): SoloSession {
  const [session] = useState(() => acquire(level));
  useEffect(() => {
    session.refs++;
    return () => release(session);
  }, [session]);
  return session;
}

export const useAnim = (s: SoloSession) => useSyncExternalStore(s.anim.subscribe, s.anim.getSnapshot);
