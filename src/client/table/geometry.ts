// Layout maths from HANDOFF §3. These mirror the reference helpers table4() and
// fan2() in docs/boards/Main.dc.html; keep them in step with that file.

import type { Seat } from '../../engine/types';

export interface Point { x: number; y: number }

/** Seats are view-relative: 0 you (bottom), 1 left, 2 top (partner), 3 right. */
export type ViewSeat = Seat;

export const SEAT_COLUMN_W = 84;

export interface TableGeometry {
  /** Avatar centres, indexed by view seat. */
  avatar: Record<ViewSeat, Point>;
  /** Top-left of each 84-wide seat column (column top = avatar centre y − 21). */
  seatBox: Record<ViewSeat, Point>;
  /** Trick cross centre. */
  C: Point;
  /** Top-left of each 46 × 64 trick slot. */
  slot: Record<ViewSeat, Point>;
  /** Centre of the RacePill. */
  pill: Point;
  /** A short table only has room for the pill's chips (no line, dots or bars). */
  pillCompact: boolean;
  /** Centre of the auction/Hukum readout on a 300-tall table (cy + 14, BidSheet board). */
  sheetCentre: Point;
}

export const TRICK_W = 46;
export const TRICK_H = 64;
export const TRICK_OFFSET: Record<ViewSeat, Point> = { 0: { x: 0, y: 58 }, 1: { x: -62, y: 0 }, 2: { x: 0, y: -58 }, 3: { x: 62, y: 0 } };
export const TRICK_ROTATION: Record<ViewSeat, number> = { 0: 0, 1: -4, 2: 3, 3: 5 };

const SEATS: ViewSeat[] = [0, 1, 2, 3];
/** Avatar radius with its turn ring. */
const AVATAR_R = 30;
/** A seat column runs from avatar centre − 21 to + 65 (avatar, name, hand count); 4 more for air. */
const SEAT_BELOW = 69;
/** Tightest vertical trick offset before the top and bottom cards crowd the side ones. */
const TRICK_DY_MIN = 36;
/** Shortest table with room for the full RacePill (chips, line and dots) above your seat. */
export const PILL_FULL_H = 412;

export function tableGeometry(W: number, H: number): TableGeometry {
  const cx = W / 2;
  const top = 22;
  const bottom = H - 62;
  const cy = (top + bottom) / 2;
  const rx = W / 2 - 33;
  const ry = (bottom - top) / 2;
  const C = { x: Math.round(cx), y: Math.round(cy - 12) };

  const avatar = {} as Record<ViewSeat, Point>;
  const seatBox = {} as Record<ViewSeat, Point>;
  const slot = {} as Record<ViewSeat, Point>;
  for (const i of SEATS) {
    const a = ((90 + i * 90) * Math.PI) / 180;
    const p = { x: Math.round(cx + rx * Math.cos(a)), y: Math.round(cy + ry * Math.sin(a)) };
    avatar[i] = p;
    seatBox[i] = { x: p.x - SEAT_COLUMN_W / 2, y: p.y - 21 };
  }
  // On a short table the top card would cover the partner's name and hand count: pull the
  // top and bottom cards in towards the side ones, then move the whole cross down.
  const overlap = Math.max(0, avatar[2].y + SEAT_BELOW - (C.y + TRICK_OFFSET[2].y - TRICK_H / 2));
  const dy = Math.max(TRICK_DY_MIN, TRICK_OFFSET[0].y - overlap);
  const X = { x: C.x, y: C.y + overlap - (TRICK_OFFSET[0].y - dy) };
  for (const i of SEATS) {
    const off = TRICK_OFFSET[i].y === 0 ? 0 : Math.sign(TRICK_OFFSET[i].y) * dy;
    slot[i] = { x: X.x + TRICK_OFFSET[i].x - TRICK_W / 2, y: X.y + off - TRICK_H / 2 };
  }
  // Never inside the cross: 131 below C at H 470, 120 when the table is shorter. Below
  // PILL_FULL_H only the chips fit, centred between the cross and your seat's avatar.
  const pillCompact = H < PILL_FULL_H;
  const pillY = H >= 470 ? C.y + 131 : !pillCompact ? Math.max(C.y + 120, slot[0].y + TRICK_H + 26)
    : Math.round((slot[0].y + TRICK_H + avatar[0].y - AVATAR_R) / 2);
  const pill = { x: C.x, y: pillY };
  return { avatar, seatBox, C, slot, pill, pillCompact, sheetCentre: { x: C.x, y: Math.round(cy + 14) } };
}

