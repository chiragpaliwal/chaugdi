// toTableView: PlayerView + the event being animated → one presentational screen view.
// Seats and teams become view-relative here: you are seat 0 (bottom) and team A.

import { sortHand } from '../../engine/cards';
import { dealOrder } from '../../engine/reducer';
import { nextDealer } from '../../engine/scoring';
import { trickWinner } from '../../engine/tricks';
import {
  nextSeat, otherTeam, partnerOf, standing, suitOf, teamOf,
  type CardId, type Play, type PlayerView, type Seat, type Suit, type Team, type Trick,
} from '../../engine/types';
import { DEAL5_MS, DEAL8_PASS_MS, MOTION } from '../../shared/constants';
import type { Playing } from '../anim/queue';
import { cardShort } from '../components/cardText';
import type { Players } from '../drivers/types';
import type { AuctionView } from '../screens/AuctionScreen';
import type { DealFiveView, HukumRevealView } from '../screens/DealScreens';
import type { HudView } from '../screens/GameFrame';
import type { HukumPickView } from '../screens/HukumScreen';
import type { MatchResultView } from '../screens/MatchResultScreen';
import type { PlayView } from '../screens/PlayScreen';
import type { RoundSummaryView } from '../screens/RoundSummaryScreen';
import { tableGeometry, TRICK_H, TRICK_W, type Point, type ViewSeat } from '../table/geometry';
import type { FlyingBack } from '../components/TableCentre';
import type { RaceView, SeatView, TrickPlayView, TrickView } from './types';

export type TableScreen =
  | { kind: 'deal5'; v: DealFiveView }
  | { kind: 'auction'; v: AuctionView }
  | { kind: 'hukum'; v: HukumPickView }
  | { kind: 'reveal'; v: HukumRevealView }
  | { kind: 'play'; v: PlayView }
  | { kind: 'summary'; v: RoundSummaryView }
  | { kind: 'result'; v: MatchResultView };

export interface AdaptInput {
  view: PlayerView;
  prev: PlayerView | null;
  players: Players;
  playing: Playing | null;
  /** True while the animation queue holds anything: input stays closed. */
  busy: boolean;
  width: number;
  /** Show the last completed trick in the cross (the Last trick button). */
  peek?: boolean;
}

const lerp = (a: Point, b: Point, f: number): Point => ({ x: Math.round(a.x + (b.x - a.x) * f), y: Math.round(a.y + (b.y - a.y) * f) });
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Ms into the event at Normal speed: the layout maths use the base timings. */
const baseMs = (p: Playing) => p.progress * baseDuration(p);
const baseDuration = (p: Playing) => {
  switch (p.event.t) {
    case 'dealt': return p.event.batch === 5 ? DEAL5_MS : DEAL8_PASS_MS;
    case 'trickWon': return MOTION.trickHold + MOTION.trickSweep;
    default: return p.durationMs || 1;
  }
};

class Ctx {
  readonly v: PlayerView;
  readonly players: Players;
  readonly you: Seat;
  constructor(i: AdaptInput) { this.v = i.view; this.players = i.players; this.you = i.view.you; }
  vs = (s: Seat) => ((s - this.you + 4) % 4) as ViewSeat;
  vt = (t: Team): Team => (t === teamOf(this.you) ? 'A' : 'B');
  name = (s: Seat) => this.players.names[s];
  poss = (s: Seat) => (s === this.you ? 'Your' : `${this.name(s)}’s`);
  get teamNames(): Record<Team, string> {
    const y = this.you;
    return { A: `${this.name(y)} & ${this.name(partnerOf(y))}`, B: `${this.name(nextSeat(y))} & ${this.name(partnerOf(nextSeat(y)))}` };
  }
  /** Signed ledger, positive = your team ahead. */
  rel = (ledger: number) => standing(ledger, teamOf(this.you));
  seats(extra: (s: Seat) => Partial<SeatView> = () => ({})): SeatView[] {
    const { v } = this;
    return ([0, 1, 2, 3] as Seat[]).map((s) => ({
      seat: this.vs(s), name: this.name(s), team: this.vt(teamOf(s)), isMe: s === this.you,
      isBot: this.players.isBot[s], connected: true,
      handCount: v.handCounts[s], isDealer: v.dealer === s,
      bidderBid: v.contract?.seat === s ? v.contract.bid : null, turnProgress: null,
      ...extra(s),
    }));
  }
  hud(contract: HudView['contract']): HudView {
    const r = this.rel(this.v.ledger);
    const team: Team | null = r > 0 ? 'A' : r < 0 ? 'B' : null;
    return { ledger: { team, value: Math.abs(r), names: team ? this.teamNames[team] : '' }, contract };
  }
  phaseHud(phase: React.ReactNode, label: string) {
    return this.hud({ kind: 'phase', round: this.v.roundNo, phase, label });
  }
}

