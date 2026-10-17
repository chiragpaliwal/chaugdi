// Runs bot decisions in the Web Worker (GDD §4.1). Falls back to the main thread when
// Workers are missing or the worker fails, so a match never stalls.

import { decide, type BotLevel, type Intent } from '../../engine/bots';
import type { BotRequest, BotResponse } from '../../engine/bots/worker';
import { rngFrom } from '../../engine/rng';
import type { PlayerView } from '../../engine/types';

export interface BotRunner {
  decide(view: PlayerView, level: BotLevel, seed: string): Promise<Intent | null>;
  destroy(): void;
}

const WORKER_TIMEOUT_MS = 4000;

async function inline(view: PlayerView, level: BotLevel, seed: string): Promise<Intent | null> {
  return decide(view, level, { rng: rngFrom(seed) });
}

export function createBotRunner(): BotRunner {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('../../engine/bots/worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  let nextId = 1;
  const pending = new Map<number, (r: BotResponse | null) => void>();
  if (worker) {
    worker.onmessage = (e: MessageEvent<BotResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      for (const done of pending.values()) done(null);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }

  return {
    async decide(view, level, seed) {
      if (!worker) return inline(view, level, seed);
      const id = nextId++;
      const reply = await new Promise<BotResponse | null>((resolve) => {
        pending.set(id, resolve);
        window.setTimeout(() => { if (pending.delete(id)) resolve(null); }, WORKER_TIMEOUT_MS);
        worker!.postMessage({ id, view, level, seed } satisfies BotRequest);
      });
      if (reply && !reply.error) return reply.intent;
      // A slow or failed Hard search: Medium decides instead of stalling the table.
      return inline(view, level === 'hard' ? 'medium' : level, seed);
    },
    destroy() {
      worker?.terminate();
      worker = null;
      for (const done of pending.values()) done(null);
      pending.clear();
    },
  };
}
