// Seeded views for step 4 screens, one per PNG in docs/screens. Sample data follows the
// design story: Round 4 you win the auction at 9; Round 5 Ben bids 8 with spades and fails.

import { useEffect, useState } from 'react';
import { EXTEND_BY, type PauseVoteView } from '../components/PauseVote';
import { HomeScreen } from '../screens/HomeScreen';
import { Tutorial } from '../app/Tutorial';
import { LobbyScreen, type LobbyView } from '../screens/LobbyScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { defaultSettings, useSettings } from '../stores/settings';
import type { CardId } from '../../engine/types';
import type { HudView } from '../screens/GameFrame';
import { AuctionScreen, type AuctionView } from '../screens/AuctionScreen';
import { DealFiveScreen, HukumRevealScreen, type DealFiveView, type HukumRevealView } from '../screens/DealScreens';
import { HukumScreen, type HukumPickView } from '../screens/HukumScreen';
import { MatchResultScreen, type MatchResultView } from '../screens/MatchResultScreen';
import { PlayScreen, type PlayView } from '../screens/PlayScreen';
import { RoundSummaryScreen, type RoundSummaryView } from '../screens/RoundSummaryScreen';
import type { SeatView } from '../view/types';
import { r4AuctionSeats, r5Hand, r5Trick1, r5Trick1Race, r5Trick1Seats } from './fixtures';

const seat = (s: Partial<SeatView> & Pick<SeatView, 'seat' | 'name' | 'team'>): SeatView => ({
  isMe: false, isBot: false, connected: true, handCount: null, isDealer: false, bidderBid: null, turnProgress: null, ...s,
});
const TEAMS = { A: 'You & Asha', B: 'Ben & Dev' } as const;
const r4Hud = (phase: React.ReactNode, label: string): HudView => ({
  ledger: { team: 'A', value: 17, names: TEAMS.A },
  contract: { kind: 'phase', round: 4, phase, label },
});
const r5Hud = (sar: number, extra: { docking?: boolean; tickup?: boolean } = {}): HudView => ({
  ledger: { team: 'A', value: 26, names: TEAMS.A },
  contract: { kind: 'contract', bid: 8, hukum: 'S', sar, ...extra },
});
const FIRST_FIVE: CardId[] = ['AS', 'QS', 'TS', 'KH', 'AC'];

// ---- 05 dealing 5
export const deal5: DealFiveView = {
  hud: r4Hud('Deal 5', 'deal 5'),
  seats: [
    seat({ seat: 0, name: 'You', team: 'A', isMe: true, handCount: 3 }),
    seat({ seat: 1, name: 'Ben', team: 'B', handCount: 2 }),
    seat({ seat: 2, name: 'Asha', team: 'A', handCount: 2 }),
    seat({ seat: 3, name: 'Dev', team: 'B', isDealer: true, handCount: 2 }),
  ],
  dealer: 3,
  counts: { 0: 3, 1: 2, 2: 2, 3: 2 },
  deckLeft: 43,
  flying: [
    { x: 200, y: 196, rotate: 10, opacity: 0.12 },
    { x: 178, y: 204, rotate: 4, opacity: 0.32 },
    { x: 150, y: 206, rotate: -6, label: 'Card on its way to Ben' },
  ],
  pill: { title: 'Dealing 5', line: 'Dev deals · one at a time, you first', steps: 5, done: 2, nowFraction: 0.55, label: 'Pass 3 of 5' },
  dock: 'Dealing · bidding opens with you',
};

// ---- 06 / 07 / 07b auction
export const auctionWaiting: AuctionView = {
  hud: r4Hud('Auction', 'auction'),
  seats: r4AuctionSeats,
  high: { bid: 8, name: 'Ben', team: 'B' },
  passes: 1,
  openerName: 'Ben',
  hand: FIRST_FIVE,
  yourTurn: false,
  dock: 'Dev is calling · you’re next',
};