export function toTableView(i: AdaptInput): TableScreen {
  const c = new Ctx(i);
  const { view, playing } = i;
  const t = playing?.event.t;
  if (t === 'roundStarted' || (playing?.event.t === 'dealt' && playing.event.batch === 5)) return { kind: 'deal5', v: dealFive(c, i) };
  if (t === 'trumpChosen' || (playing?.event.t === 'dealt' && playing.event.batch === 4)) return { kind: 'reveal', v: reveal(c, i) };
  if (t === 'bid' || t === 'pass' || t === 'auctionWon') return { kind: 'auction', v: auction(c, i) };
  if (t === 'cardPlayed' || t === 'cut' || t === 'trickWon' || t === 'roundDecided') return { kind: 'play', v: play(c, i) };
  switch (view.phase) {
    case 'BIDDING': return { kind: 'auction', v: auction(c, i) };
    case 'TRUMP_SELECTION': return { kind: 'hukum', v: hukum(c, i) };
    case 'TRICK_LOOP': return { kind: 'play', v: play(c, i) };
    case 'ROUND_EVAL': return { kind: 'summary', v: summary(c) };
    default: return { kind: 'result', v: result(c) };
  }
}

// ---------------------------------------------------------------- deal 5 (05)

function dealFive(c: Ctx, i: AdaptInput): DealFiveView {
  const { view } = i;
  const g = tableGeometry(i.width - 24, 470);
  const order = dealOrder(view.dealer);
  const ms = i.playing?.event.t === 'dealt' ? baseMs(i.playing) : 0;
  const counts: Record<ViewSeat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const flying: FlyingBack[] = [];
  let started = 0;
  for (let k = 0; k < 20; k++) {
    const t0 = k * MOTION.deal5Stagger;
    if (ms < t0) break;
    started++;
    const to = c.vs(order[k % 4]!);
    const f = (ms - t0) / MOTION.deal5Flight;
    if (f >= 1) counts[to]++;
    else flying.push({ ...lerp(g.slot[c.vs(view.dealer)], dealTarget(g, to), f), rotate: Math.round(8 - 14 * f) });
  }
  const landed = counts[0] + counts[1] + counts[2] + counts[3];
  const first = order[0]!;
  return {
    hud: c.phaseHud('Deal 5', 'deal 5'),
    seats: c.seats((s) => ({ handCount: counts[c.vs(s)] })),
    dealer: c.vs(view.dealer),
    counts,
    deckLeft: 52 - started,
    flying,
    pill: {
      title: 'Dealing 5',
      line: `${view.dealer === c.you ? 'You deal' : `${c.name(view.dealer)} deals`} · one at a time, ${first === c.you ? 'you' : c.name(first)} first`,
      steps: 5, done: Math.floor(landed / 4), nowFraction: (landed % 4) / 4, label: `Pass ${Math.min(5, Math.floor(landed / 4) + 1)} of 5`,
    },
    dock: `Dealing · bidding opens with ${first === c.you ? 'you' : c.name(first)}`,
  };
}

/** Where a dealt card lands: your seat's avatar, or the pile by each other seat's slot. */
function dealTarget(g: ReturnType<typeof tableGeometry>, to: ViewSeat): Point {
  if (to === 0) return { x: g.avatar[0].x - TRICK_W / 2, y: g.avatar[0].y - TRICK_H };
  return g.slot[to];
}

