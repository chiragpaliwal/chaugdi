import { describe, expect, it } from 'vitest';
import { FAN_STYLES, fanLayout, fanRows, fanStripWidths, handCardWidth, tableGeometry } from './geometry';

describe('tableGeometry (HANDOFF §3)', () => {
  it('matches the reference table4() at 366 × 470', () => {
    const g = tableGeometry(366, 470);
    // cx 183, top 22, bottom 408, cy 215, rx 150, ry 193, C (183, 203)
    expect(g.C).toEqual({ x: 183, y: 203 });
    expect(g.avatar[0]).toEqual({ x: 183, y: 408 });
    expect(g.avatar[1]).toEqual({ x: 33, y: 215 });
    expect(g.avatar[2]).toEqual({ x: 183, y: 22 });
    expect(g.avatar[3]).toEqual({ x: 333, y: 215 });
    expect(g.seatBox[0]).toEqual({ x: 141, y: 387 });
    expect(g.slot[0]).toEqual({ x: 160, y: 229 });
    expect(g.slot[1]).toEqual({ x: 98, y: 171 });
    expect(g.pill).toEqual({ x: 183, y: 334 });
  });
  it('moves the pill to C.y + 120 on shorter tables', () => {
    const g = tableGeometry(366, 440);
    expect(g.pill.y).toBe(g.C.y + 120);
  });
});

describe('fanLayout (HANDOFF §3 HandFan)', () => {
  it('splits rows 13 → 7 + 6 and keeps ≤ 7 in one row', () => {
    expect(fanRows(13)).toEqual([7, 6]);
    expect(fanRows(12)).toEqual([6, 6]);
    expect(fanRows(8)).toEqual([4, 4]);
    expect(fanRows(7)).toEqual([7]);
    expect(fanRows(5)).toEqual([5]);
  });

  it('matches fan2() for 13 cards at 366', () => {
    const f = fanLayout(13, 366, 62);
    // back row: spacing min(49.6, 50.67) = 49.6, start = (366 − (6·49.6 + 62))/2 = 3.2
    expect(f[0]).toMatchObject({ row: 0, x: 3, y: 23, rotate: -3 });
    expect(f[3]).toMatchObject({ row: 0, x: 152, y: 18, rotate: 0 });
    expect(f[6]).toMatchObject({ row: 0, x: 301, y: 23, rotate: 3 });
    // front row of 6: mid 2.5
    expect(f[7]).toMatchObject({ row: 1, y: Math.round(68 + 6.25 * 0.5), rotate: -2.5 });
  });

  it('uses the steeper curve for rows of ≤ 5', () => {
    const f = fanLayout(5, 366, 70);
    expect(f[0]).toMatchObject({ y: Math.round(18 + 4 * 1.2), rotate: -5 });
  });

  for (const n of [5, 8, 12, 13]) {
    for (const W of [360, 390]) {
      it(`keeps every strip ≥ 44 px with ${n} cards at ${W} wide`, () => {
        const avail = W - 24;
        const w = handCardWidth('M', W);
        const strips = fanStripWidths(n, avail, w);
        for (const s of strips) expect(s).toBeGreaterThanOrEqual(44);
        const f = fanLayout(n, avail, w);
        expect(f).toHaveLength(n);
        for (const c of f) {
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.x + w).toBeLessThanOrEqual(avail + 1);
        }
      });
    }
  }

  it('reports 45.7 px strips for 13 cards at 360', () => {
    expect(fanStripWidths(13, 336, 62)[0]).toBeCloseTo(45.67, 1);
  });

  it('falls back from L to M below 390 px', () => {
    expect(handCardWidth('L', 389)).toBe(62);
    expect(handCardWidth('L', 390)).toBe(70);
  });
});

describe('fan shapes from the boards', () => {
  it('deal5 matches html/06 (w 70, 366 wide)', () => {
    const f = fanLayout(5, 366, 70, FAN_STYLES.deal5);
    expect(f.map((c) => [c.x, c.y, c.rotate])).toEqual([[36, 24, -6], [92, 19, -3], [148, 18, 0], [204, 19, 3], [260, 24, 6]]);
  });
  it('idle matches html/11 (7 cards, 366 wide)', () => {
    const f = fanLayout(7, 366, 62, FAN_STYLES.idle);
    expect(f.slice(0, 4).map((c) => [c.x, c.y, c.rotate])).toEqual([[3, 15, -4.2], [53, 11, -2.8], [102, 9, -1.4], [152, 8, 0]]);
  });
});