export const auctionYourCall: AuctionView = {
  ...auctionWaiting,
  seats: [
    seat({ seat: 0, name: 'You', team: 'A', isMe: true }),
    seat({ seat: 1, name: 'Ben', team: 'B', badge: { kind: 'call', value: 8 }, tag: { text: 'high', tone: 'ok' } }),
    seat({ seat: 2, name: 'Asha', team: 'A', tag: { text: 'pass', tone: 'mute' } }),
    seat({ seat: 3, name: 'Dev', team: 'B', isDealer: true, tag: { text: 'pass', tone: 'mute' } }),
  ],
  passes: 2,
  yourTurn: true,
  turnLeft: 64,
};

// ---- 08 Hukum pick
export const hukumPick: HukumPickView = {
  hud: r4Hud(<>You bid <b>9</b></>, 'you bid 9'),
  seats: [
    seat({ seat: 0, name: 'You', team: 'A', isMe: true, turnProgress: 48, bidderBid: 9, tag: { text: 'choosing', tone: 'hot' } }),
    seat({ seat: 1, name: 'Ben', team: 'B', tag: { text: 'waiting', tone: 'mute' } }),
    seat({ seat: 2, name: 'Asha', team: 'A', tag: { text: 'waiting', tone: 'mute' } }),
    seat({ seat: 3, name: 'Dev', team: 'B', isDealer: true, tag: { text: 'waiting', tone: 'mute' } }),
  ],
  bid: 9,
  hand: FIRST_FIVE,
  yourCall: true,
  callerName: 'You',
};

// ---- 09 Hukum reveal, deal 8
export const hukumReveal: HukumRevealView = {
  hud: r5Hud(0, { docking: true }),
  seats: [
    seat({ seat: 0, name: 'You', team: 'A', isMe: true, handCount: 9 }),
    seat({ seat: 1, name: 'Ben', team: 'B', handCount: 5, bidderBid: 8 }),
    seat({ seat: 2, name: 'Asha', team: 'A', handCount: 5 }),
    seat({ seat: 3, name: 'Dev', team: 'B', isDealer: true, handCount: 5 }),
  ],
  hukum: 'S',
  caller: { name: 'Ben', team: 'B' },
  dockPath: [{ x: 122, y: 92, size: 34, opacity: 0.32 }, { x: 134, y: 34, opacity: 0.55 }],
  packet: { x: 288, y: 298, rotate: -10, label: 'Packet of 4 on its way to Ben' },
  pill: { title: 'Dealing 8 · in packets of 4', line: 'Dev deals · you have 9, Ben is next', steps: 2, done: 0, nowFraction: 0.4, label: 'Pass 1 of 2' },
  hand: ['QS', '6S', 'KH', '9C', '7D'],
  faceDown: 4,
  handNote: '5 + first packet of 4',
  dock: 'Dealing · Ben leads trick 1',
};

// ---- 10 / 10b / 10c your turn, trick 1
export const yourTurn: PlayView = {
  hud: r5Hud(0),
  seats: r5Trick1Seats,
  trick: r5Trick1,
  plays: [{ seat: 1, card: 'KC' }, { seat: 2, card: '2C' }, { seat: 3, card: '4S' }],
  race: r5Trick1Race,
  hand: r5Hand.map((c) => c.card),
  hukum: 'S',
  yourTurn: true,
  layout: 'turn',
  unread: 2,
};

export function afterPlay(v: PlayView, card: CardId): PlayView {
  return {
    ...v,
    seats: v.seats.map((s) => (s.isMe ? { ...s, turnProgress: null, handCount: (s.handCount ?? 1) - 1 } : s)),
    trick: { ...v.trick, yourSlot: false, plays: { ...v.trick.plays, 0: { card } } },
    plays: [...v.plays, { seat: 0, card }],
    hand: v.hand.filter((c) => c !== card),
    yourTurn: false,
    status: { bold: 'Waiting', text: 'Trick 1 resolving' },
    hint: 'Dev’s 4♠ cut takes trick 1. Ben & Dev are on 1 of 8.',
    dock: 'Trick resolving',
  };
}