// ---------------------------------------------------------------- auction (06, 07)

function auction(c: Ctx, i: AdaptInput): AuctionView {
  const { view } = i;
  const a = view.auction;
  const won = i.playing?.event.t === 'auctionWon' ? i.playing.event : null;
  const bidding = view.phase === 'BIDDING' && !won;
  const turn = bidding ? view.turn : null;
  const last = new Map<Seat, (typeof a.log)[number]>();
  for (const e of a.log) last.set(e.seat, e);
  const next = turn !== null ? nextSeat(turn) : null;
  const seats = c.seats((s) => {
    const e = last.get(s);
    const out: Partial<SeatView> = { bidderBid: null };
    if (e?.kind === 'bid') out.badge = { kind: 'call', value: e.value };
    if (a.high?.seat === s) out.tag = { text: won ? 'won' : 'high', tone: 'ok' };
    else if (e?.kind === 'pass') out.tag = { text: 'pass', tone: 'mute' };
    if (s === turn && s !== c.you) { out.badge = { kind: 'wait' }; out.tag = { text: 'calling', tone: 'hot' }; out.turnProgress = 100; }
    if (s === c.you && next === c.you && turn !== c.you) out.tag = { text: 'next', tone: 'hot' };
    return out;
  });
  const high = a.high ? { bid: a.high.value, name: c.name(a.high.seat), team: c.vt(teamOf(a.high.seat)) } : null;
  const dock = won
    ? `${c.name(won.seat)} ${won.seat === c.you ? 'win' : 'wins'} the auction at ${won.value}${won.forced ? ' · compulsory 7' : ''}`
    : turn === null ? 'Auction closed'
      : turn === c.you ? 'Your call'
        : `${c.name(turn)} is calling${next === c.you ? ' · you’re next' : ''}`;
  return {
    hud: c.phaseHud('Auction', 'auction'),
    seats,
    high,
    passes: won ? 3 : a.consecutivePasses,
    openerName: c.name(nextSeat(view.dealer)),
    hand: view.phase === 'BIDDING' || view.phase === 'TRUMP_SELECTION' ? view.hand : (i.prev?.hand ?? view.hand),
    yourTurn: !i.busy && bidding && view.turn === c.you,
    dock,
    turnLeft: 100,
  };
}

// ---------------------------------------------------------------- Hukum (08)

function hukum(c: Ctx, i: AdaptInput): HukumPickView {
  const { view } = i;
  const k = view.contract!;
  const caller = c.name(k.seat);
  return {
    hud: c.phaseHud(<>{caller} bid <b>{k.bid}</b></>, `${caller} bid ${k.bid}`),
    seats: c.seats((s) => (s === k.seat
      ? { tag: { text: 'choosing', tone: 'hot' }, turnProgress: 100 }
      : { tag: { text: 'waiting', tone: 'mute' } })),
    bid: k.bid,
    hand: view.hand,
    yourCall: !i.busy && view.turn === c.you,
    callerName: caller,
  };
}

// ---------------------------------------------------------------- Hukum reveal + deal 8 (09)

