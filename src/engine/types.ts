// Normative data model from GDD §7. Pure data: everything here is serialisable.

// ---------- cards ----------
export type Suit = 'S' | 'H' | 'D' | 'C';
export type RankChar = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type CardId = `${RankChar}${Suit}`; // "AS", "TH", "2C"

export const RANKS: RankChar[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export const rankValue = (c: CardId) => RANKS.indexOf(c[0] as RankChar) + 2; // 2..14
export const suitOf = (c: CardId) => c[1] as Suit;
export const rankOf = (c: CardId) => c[0] as RankChar;

// ---------- seats / teams ----------
export type Seat = 0 | 1 | 2 | 3;
export type Team = 'A' | 'B';
export const SEATS: Seat[] = [0, 1, 2, 3];
export const teamOf = (s: Seat): Team => (s % 2 === 0 ? 'A' : 'B');
export const otherTeam = (t: Team): Team => (t === 'A' ? 'B' : 'A');
export const nextSeat = (s: Seat): Seat => ((s + 1) % 4) as Seat; // the player on the left
export const partnerOf = (s: Seat): Seat => ((s + 2) % 4) as Seat;
export const standing = (ledger: number, t: Team) => (t === 'A' ? ledger : -ledger);

// ---------- config ----------
export interface MatchConfig {
  targetScore: number; // 52
  minBid: number; // 7
  maxBid: number; // 13
}
export const DEFAULT_CONFIG: MatchConfig = { targetScore: 52, minBid: 7, maxBid: 13 };

// ---------- auction ----------
export type AuctionEntry = { seat: Seat; kind: 'bid'; value: number } | { seat: Seat; kind: 'pass' };
export interface AuctionState {
  high: { seat: Seat; value: number } | null;
  consecutivePasses: number; // passes since the last bid (or since the start if nobody has bid)
  log: AuctionEntry[];
}

// ---------- tricks ----------
export interface Play { seat: Seat; card: CardId }
export interface Trick { leader: Seat; plays: Play[]; winner?: Seat }

// ---------- round ----------
export interface Contract { seat: Seat; team: Team; bid: number; forced: boolean }
export type Outcome = 'MADE' | 'FAILED' | 'KOT';
export interface RoundResult {
  roundNo: number; dealer: Seat; contract: Contract; trump: Suit;
  tricksWon: Record<Team, number>;
  outcome: Outcome;
  delta: number; // applied to the bidding team's standing (+b or −2b; 0 for KOT)
  ledgerAfter: number;
  tricksPlayed: number; // < 13 when the round ended early
}
export interface RoundState {
  roundNo: number;
  hands: Record<Seat, CardId[]>;
  stock: CardId[]; // 32 after Deal 5, 0 after Deal 8
  auction: AuctionState;
  contract: Contract | null;
  trump: Suit | null;
  tricks: Trick[]; // completed tricks
  current: Trick | null;
  tricksWon: Record<Team, number>;
  turn: Seat | null;
  result: RoundResult | null;
}

// ---------- match ----------
export type Phase = 'LOBBY' | 'BIDDING' | 'TRUMP_SELECTION' | 'TRICK_LOOP' | 'ROUND_EVAL' | 'MATCH_END';
export type WinReason = 'TARGET' | 'KOT';
export interface MatchState {
  config: MatchConfig;
  phase: Phase;
  seed: string; // match seed; the round seed is derived from it (§8.2)
  ledger: number; // > 0 means Team A is ahead
  dealer: Seat;
  round: RoundState | null;
  history: RoundResult[];
  winner: Team | null;
  winReason: WinReason | null;
}

// ---------- actions ----------
export type Action =
  | { type: 'START_MATCH'; seed: string; dealer: Seat } // system
  | { type: 'BID'; seat: Seat; value: number }
  | { type: 'PASS'; seat: Seat }
  | { type: 'CHOOSE_TRUMP'; seat: Seat; suit: Suit }
  | { type: 'PLAY_CARD'; seat: Seat; card: CardId }
  | { type: 'NEXT_ROUND' }; // system

// ---------- events (drive animations) ----------
export type GameEvent =
  | { t: 'roundStarted'; roundNo: number; dealer: Seat }
  | { t: 'dealt'; batch: 5 | 4; order: Seat[] } // cards themselves are in the view
  | { t: 'bid'; seat: Seat; value: number }
  | { t: 'pass'; seat: Seat }
  | { t: 'auctionWon'; seat: Seat; value: number; forced: boolean }
  | { t: 'trumpChosen'; seat: Seat; suit: Suit }
  | { t: 'cardPlayed'; seat: Seat; card: CardId }
  | { t: 'cut'; seat: Seat; card: CardId }
  | { t: 'trickWon'; seat: Seat; team: Team; trickNo: number }
  | { t: 'roundDecided'; outcome: Outcome; afterTrick: number }
  | { t: 'handsRevealed'; hands: Record<Seat, CardId[]> }
  | { t: 'scored'; team: Team; delta: number; ledger: number }
  | { t: 'dealerChanged'; from: Seat; to: Seat }
  | { t: 'dealerStays'; seat: Seat }
  | { t: 'matchOver'; winner: Team; reason: WinReason };

// ---------- per-seat view (the ONLY thing a client or bot ever receives) ----------
export interface PlayerView {
  you: Seat;
  phase: Phase;
  roundNo: number;
  dealer: Seat;
  ledger: number;
  hand: CardId[]; // your cards only, sorted for display
  handCounts: Record<Seat, number>;
  auction: AuctionState; // the auction is public
  contract: Contract | null;
  trump: Suit | null;
  current: Trick | null;
  lastTrick: Trick | null;
  /**
   * Completed tricks this round. Not in GDD §7: every play is public, and bots need
   * who-played-what to track voids (§9) without keeping state between calls.
   */
  tricks: Trick[];
  tricksWon: Record<Team, number>;
  playedCards: CardId[]; // all cards played this round (public)
  turn: Seat | null;
  legal: CardId[]; // legal plays when it's your turn, else []
  revealedHands: Record<Seat, CardId[]> | null; // only after the round is decided
  history: RoundResult[];
  winner: Team | null;
  winReason: WinReason | null;
  config: MatchConfig;
  // online-only fields, added by the server:
  players?: Record<Seat, { name: string; isBot: boolean; connected: boolean }>;
  turnDeadline?: number | null; // epoch ms
  seq?: number; // monotonically increasing view version
}

// ---------- errors ----------
export type RuleErrorCode =
  | 'WRONG_PHASE' | 'NOT_YOUR_TURN' | 'BID_OUT_OF_RANGE' | 'BID_NOT_HIGHER'
  | 'NOT_CONTRACT_HOLDER' | 'CARD_NOT_IN_HAND' | 'MUST_FOLLOW_SUIT' | 'MATCH_OVER';

export class RuleError extends Error {
  constructor(public readonly code: RuleErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'RuleError';
  }
}