/** 10 is interactive: playing a card moves to the 10c state. */
export function YourTurnLive({ initialSelected = 'AC', initialIllegal = null, start = yourTurn, width, height }: { initialSelected?: CardId | null; initialIllegal?: CardId | null; start?: PlayView; width?: number; height?: number }) {
  const [v, setV] = useState(start);
  return <PlayScreen v={v} width={width} height={height} initialSelected={initialSelected} initialIllegal={initialIllegal} onPlay={(c) => setV(afterPlay(v, c))} />;
}

// ---- 11 waiting, Dev cut
export const waitingCut: PlayView = {
  hud: r5Hud(3),
  seats: [
    seat({ seat: 0, name: 'You', team: 'A', isMe: true, handCount: 7, badge: { kind: 'sar', value: 1 } }),
    seat({ seat: 1, name: 'Ben', team: 'B', handCount: 8, badge: { kind: 'sar', value: 1 }, bidderBid: 8, turnProgress: 38 }),
    seat({ seat: 2, name: 'Asha', team: 'A', handCount: 7, badge: { kind: 'sar', value: 1 }, hasMessage: true }),
    seat({ seat: 3, name: 'Dev', team: 'B', handCount: 7, badge: { kind: 'sar', value: 2 }, isDealer: true }),
  ],
  trick: { hukum: 'S', thinkingSeat: 1, plays: { 0: { card: 'QD' }, 2: { card: 'JD', led: true }, 3: { card: '7S', cut: true, winning: true } } },
  plays: [{ seat: 2, card: 'JD' }, { seat: 3, card: '7S' }, { seat: 0, card: 'QD' }],
  race: {
    toMake: 5, toBreak: 4, bidderTeam: 'B', line: '8 left · trick 6 of 13',
    history: ['B', 'A', 'B', 'A', 'B', 'now', null, null, null, null, null, null, null],
    aria: 'Ben and Dev need 5 to make. You and Asha need 4 to break. 8 tricks left.',
  },
  lastTrick: true,
  hand: ['AS', 'QS', 'TS', 'KH', 'JH', '9C', '7D'],
  hukum: 'S',
  yourTurn: false,
  layout: 'idle',
  stake: { suit: 'S', text: 'Dev cut with 7♠. If it holds, Ben & Dev reach 4 of 8.' },
  lane: { name: 'Asha', text: 'that cut hurt' },
  dock: 'Ben is choosing',
  unread: 1,
};

// ---- 12 trick resolving
export const trickWon: PlayView = {
  ...waitingCut,
  hud: r5Hud(4, { tickup: true }),
  seats: [
    seat({ seat: 0, name: 'You', team: 'A', isMe: true, handCount: 7, badge: { kind: 'sar', value: 1 } }),
    seat({ seat: 1, name: 'Ben', team: 'B', handCount: 7, badge: { kind: 'sar', value: 1 }, bidderBid: 8 }),
    seat({ seat: 2, name: 'Asha', team: 'A', handCount: 7, badge: { kind: 'sar', value: 1 } }),
    seat({ seat: 3, name: 'Dev', team: 'B', handCount: 7, badge: { kind: 'sar', value: 3 }, isDealer: true, wonTrick: true }),
  ],
  trick: {
    hukum: 'S',
    plays: { 0: { card: 'QD' }, 1: { card: '9D' }, 2: { card: 'JD', led: true }, 3: { card: '7S', cut: true, winning: true } },
    sweep: { target: { x: 262, y: 166 }, progress: { 0: 0.5, 1: 0.58, 2: 0.64, 3: 0.78 } },
  },
  plays: [{ seat: 2, card: 'JD' }, { seat: 3, card: '7S' }, { seat: 0, card: 'QD' }, { seat: 1, card: '9D' }],
  race: {
    toMake: 4, toBreak: 4, bidderTeam: 'B', line: '7 left · Dev leads trick 7',
    history: ['B', 'A', 'B', 'A', 'B', 'B', null, null, null, null, null, null, null],
    aria: 'Ben and Dev need 4 to make. You and Asha need 4 to break. 7 tricks left.',
  },
  stake: { suit: 'S', text: 'Dev takes trick 6 with the 7♠ cut. Ben & Dev have 4 of 8.' },
  lane: undefined,
  dock: 'Dev leads trick 7',
};