// ---------------------------------------------------------------- hand fan

export type CardSizeSetting = 'S' | 'M' | 'L';
export const CARD_SIZE_PX: Record<CardSizeSetting, number> = { S: 56, M: 62, L: 70 };

/** Hand card width for a setting. L falls back to M below 390 px wide. */
export function handCardWidth(setting: CardSizeSetting, viewportW: number): number {
  if (setting === 'L' && viewportW < 390) return CARD_SIZE_PX.M;
  return CARD_SIZE_PX[setting];
}

export interface FanSlot {
  index: number; // index into the input order
  row: 0 | 1;
  x: number;
  /** Row top before any lift. */
  y: number;
  rotate: number; // degrees
}

/** Two rows above 7 cards: back row = first ceil(n/2), front row = the rest. */
export function fanRows(n: number): number[] {
  return n > 7 ? [Math.ceil(n / 2), n - Math.ceil(n / 2)] : [n];
}

/**
 * Fan shape. HANDOFF §3 gives the 'play' maths; the boards use two more shapes that
 * the PNGs show: 'deal5' for the first five cards (06, 07, 08) and 'idle' for a hand
 * while someone else plays (11, 12, 13). `top` is the row-0 baseline in the container.
 */
export interface FanStyle {
  top: number;
  rowStep: number;
  curve: (rowSize: number) => number;
  tilt: (rowSize: number) => number;
}

export const FAN_STYLES = {
  play: { top: 18, rowStep: 50, curve: (m: number) => (m > 5 ? 0.5 : 1.2), tilt: (m: number) => (m > 5 ? 1 : 2.5) },
  deal5: { top: 18, rowStep: 50, curve: () => 1.4, tilt: () => 3 },
  idle: { top: 8, rowStep: 50, curve: () => 0.8, tilt: () => 1.4 },
  deal8: { top: 18, rowStep: 50, curve: () => 0.5, tilt: () => 1 },
} satisfies Record<string, FanStyle>;

export type FanStyleName = keyof typeof FAN_STYLES;

export function fanLayout(n: number, availableWidth: number, w: number, style: FanStyle = FAN_STYLES.play): FanSlot[] {
  const out: FanSlot[] = [];
  let index = 0;
  fanRows(n).forEach((m, row) => {
    const sp = m > 1 ? Math.min(w * 0.8, (availableWidth - w) / (m - 1)) : 0;
    const start = (availableWidth - ((m - 1) * sp + w)) / 2;
    const mid = (m - 1) / 2;
    const curve = style.curve(m);
    const tilt = style.tilt(m);
    for (let i = 0; i < m; i++) {
      out.push({
        index: index++,
        row: row as 0 | 1,
        x: Math.round(start + i * sp),
        y: Math.round(style.top + row * style.rowStep + (i - mid) * (i - mid) * curve),
        rotate: Number(((i - mid) * tilt).toFixed(1)),
      });
    }
  });
  return out;
}

export const LIFT_LEGAL = 5;
export const LIFT_SELECTED = 16;

/** Fan container height: 112 for one row, 160 for two. */
export const fanHeight = (n: number) => (n > 7 ? 160 : 112);

/** Width of each card's visible strip in a row (for the ≥ 44 px touch rule). */
export function fanStripWidths(n: number, availableWidth: number, w: number): number[] {
  return fanRows(n).map((m) => (m > 1 ? Math.min(w * 0.8, (availableWidth - w) / (m - 1)) : w));
}

/**
 * Hand card width for a screen. At M the boards use the large 70 px card for the
 * first five cards when nothing else competes for room (06), and 62 otherwise.
 */
export function handWidthFor(setting: CardSizeSetting, viewportW: number, n: number, sheetOpen = false): 56 | 62 | 70 {
  if (setting === 'M' && n <= 5 && !sheetOpen) return 70;
  return handCardWidth(setting, viewportW) as 56 | 62 | 70;
}
