// Scripted deals for the test vectors. A "row" is four cards of one suit, one per seat;
// the seat holding the row's top rank wins it. Playing rows in order is always legal,
// because every seat still holds the led suit (the row's own card).

import { apply } from '../reducer';
import { emptyAuction } from '../auction';
import {
  DEFAULT_CONFIG, nextSeat, SEATS, teamOf,
  type CardId, type GameEvent, type MatchState, type RankChar, type Seat, type Suit,
} from '../types';

const GROUPS: RankChar[][] = [['A', 'K', 'Q', 'J'], ['T', '9', '8', '7'], ['6', '5', '4', '3']];
const ROW_SUITS: Suit[] = ['H', 'D', 'C', 'S'];

/** 13 rows. Rows 0–11 are won by `winners[k]` (default seat 0); row 12 is the four 2s, won by whoever holds the trump 2. */
export function rowDeal(winners: Seat[], trump: Suit, lastWinner: Seat = 0) {
  const rows: Record<Seat, CardId>[] = [];
  for (let k = 0; k < 12; k++) {
    const suit = ROW_SUITS[Math.floor(k / 3)]!;
    const ranks = GROUPS[k % 3]!;
    const w = winners[k] ?? 0;
    const others = SEATS.filter((s) => s !== w);
    const row = { [w]: `${ranks[0]}${suit}` } as Record<Seat, CardId>;
    others.forEach((s, i) => { row[s] = `${ranks[i + 1]}${suit}` as CardId; });
    rows.push(row);
  }
  const twos = SEATS.filter((s) => s !== lastWinner);
  const offSuits = ROW_SUITS.filter((s) => s !== trump);
  const last = { [lastWinner]: `2${trump}` } as Record<Seat, CardId>;
  twos.forEach((s, i) => { last[s] = `2${offSuits[i]}` as CardId; });
  rows.push(last);
  const hands = { 0: [], 1: [], 2: [], 3: [] } as Record<Seat, CardId[]>;
  for (const row of rows) for (const s of SEATS) hands[s].push(row[s]);
  return { rows, hands };
}

export interface PlaySetup {
  dealer?: Seat;
  ledger?: number;
  bidder: Seat;
  bid: number;
  trump?: Suit;
  winners: Seat[];
  lastWinner?: Seat;
  roundNo?: number;
  base?: MatchState;
}

/** A match in TRICK_LOOP with a scripted deal, the bidder to lead trick 1. */
export function atPlay(o: PlaySetup) {
  const trump = o.trump ?? 'S';
  const { rows, hands } = rowDeal(o.winners, trump, o.lastWinner);
  const base = o.base;
  const state: MatchState = {
    config: DEFAULT_CONFIG,
    phase: 'TRICK_LOOP',
    seed: base?.seed ?? 'test',
    ledger: o.ledger ?? base?.ledger ?? 0,
    dealer: o.dealer ?? base?.dealer ?? 0,
    history: base?.history ?? [],
    winner: null,
    winReason: null,
    round: {
      roundNo: o.roundNo ?? (base?.round ? base.round.roundNo : 1),
      hands, stock: [], auction: emptyAuction(),
      contract: { seat: o.bidder, team: teamOf(o.bidder), bid: o.bid, forced: false },
      trump, tricks: [], current: { leader: o.bidder, plays: [] }, tricksWon: { A: 0, B: 0 }, turn: o.bidder, result: null,
    },
  };
  return { state, rows };
}

/** Plays row `k` in turn order from whoever leads. */
export function playRow(state: MatchState, rows: Record<Seat, CardId>[], k: number) {
  let s = state;
  const events: GameEvent[] = [];
  let seat = s.round!.turn!;
  for (let i = 0; i < 4; i++) {
    const r = apply(s, { type: 'PLAY_CARD', seat, card: rows[k]![seat] });
    s = r.state;
    events.push(...r.events);
    seat = nextSeat(seat);
  }
  return { state: s, events };
}

/** Plays rows until the round is decided. */
export function playOut(state: MatchState, rows: Record<Seat, CardId>[]) {
  let s = state;
  const events: GameEvent[] = [];
  for (let k = 0; s.phase === 'TRICK_LOOP'; k++) {
    const r = playRow(s, rows, k);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