function reveal(c: Ctx, i: AdaptInput): HukumRevealView {
  const { view, playing } = i;
  const k = view.contract!;
  const trump = view.trump!;
  const order = dealOrder(view.dealer);
  const g = tableGeometry(i.width - 24, 470);
  const pass = playing?.event.t === 'dealt' ? playing.ordinal : 0;
  const ms = playing?.event.t === 'dealt' ? baseMs(playing) : 0;
  const dealing = playing?.event.t === 'dealt';
  const extra: Record<Seat, number> = { 0: 4 * pass, 1: 4 * pass, 2: 4 * pass, 3: 4 * pass };
  let packet: HukumRevealView['packet'];
  let landed = 0;
  if (dealing) {
    order.forEach((s, j) => {
      const t0 = j * MOTION.deal8Stagger;
      if (ms < t0) return;
      const f = (ms - t0) / MOTION.deal8Flight;
      if (f >= 1) { extra[s] += 4; landed++; return; }
      packet = { ...lerp(g.slot[c.vs(view.dealer)], dealTarget(g, c.vs(s)), f), rotate: Math.round(-10 * f), label: `Packet of 4 on its way to ${s === c.you ? 'you' : c.name(s)}` };
    });
  }
  // Your first five stay face up; the dealt packets land face down until the deal ends.
  const first5 = i.prev && i.prev.hand.length === 5 ? i.prev.hand : view.hand.slice(0, 5);
  const faceDown = extra[c.you];
  const leader = k.seat === c.you ? 'you lead' : `${c.name(k.seat)} leads`;
  return {
    hud: c.hud({ kind: 'contract', bid: k.bid, hukum: trump, sar: 0, docking: true }),
    seats: c.seats((s) => ({ handCount: 5 + extra[s] })),
    hukum: trump,
    caller: { name: c.name(k.seat), team: c.vt(k.team) },
    packet,
    pill: {
      title: 'Dealing 8 · in packets of 4',
      line: `${view.dealer === c.you ? 'You deal' : `${c.name(view.dealer)} deals`} · ${leader} trick 1`,
      steps: 2, done: pass, nowFraction: landed / 4, label: `Pass ${pass + 1} of 2`,
    },
    hand: sortHand(first5, trump),
    faceDown,
    handNote: faceDown === 0 ? '5 cards · 8 more on the way' : faceDown === 4 ? '5 + first packet of 4' : '5 + 8 · all 13',
    dock: `Dealing · ${leader} trick 1`,
  };
}

// ---------------------------------------------------------------- trick play (10–12)

