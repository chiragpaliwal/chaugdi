// The solo session lives outside React so StrictMode remounts and route changes
// (Settings and back) keep one driver. Released sessions are destroyed a tick later
// unless something acquired them again.

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BotLevel } from '../../engine/bots';
import { AnimQueue } from '../anim/queue';
import { TARGET_SCORE, useSettings } from '../stores/settings';
import { LocalDriver, type LocalDriverOptions } from './local';
import { loadSolo, saveLastResult, saveSolo } from './save';

export interface SoloSession { driver: LocalDriver; anim: AnimQueue; refs: number }

const speed = () => useSettings.getState().motion;

/** One live session of a kind (the solo match, the tutorial hand). */
class Slot {
  current: SoloSession | null = null;

  /** Idempotent, so StrictMode's double state initialiser is harmless. */
  acquire(create: () => LocalDriverOptions): SoloSession {
    if (!this.current) {
      const driver = new LocalDriver({ speed, ...create() });
      this.current = { driver, anim: new AnimQueue(driver, { speed }), refs: 0 };
    }
    return this.current;
  }

  destroy(s: SoloSession) {
    s.anim.destroy();
    s.driver.destroy();
    if (this.current === s) this.current = null;
  }

  release(s: SoloSession) {
    s.refs--;
    setTimeout(() => { if (s.refs === 0) this.destroy(s); }, 0);
  }
}

const solo = new Slot();
const tutorial = new Slot();

/** Throw away any running or saved match; the next acquire starts a new one. */
export function newSoloMatch() {
  if (solo.current) solo.destroy(solo.current);
  saveSolo(null);
}

function useSlot(slot: Slot, create: () => LocalDriverOptions): SoloSession {
  const [session] = useState(() => slot.acquire(create));
  useEffect(() => {
    session.refs++;
    return () => slot.release(session);
  }, [slot, session]);
  return session;
}

export function useSoloSession(level: BotLevel): SoloSession {
  return useSlot(solo, () => ({ level, targetScore: TARGET_SCORE[useSettings.getState().matchLength], saved: loadSolo(), persist: saveSolo, onFinished: saveLastResult }));
}

/** The practice hand: not saved, and it never touches the solo match. */
export function useTutorialSession(options: () => LocalDriverOptions): SoloSession {
  return useSlot(tutorial, options);
}

export const useAnim = (s: SoloSession) => useSyncExternalStore(s.anim.subscribe, s.anim.getSnapshot);
