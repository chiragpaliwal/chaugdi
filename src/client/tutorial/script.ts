// How to Play (GDD §4.3, HANDOFF §5 04a–f). Six coach marks over a fixed table, then a
// real practice hand on a fixed seed with one-off tips: your 5 cards, bidding and the
// 2/3 rule, picking Hukum, leading, following suit, cutting, the race, early end and scoring.

import type { Intent } from '../../engine/bots';
import { isFirstCut } from '../../engine/tricks';
import { nextSeat, otherTeam, suitOf, teamOf, type PlayerView, type Seat, type Suit, type Trick } from '../../engine/types';
import type { AnimSnapshot } from '../anim/queue';
import { SUIT_NAME } from '../components/cardText';
import type { Players } from '../drivers/types';
import type { PlayView } from '../screens/PlayScreen';
import type { SeatView } from '../view/types';

// ---------------------------------------------------------------- practice hand

/**
 * You get K♥ 8♥ 2♥ A♦ 5♣: Hearts is the clear Hukum. Played sensibly, the contract is
 * made after trick 9, an opponent cuts on trick 5, and you are void on trick 4.
 */
export const TUTORIAL_SEED = 'practice-0';
/** Dev deals, so you bid first and you play 7 if everyone passes (GDD §3.4.2). */
export const TUTORIAL_DEALER: Seat = 3;
export const TUTORIAL_PLAYERS: Players = {
  names: { 0: 'You', 1: 'Ben', 2: 'Asha', 3: 'Dev' },
  isBot: { 0: false, 1: true, 2: true, 3: true },
};

/** Bots pass every call, so the contract and the Hukum call are always yours. */
export const tutorialScript = (view: PlayerView): Intent | null => (view.phase === 'BIDDING' ? { type: 'pass' } : null);

export type TipId = 'five' | 'bid' | 'hukum' | 'lead' | 'race' | 'cut' | 'follow' | 'void' | 'score' | 'done';

export interface Tip {
  id: TipId;
  title: string;
  body: string;
  target?: string;
  /** Primary button; "Finish" ends the tutorial. */
  button: 'Got it' | 'Finish';
}

const YOU: Seat = 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const suitWord = (s: Suit) => SUIT_NAME[s].replace(/s$/, '');

function cutIn(trick: Trick | null, trump: Suit | null) {
  if (!trick || !trump) return null;
  return trick.plays.find((p, i) => isFirstCut(trick.plays.slice(0, i), p.card, trump)) ?? null;
}

