// Sample data from the design story (HANDOFF §0 Screen index): You and Asha are Team A,
// Ben (left) and Dev (right) Team B. Values match the board scripts in docs/boards.

import type { CardId } from '../../engine/types';
import type { HandCard } from '../components/HandFan';
import type { RaceView, SeatView, TrickView } from '../view/types';

const seat = (s: Partial<SeatView> & Pick<SeatView, 'seat' | 'name' | 'team'>): SeatView => ({
  isMe: false, isBot: false, connected: true, handCount: null, isDealer: false, bidderBid: null, turnProgress: null, ...s,
});

// ---- Round 5, trick 1, your turn with 13 cards (screens 10, 20, 21)
export const r5Trick1Seats: SeatView[] = [
  seat({ seat: 0, name: 'You', team: 'A', isMe: true, turnProgress: 72, handCount: 13 }),
  seat({ seat: 1, name: 'Ben', team: 'B', bidderBid: 8, handCount: 12 }),
  seat({ seat: 2, name: 'Asha', team: 'A', handCount: 12 }),
  seat({ seat: 3, name: 'Dev', team: 'B', isDealer: true, handCount: 12 }),
];

export const r5Trick1: TrickView = {
  hukum: 'S',
  yourSlot: true,
  plays: {
    1: { card: 'KC', led: true },
    2: { card: '2C' },
    3: { card: '4S', cut: true, winning: true },
  },
};

export const r5Trick1Race: RaceView = {
  toMake: 8, toBreak: 6, bidderTeam: 'B', line: '13 left · Ben bid 8',
  history: ['now', ...Array<null>(12).fill(null)],
  aria: 'Ben and Dev need 8 to make. You and Asha need 6 to break. Trick 1 of 13.',
};

const R5_HAND: CardId[] = ['AS', 'QS', 'TS', '6S', '3S', 'KH', 'JH', '8H', 'AC', '9C', '4C', 'QD', '7D'];
export const r5Hand: HandCard[] = R5_HAND.map((card) => ({ card, legal: card[1] === 'C' }));

// ---- Round 4, auction, Dev calling (screen 06)
export const r4AuctionSeats: SeatView[] = [
  seat({ seat: 0, name: 'You', team: 'A', isMe: true, handCount: 5, badge: { kind: 'call', value: 7 }, tag: { text: 'next', tone: 'hot' } }),
  seat({ seat: 1, name: 'Ben', team: 'B', handCount: 5, badge: { kind: 'call', value: 8 }, tag: { text: 'high', tone: 'ok' } }),
  seat({ seat: 2, name: 'Asha', team: 'A', handCount: 5, tag: { text: 'pass', tone: 'mute' } }),
  seat({ seat: 3, name: 'Dev', team: 'B', isDealer: true, turnProgress: 55, handCount: 5, badge: { kind: 'wait' }, tag: { text: 'calling', tone: 'hot' } }),
];

export const r4FirstFive: HandCard[] = (['AS', 'QS', 'TS', 'KH', 'AC'] as CardId[]).map((card) => ({ card }));
