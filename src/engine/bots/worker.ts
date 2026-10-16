// Bot Web Worker (GDD §4.1, §9.4): Hard's Monte Carlo runs here, off the UI thread.
// Load with: new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }).

import { rngFrom } from '../rng';
import type { PlayerView } from '../types';
import { decide, type BotLevel, type Intent } from './index';

export interface BotRequest { id: number; view: PlayerView; level: BotLevel; seed: string; budgetMs?: number }
export interface BotResponse { id: number; intent: Intent | null; error?: string }

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<BotRequest>) => void) | null;
  postMessage: (m: BotResponse) => void;
};

scope.onmessage = ({ data }) => {
  try {
    const intent = decide(data.view, data.level, { rng: rngFrom(data.seed), budgetMs: data.budgetMs });
    scope.postMessage({ id: data.id, intent });
  } catch (e) {
    scope.postMessage({ id: data.id, intent: null, error: String(e) });
  }
};