function play(c: Ctx, i: AdaptInput): PlayView {
  const { view, playing } = i;
  const k = view.contract!;
  const trump = view.trump!;
  const g = tableGeometry(i.width - 24, i.width < 375 ? 430 : 470);
  const ev = playing?.event;
  // A completed trick stays in the cross while its last card, the sweep and the decision play.
  const completed = ev && ['cardPlayed', 'cut', 'trickWon', 'roundDecided'].includes(ev.t) && !view.current?.plays.length;
  const peek = i.peek && !completed && view.lastTrick;
  const trick: Trick | null = completed || peek ? view.lastTrick : view.current;
  const plays = trick?.plays ?? [];
  const winner = trickWinner(plays, trump);
  const led = plays[0] ? suitOf(plays[0].card) : null;

  const sweepMs = ev?.t === 'trickWon' ? baseMs(playing!) - MOTION.trickHold : -1;
  const sweeping = sweepMs >= 0 && winner;
  const live = !completed && !peek && view.phase === 'TRICK_LOOP';
  const turn = live ? view.turn : null;

  const trickPlays: Partial<Record<ViewSeat, TrickPlayView>> = {};
  const progress: Partial<Record<ViewSeat, number>> = {};
  plays.forEach((p, j) => {
    trickPlays[c.vs(p.seat)] = {
      card: p.card, led: j === 0,
      cut: suitOf(p.card) === trump && led !== trump,
      winning: winner?.seat === p.seat,
    };
    if (sweeping) progress[c.vs(p.seat)] = clamp01((sweepMs - j * 30) / 300);
  });
  const target = winner ? { x: g.avatar[c.vs(winner.seat)].x - TRICK_W / 2, y: g.avatar[c.vs(winner.seat)].y - TRICK_H / 2 } : g.C;
  const trickView: TrickView = {
    plays: trickPlays,
    hukum: trump,
    yourSlot: turn === c.you,
    thinkingSeat: turn !== null && turn !== c.you ? c.vs(turn) : undefined,
    sweep: sweeping ? { target, progress } : undefined,
  };

  const won: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const tr of view.tricks) if (tr.winner !== undefined) won[tr.winner]++;
  const seats = c.seats((s) => ({
    badge: won[s] ? { kind: 'sar', value: won[s] } : undefined,
    turnProgress: s === turn && !i.busy ? 100 : null,
    wonTrick: !!sweeping && winner?.seat === s,
  }));

  const bt = c.vt(k.team);
  const sar = view.tricksWon[k.team];
  const def = view.tricksWon[otherTeam(k.team)];
  const done = view.tricks.length;
  const toMake = Math.max(0, k.bid - sar);
  const toBreak = Math.max(0, 14 - k.bid - def);
  const left = 13 - done;
  const names = c.teamNames;
  const race: RaceView = {
    toMake, toBreak, bidderTeam: bt,
    line: done === 0 ? `13 left · ${c.name(k.seat)} bid ${k.bid}` : view.phase === 'TRICK_LOOP' ? `${left} left · trick ${done + 1} of 13` : `Decided after trick ${done}`,
    history: Array.from({ length: 13 }, (_, j) => {
      const w = view.tricks[j]?.winner;
      if (w !== undefined) return c.vt(teamOf(w));
      return j === done && view.phase === 'TRICK_LOOP' ? 'now' : null;
    }),
    aria: `${names[bt].replace('&', 'and')} need ${toMake} to make. ${names[otherTeam(bt)].replace('&', 'and')} need ${toBreak} to break. ${left} tricks left.`,
  };

  const relPlays: Play[] = (view.current?.plays ?? []).map((p) => ({ seat: c.vs(p.seat), card: p.card }));
  const yourMove = view.phase === 'TRICK_LOOP' && view.turn === c.you;
  return {
    hud: c.hud({ kind: 'contract', bid: k.bid, hukum: trump, sar, tickup: ev?.t === 'trickWon' && winner !== null && teamOf(winner.seat) === k.team }),
    seats,
    trick: trickView,
    plays: relPlays,
    race,
    lastTrick: view.tricks.length > 0 && view.phase === 'TRICK_LOOP',
    peeking: !!peek,
    hand: view.hand,
    hukum: trump,
    yourTurn: !i.busy && yourMove,
    layout: yourMove && !completed ? 'turn' : 'idle',
    stake: stake(c, view, ev, trick, winner, peek ? 'peek' : null),
    dock: turn !== null && turn !== c.you ? `${c.name(turn)} is choosing`
      : ev?.t === 'roundDecided' ? 'Round over' : winner && completed ? `${winner.seat === c.you ? 'You lead' : `${c.name(winner.seat)} leads`} next` : 'Waiting',
  };
}

function stake(c: Ctx, view: PlayerView, ev: Playing['event'] | undefined, trick: Trick | null, winner: Play | null, mode: 'peek' | null): PlayView['stake'] {
  const k = view.contract!;
  const trump = view.trump!;
  if (ev?.t === 'roundDecided') {
    const names = c.teamNames;
    if (ev.outcome === 'KOT') return { text: `${names[c.vt(k.team)]} take all 13 Sar. Kot!` };
    return ev.outcome === 'MADE'
      ? { text: `${names[c.vt(k.team)]} reach ${k.bid} Sar. Contract made.` }
      : { text: `${names[c.vt(otherTeam(k.team))]} reach ${14 - k.bid} Sar. Contract broken.` };
  }
  if (!trick || !trick.plays.length || !winner) {
    const leader = trick?.leader ?? view.turn;
    return leader === null || leader === undefined ? undefined : { text: `${leader === c.you ? 'You lead' : `${c.name(leader)} leads`} trick ${view.tricks.length + 1}.` };
  }
  const led = suitOf(trick.plays[0]!.card);
  const cut = suitOf(winner.card) === trump && led !== trump;
  const what = `${c.poss(winner.seat)} ${cardShort(winner.card)}${cut ? ' cut' : ''}`;
  const suit: Suit | undefined = cut ? trump : undefined;
  if (mode === 'peek') return { suit, text: `Last trick: ${what} took it.` };
  if (ev?.t === 'trickWon' || trick.plays.length === 4) return { suit, text: `${what} takes trick ${ev?.t === 'trickWon' ? ev.trickNo : view.tricks.length}.` };
  // Mid-trick the cards on the table already say who is winning.
  return undefined;
}