// ---- 13 reconnecting, Ben replaced by a bot
// Banner copy follows the PNG for now; the pause-vote rule decides the final wording.
export const reconnecting: PlayView = {
  hud: r5Hud(4),
  banner: { text: 'Reconnecting · your turn is held', countdown: '0:24' },
  held: true,
  toast: { team: 'B', title: 'Ben left.', body: 'A bot is playing Ben’s hand until Ben rejoins.' },
  seats: [
    seat({ seat: 0, name: 'You', team: 'A', isMe: true, handCount: 5, badge: { kind: 'sar', value: 2 }, turnProgress: 80, tag: { text: 'held', tone: 'hot' } }),
    seat({ seat: 1, name: 'Ben', team: 'B', handCount: 5, badge: { kind: 'sar', value: 1 }, bidderBid: 8, isBot: true }),
    seat({ seat: 2, name: 'Asha', team: 'A', handCount: 4, badge: { kind: 'sar', value: 2 } }),
    seat({ seat: 3, name: 'Dev', team: 'B', handCount: 4, badge: { kind: 'sar', value: 3 }, isDealer: true }),
  ],
  trick: { hukum: 'S', yourSlot: true, plays: { 2: { card: '5H', led: true, winning: true }, 3: { card: '2H' } } },
  plays: [{ seat: 2, card: '5H' }, { seat: 3, card: '2H' }],
  race: {
    toMake: 4, toBreak: 2, bidderTeam: 'B', line: '5 left · trick 9 of 13',
    history: ['B', 'A', 'B', 'A', 'B', 'B', 'A', 'A', 'now', null, null, null, null],
    aria: 'Ben and Dev need 4 to make. You and Asha need 2 to break. 5 tricks left.',
  },
  lastTrick: true,
  hand: ['AS', 'QS', 'KH', 'JH', '9C'],
  hukum: 'S',
  yourTurn: true,
  layout: 'idle',
  dock: 'Reconnecting · nothing is lost',
  unread: 1,
};

// ---- 14 round summary
export const roundSummary: RoundSummaryView = {
  roundNo: 5,
  tricksPlayed: 10,
  bidder: { name: 'Ben', team: 'B', bid: 8, hukum: 'S' },
  teamNames: TEAMS,
  you: 'A',
  outcome: 'FAILED',
  sarWon: 4,
  story: 'You and Asha reached 6 Sar on trick 10, so 8 was out of reach. The last 3 tricks were not played.',
  ledgerBefore: 26,
  ledgerAfter: 42,
  target: 52,
  revealed: [
    { name: 'You', team: 'A', cards: ['QS', 'JH', '9C'] },
    { name: 'Ben', team: 'B', cards: ['KS', 'TD', '5C'] },
    { name: 'Asha', team: 'A', cards: ['JS', '8D', '6H'] },
    { name: 'Dev', team: 'B', cards: ['9S', '3D', 'QC'] },
  ],
  next: { roundNo: 6, dealerName: 'Dev', stays: true, note: 'The dealer chip stays with Dev until Ben & Dev go above zero.' },
  ready: [{ initial: 'B', ready: true }, { initial: 'A', ready: true }, { initial: 'D', ready: false }, { initial: 'Y', isMe: true, ready: false }],
  countdown: 6,
};