/** The first tip not yet seen that fits what is on screen, or null. */
export function nextTip(snap: AnimSnapshot, seen: readonly TipId[], target: number): Tip | null {
  if (snap.busy) return null;
  const v = snap.view;
  const names = snap.players.names;
  const has = (id: TipId) => seen.includes(id);
  const yourTurn = v.turn === YOU;
  const k = v.contract;
  const team = (t: 'A' | 'B') => (t === 'A' ? `${names[0]} and ${names[2]}` : `${names[1]} and ${names[3]}`);

  if (v.phase === 'BIDDING' && yourTurn) {
    if (!has('five')) return {
      id: 'five', target: '.fan', button: 'Got it',
      title: 'Your first 5 cards',
      body: 'Everyone gets 5 cards now and 8 more once Hukum is called. Judge your bid from these 5.',
    };
    if (!has('bid')) {
      const forced = nextSeat(v.dealer) === YOU;
      return {
        id: 'bid', target: '.sheet', button: 'Got it',
        title: 'Bid or pass',
        body: `A bid is how many of the 13 tricks (Sar) you and ${names[2]} will win. Make it: +bid. Miss it: −2 × bid. So bid only when you are more than 2/3 sure.${forced ? ' If everyone passes, you must play 7.' : ''}`,
      };
    }
  }

  if (v.phase === 'TRUMP_SELECTION' && yourTurn && !has('hukum')) return {
    id: 'hukum', target: '.suit-tiles', button: 'Got it',
    title: 'Call Hukum',
    body: 'You hold the contract, so you pick trump. Choose the suit you have most of. Any Hukum card beats every card of the other three suits.',
  };

  if (v.phase === 'TRICK_LOOP' && k && v.trump) {
    const plays = v.current?.plays ?? [];
    if (yourTurn && !plays.length && !v.tricks.length && !has('lead')) return {
      id: 'lead', target: '.fan', button: 'Got it',
      title: 'You lead',
      body: 'The contract holder leads the first trick with any card. After that, whoever wins a trick leads the next one.',
    };
    if (v.tricks.length && !has('race')) {
      const toMake = Math.max(0, k.bid - v.tricksWon[k.team]);
      const toBreak = Math.max(0, 14 - k.bid - v.tricksWon[otherTeam(k.team)]);
      return {
        id: 'race', target: '.pill', button: 'Got it',
        title: 'Race to the contract',
        body: `${team(k.team)} need ${toMake} more Sar to make ${k.bid}. ${team(otherTeam(k.team))} need ${toBreak} to break it. The dots show who won each trick.`,
      };
    }
    if (!has('cut')) {
      const now = cutIn(v.current, v.trump);
      const last = plays.length ? null : cutIn(v.lastTrick, v.trump);
      const cut = now ?? last;
      if (cut) {
        const trick = (now ? v.current : v.lastTrick)!;
        const led = suitOf(trick.plays[0]!.card);
        return {
          id: 'cut', target: now ? '.trick-card.is-cut' : undefined, button: 'Got it',
          title: `${names[cut.seat]} cut`,
          body: `${names[cut.seat]} had no ${SUIT_NAME[led]} and played a Hukum card. A cut wins the trick unless someone cuts higher.`,
        };
      }
    }
    if (yourTurn && plays.length) {
      const led = suitOf(plays[0]!.card);
      const follow = v.hand.filter((c) => suitOf(c) === led).length;
      if (follow && follow < v.hand.length && !has('follow')) return {
        id: 'follow', target: '.fan', button: 'Got it',
        title: 'Follow suit',
        body: `${names[plays[0]!.seat]} led a ${suitWord(led)}, so only your ${SUIT_NAME[led]} light up. You must follow suit while you can.`,
      };
      if (!follow && !has('void')) return {
        id: 'void', target: '.fan', button: 'Got it',
        title: `No ${SUIT_NAME[led]}? Any card goes`,
        body: led === v.trump
          ? `Hukum was led and you have none, so throw away your least useful card.`
          : `A ${SUIT_NAME[v.trump]} card cuts and wins the trick unless someone cuts higher. Anything else is thrown away.`,
      };
    }
  }

  const result = v.history[v.history.length - 1];
  if ((v.phase === 'ROUND_EVAL' || v.phase === 'MATCH_END') && result) {
    if (!has('score')) {
      const made = result.outcome !== 'FAILED';
      const early = result.tricksPlayed < 13;
      const bidder = result.contract.team === teamOf(YOU) ? 'your team' : team(result.contract.team);
      const why = early
        ? `The round stopped after trick ${result.tricksPlayed}: the result was certain, so the last ${plural(13 - result.tricksPlayed, 'trick')} were not played and every hand is shown. `
        : '';
      return {
        id: 'score', target: v.phase === 'ROUND_EVAL' ? '.rs-card' : undefined, button: 'Got it',
        title: result.outcome === 'KOT' ? 'Kot!' : made ? 'Contract made' : 'Contract broken',
        body: result.outcome === 'KOT'
          ? 'Winning all 13 tricks is Kot: it wins the whole match at once.'
          : `${why}A made bid of ${result.contract.bid} is +${result.contract.bid} for ${bidder}; a missed one is −${2 * result.contract.bid}.`,
      };
    }
    if (!has('done')) return {
      id: 'done', button: 'Finish',
      title: 'That’s Chaugadi',
      body: `A match is round after round like this one. The ledger keeps one running score, and the first team to +${target} wins.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------- intro (04a–f)

export interface IntroStep { target: string; circle?: boolean; title: string; body: string }

export const introSteps = (target: number): IntroStep[] => [
  { target: '.seat[data-seat="2"] .av', circle: true, title: 'Asha is your partner', body: 'Partners sit opposite. Ben and Dev are the other team. Your ring colour shows your team.' },
  { target: '.contract-chip', title: 'Asha bid 7', body: 'Your team must win 7 of the 13 tricks, called Sar. Make it for +7. Miss it and you lose 14.' },
  { target: '.contract-chip .hukum-chip', title: 'Spades are Hukum', body: 'Hukum is trump. Any spade beats every card of the other three suits.' },
  { target: '.fan', title: 'Follow suit', body: 'Ben led a heart, so only your hearts light up. Tap the K♥ to see what it does, then tap again to play.' },
  { target: '.trick-card.is-cut', title: 'Dev cut', body: 'Dev had no hearts and played a spade. A cut wins the trick unless someone cuts higher.' },
  { target: '.pill', title: 'Race to the contract', body: `6 more and Asha’s bid is made. If Ben and Dev win 7 first, it breaks. First team to +${target} wins the match.` },
];

/** The step that lets taps through to your hand. */
export const INTRO_HAND_STEP = 3;

const seat = (s: Partial<SeatView> & Pick<SeatView, 'seat' | 'name' | 'team'>): SeatView => ({
  isMe: false, isBot: false, connected: true, handCount: null, isDealer: false, bidderBid: null, turnProgress: null, ...s,
});

/** Trick 3 of Asha's 7 in spades: Ben led 9♥, Asha J♥, Dev cut with 3♠ (HowToPlay board). */
export const INTRO_VIEW: PlayView = {
  hud: { ledger: { team: 'A', value: 0, names: '', label: 'Practice hand' }, contract: { kind: 'contract', bid: 7, hukum: 'S', sar: 1 } },
  seats: [
    seat({ seat: 0, name: 'You', team: 'A', isMe: true, turnProgress: 80, handCount: 6 }),
    seat({ seat: 1, name: 'Ben', team: 'B', handCount: 5, badge: { kind: 'sar', value: 1 } }),
    seat({ seat: 2, name: 'Asha', team: 'A', handCount: 5, bidderBid: 7, badge: { kind: 'sar', value: 1 } }),
    seat({ seat: 3, name: 'Dev', team: 'B', handCount: 5, isDealer: true }),
  ],
  trick: { hukum: 'S', yourSlot: true, plays: { 1: { card: '9H', led: true }, 2: { card: 'JH' }, 3: { card: '3S', cut: true, winning: true } } },
  plays: [{ seat: 1, card: '9H' }, { seat: 2, card: 'JH' }, { seat: 3, card: '3S' }],
  race: {
    toMake: 6, toBreak: 6, bidderTeam: 'A', line: '11 left · Asha bid 7',
    history: ['B', 'A', 'now', ...Array<null>(10).fill(null)],
    aria: 'You and Asha need 6 more to make 7. Ben and Dev need 6 to break.',
  },
  hand: ['AS', 'TS', 'KH', '8H', 'QD', '4C'],
  hukum: 'S',
  yourTurn: true,
  layout: 'turn',
};