// ---------------------------------------------------------------- round summary (14)

function summary(c: Ctx): RoundSummaryView {
  const { v } = c;
  const r = v.history[v.history.length - 1]!;
  const k = r.contract;
  const before = v.history.length > 1 ? v.history[v.history.length - 2]!.ledgerAfter : 0;
  const names = c.teamNames;
  const early = r.tricksPlayed < 13;
  const sarWon = r.tricksWon[k.team];
  const made = r.outcome !== 'FAILED';
  const decider = made ? k.team : otherTeam(k.team);
  const reached = r.tricksWon[decider];
  const unplayed = 13 - r.tricksPlayed;
  const story = `${names[c.vt(decider)]} reached ${reached} Sar on trick ${r.tricksPlayed}, so ${made ? `the ${k.bid} was made` : `${k.bid} was out of reach`}.`
    + (early ? ` The last ${unplayed === 1 ? 'trick was' : `${unplayed} tricks were`} not played.` : '');
  const to = nextDealer(r.ledgerAfter, r.dealer);
  const stays = to === r.dealer;
  const dealerTeam = names[c.vt(teamOf(r.dealer))];
  const order: Seat[] = [c.you, nextSeat(c.you), partnerOf(c.you), partnerOf(nextSeat(c.you))];
  return {
    roundNo: r.roundNo,
    tricksPlayed: r.tricksPlayed,
    bidder: { name: c.name(k.seat), team: c.vt(k.team), bid: k.bid, hukum: r.trump },
    teamNames: names,
    you: 'A',
    outcome: r.outcome === 'FAILED' ? 'FAILED' : 'MADE',
    sarWon,
    story,
    ledgerBefore: c.rel(before),
    ledgerAfter: c.rel(r.ledgerAfter),
    target: v.config.targetScore,
    revealed: early && v.revealedHands
      ? order.map((s) => ({ name: c.name(s), team: c.vt(teamOf(s)), cards: sortHand(v.revealedHands![s], r.trump) as CardId[] }))
      : undefined,
    next: {
      roundNo: r.roundNo + 1,
      dealerName: c.name(to),
      stays,
      note: stays
        ? `The dealer chip stays with ${to === c.you ? 'you' : c.name(to)} until ${dealerTeam} go above zero.`
        : `${dealerTeam} are ahead, so the deal moves to ${to === c.you ? 'you' : c.name(to)}.`,
    },
    ready: order.map((s) => ({ initial: c.name(s).charAt(0), isMe: s === c.you, ready: s !== c.you })),
    countdown: MOTION.summarySeconds,
  };
}

// ---------------------------------------------------------------- match result (15)

function result(c: Ctx): MatchResultView {
  const { v } = c;
  const names = c.teamNames;
  const winner = c.vt(v.winner ?? 'A');
  const last = v.history[v.history.length - 1];
  const SUIT_WORD: Record<Suit, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  let story = '';
  if (last) {
    const who = c.name(last.contract.seat);
    const final = Math.abs(c.rel(last.ledgerAfter));
    story = v.winReason === 'KOT'
      ? `${who} bid 13 with ${SUIT_WORD[last.trump]} as Hukum and took all 13 Sar. A Kot ends the match on the spot.`
      : last.outcome === 'MADE'
        ? `${who} made ${last.contract.bid} with ${SUIT_WORD[last.trump]} as Hukum to reach +${final}.`
        : `${who} missed ${last.contract.bid} with ${SUIT_WORD[last.trump]} as Hukum, which put ${names[winner]} on +${final}.`;
  }
  return {
    winner,
    teamNames: names,
    reason: v.winReason ?? 'TARGET',
    story,
    target: v.config.targetScore,
    history: v.history.map((r) => ({
      who: c.name(r.contract.seat), team: c.vt(r.contract.team), bid: r.contract.bid, hukum: r.trump,
      outcome: r.outcome, ledgerAfter: c.rel(r.ledgerAfter),
    })),
  };
}