// ---- 15 / 15b match result
const HISTORY: MatchResultView['history'] = [
  { who: 'Ben', team: 'B', bid: 8, hukum: 'H', outcome: 'MADE', ledgerAfter: -8 },
  { who: 'You', team: 'A', bid: 7, hukum: 'C', outcome: 'MADE', ledgerAfter: -1 },
  { who: 'Dev', team: 'B', bid: 9, hukum: 'D', outcome: 'FAILED', ledgerAfter: 17 },
  { who: 'You', team: 'A', bid: 9, hukum: 'S', outcome: 'MADE', ledgerAfter: 26 },
  { who: 'Ben', team: 'B', bid: 8, hukum: 'S', outcome: 'FAILED', ledgerAfter: 42 },
];
export const matchResult: MatchResultView = {
  winner: 'A', teamNames: TEAMS, reason: 'TARGET', target: 52,
  story: 'Asha made 10 with hearts as Hukum to reach +52. Ben & Dev were ahead only after rounds 1 and 2.',
  history: [...HISTORY, { who: 'Asha', team: 'A', bid: 10, hukum: 'H', outcome: 'MADE', ledgerAfter: 52 }],
};
// Kot: delta 0, the match ends on the spot (user ruling; the 15b PNG adds +13).
export const matchResultKot: MatchResultView = {
  winner: 'A', teamNames: TEAMS, reason: 'KOT', target: 52,
  story: 'You bid 13 with spades as Hukum and took all 13 Sar. A Kot ends the match on the spot.',
  history: [...HISTORY, { who: 'You', team: 'A', bid: 13, hukum: 'S', outcome: 'KOT', ledgerAfter: 42 }],
};

// ---- 13 (other players' view): Ben dropped on his turn, the table votes
export const benReconnecting: PlayView = {
  ...waitingCut,
  seats: waitingCut.seats.map((x) => (x.seat === 1 ? { ...x, connected: false, tag: { text: 'held', tone: 'hot' as const } } : x)),
  stake: undefined,
  lane: undefined,
  dock: 'Waiting for Ben',
};

/** Live vote: counts down, a majority to wait adds a minute, a majority for the bot hands Ben's seat to a bot. */
export function PauseVoteLive({ start = 24 }: { start?: number }) {
  const [vote, setVote] = useState<PauseVoteView>({ name: 'Ben', team: 'B', secondsLeft: start, voters: 2, votes: { wait: 0, bot: 0 }, yourVote: null });
  const [bot, setBot] = useState(false);
  useEffect(() => {
    if (bot) return;
    if (vote.secondsLeft <= 0) { setBot(true); return; }
    const t = window.setTimeout(() => setVote((x) => ({ ...x, secondsLeft: x.secondsLeft - 1 })), 1000);
    return () => window.clearTimeout(t);
  }, [vote.secondsLeft, bot]);
  const onVote = (choice: 'wait' | 'bot') => {
    // Asha (the other human) agrees with you a second later.
    setVote((x) => ({ ...x, yourVote: choice, votes: { wait: choice === 'wait' ? 1 : 0, bot: choice === 'bot' ? 1 : 0 } }));
    window.setTimeout(() => {
      if (choice === 'wait') setVote((x) => ({ ...x, secondsLeft: x.secondsLeft + EXTEND_BY, votes: { wait: 0, bot: 0 }, yourVote: null }));
      else setBot(true);
    }, 1000);
  };
  const v: PlayView = bot
    ? { ...benReconnecting, seats: benReconnecting.seats.map((x) => (x.seat === 1 ? { ...x, isBot: true, connected: true, tag: undefined } : x)),
        toast: { team: 'B', title: 'Ben left.', body: 'A bot is playing Ben’s hand until Ben rejoins.' } }
    : { ...benReconnecting, pauseVote: vote };
  return <PlayScreen v={v} onVote={onVote} />;
}

