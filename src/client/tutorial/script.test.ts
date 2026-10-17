import { describe, expect, it } from 'vitest';
import { decide } from '../../engine/bots';
import { rngFrom } from '../../engine/rng';
import type { AnimSnapshot } from '../anim/queue';
import type { BotRunner } from '../drivers/bots';
import { LocalDriver } from '../drivers/local';
import type { DriverUpdate } from '../drivers/types';
import { nextTip, TUTORIAL_DEALER, TUTORIAL_PLAYERS, TUTORIAL_SEED, tutorialScript, type TipId } from './script';

const inlineBots: BotRunner = {
  decide: async (view, level, seed) => decide(view, level, { rng: rngFrom(seed) }),
  destroy: () => {},
};

function setup() {
  const due: { fn: () => void }[] = [];
  const driver = new LocalDriver({
    level: 'medium', seed: TUTORIAL_SEED, dealer: TUTORIAL_DEALER, players: TUTORIAL_PLAYERS, script: tutorialScript,
    targetScore: 26, bots: inlineBots, watchVisibility: false,
    timers: { set: (fn) => { const t = { fn }; due.push(t); return t; }, clear: (t) => { const i = due.indexOf(t as never); if (i >= 0) due.splice(i, 1); } },
  });
  let last!: DriverUpdate;
  driver.subscribe((u) => { last = u; });
  const tick = async () => {
    const t = due.shift();
    if (!t) return false;
    t.fn();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    return true;
  };
  const snap = (): AnimSnapshot => ({ view: last.view, prev: null, players: last.players, playing: null, busy: false });
  return { driver, tick, snap, pending: () => due.length };
}

describe('tutorial practice hand', () => {
  it('gives you the contract and shows every tip once, in order', async () => {
    const { driver, tick, snap } = setup();
    const seen: TipId[] = [];
    let guard = 0;
    while (guard++ < 500) {
      const tip = nextTip(snap(), seen, 26);
      if (tip) { seen.push(tip.id); continue; }
      const v = snap().view;
      if (v.phase === 'ROUND_EVAL' || v.phase === 'MATCH_END') break;
      if (v.turn === 0) {
        if (v.phase === 'BIDDING') driver.send({ type: 'bid', value: 7 });
        else if (v.phase === 'TRUMP_SELECTION') driver.send({ type: 'chooseTrump', suit: 'H' });
        else driver.send({ type: 'play', card: v.legal[0]! });
      } else if (!(await tick())) throw new Error('stalled');
    }
    expect(driver.match.round!.contract).toMatchObject({ seat: 0, bid: 7 });
    expect(seen.slice(0, 5)).toEqual(['five', 'bid', 'hukum', 'lead', 'race']);
    expect(seen).toEqual(expect.arrayContaining(['cut', 'void', 'score', 'done']));
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.slice(-2)).toEqual(['score', 'done']);
    driver.destroy();
  });

  it('forces 7 on you when you pass too', async () => {
    const { driver, tick, snap } = setup();
    driver.send({ type: 'pass' });
    while (snap().view.phase === 'BIDDING') await tick();
    expect(driver.match.round!.contract).toMatchObject({ seat: 0, bid: 7, forced: true });
    driver.destroy();
  });

  it('holds the bots while a tip is open', async () => {
    const { driver, tick, snap, pending } = setup();
    driver.send({ type: 'bid', value: 7 });
    expect(pending()).toBe(1);
    driver.hold(true);
    expect(pending()).toBe(0);
    driver.hold(false);
    await tick();
    expect(snap().view.auction.log).toHaveLength(2);
    driver.destroy();
  });

  it('shows nothing while animations play', () => {
    const { snap } = setup();
    expect(nextTip({ ...snap(), busy: true }, [], 26)).toBeNull();
  });
});