// ---- 01 / 02 / 03 menus
export function SettingsReference() {
  // The reference shows default settings; set them in memory only (nothing is saved).
  useState(() => { useSettings.setState({ ...defaultSettings(), motion: 'normal', nickname: 'Kabir' }); return 0; });
  return <SettingsScreen />;
}

const lobbyBase: LobbyView = {
  code: 'K7QDM',
  url: 'https://chaugadi.app/r/K7QDM',
  you: 0,
  seats: {
    0: { name: 'Kabir', isBot: false, ready: true, isHost: true },
    1: { name: 'Ben', isBot: false, ready: false, isHost: false },
    2: { name: 'Asha', isBot: false, ready: true, isHost: false },
    3: null,
  },
  turnSeconds: 20,
  botLevel: 'medium',
};
export const lobbyFull: LobbyView = { ...lobbyBase, seats: { ...lobbyBase.seats, 1: { ...lobbyBase.seats[1]!, ready: true }, 3: { name: 'Dev', isBot: false, ready: true, isHost: false } } };

export const SCREEN_RENDERS = {
  '05-dealing-5': () => <DealFiveScreen v={deal5} />,
  '06-bidding-waiting': () => <AuctionScreen v={auctionWaiting} />,
  '07-bid-sheet': () => <AuctionScreen v={auctionYourCall} initial={{ selected: 9 }} />,
  '07b-bid-sheet-passed': () => <AuctionScreen v={auctionYourCall} initial={{ passed: true }} />,
  '08-hukum-pick': () => <HukumScreen v={hukumPick} />,
  '09-hukum-reveal-deal-8': () => <HukumRevealScreen v={hukumReveal} />,
  '10-your-turn-13-cards': () => <YourTurnLive />,
  '10b-your-turn-illegal-tap': () => <YourTurnLive initialSelected={null} initialIllegal="KH" />,
  '10c-your-turn-played': () => <YourTurnLive start={afterPlay(yourTurn, 'AC')} initialSelected={null} />,
  '20-light-theme': () => <YourTurnLive />,
  '21-stress-360': () => <YourTurnLive width={360} height={800} />,
  '11-waiting-cut': () => <PlayScreen v={waitingCut} />,
  '12-trick-resolving': () => <PlayScreen v={trickWon} />,
  '13-reconnecting-bot': () => <PlayScreen v={reconnecting} />,
  '13-vote': () => <PauseVoteLive />,
  '13-vote-locked': () => <PauseVoteLive start={45} />,
  '14-round-summary': () => <RoundSummaryScreen v={roundSummary} />,
  '15-match-result': () => <MatchResultScreen v={matchResult} />,
  '15b-match-result-kot': () => <MatchResultScreen v={matchResultKot} />,
  ...Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((l, i) => [
    `04${l}-how-to-play-step-${i + 1}`,
    () => <Tutorial width={390} height={844} initialStep={i} onExit={() => window.history.back()} />,
  ])),
  '01-home': () => <HomeScreen nickname="Kabir" botLevel="medium" initialCode="K" footer={{ kind: 'last', team: 'A', names: 'You & Asha', value: 52 }} />,
  '01-home-resume': () => <HomeScreen nickname="Kabir" botLevel="hard" footer={{ kind: 'resume', team: 'A', names: 'You & Asha', value: 17, round: 4 }} />,
  '02-settings': () => <SettingsReference />,
  '03-lobby': () => <LobbyScreen v={lobbyBase} />,
  '03b-lobby-full': () => <LobbyScreen v={lobbyFull} />,
  '03c-lobby-starting': () => <LobbyScreen v={{ ...lobbyFull, startingIn: 2 }} />,
  '03-lobby-guest': () => <LobbyScreen v={{ ...lobbyFull, you: 2, seats: { ...lobbyFull.seats, 2: { ...lobbyFull.seats[2]!, ready: false } } }} />,
} satisfies Record<string, () => React.ReactNode>;
