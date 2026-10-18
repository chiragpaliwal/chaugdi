// The rules reducer (GDD §6, §8). Pure: no clock, no Math.random, never mutates its input.

import { cloneHands, cloneMatch } from './clone';
import { canPass, emptyAuction, legalBidValues, stepBid, stepPass, type AuctionStep } from './auction';
import { roundRng, shuffle, SORTED_DECK } from './rng';
import { isRoundDecided, nextDealer, roundDelta } from './scoring';
import { isFirstCut, legalCards, trickWinner } from './tricks';
import {
  DEFAULT_CONFIG, nextSeat, RuleError, SUITS, teamOf,
  type Action, type CardId, type GameEvent, type MatchConfig, type MatchState, type Outcome, type RoundState, type Seat,
} from './types';

export interface Applied { state: MatchState; events: GameEvent[] }

/** Deal order: the player on the dealer's left first, the dealer last. */
export const dealOrder = (dealer: Seat): Seat[] => [1, 2, 3, 4].map((k) => ((dealer + k) % 4) as Seat);

/** A room waiting to start. */
export function createLobby(config: MatchConfig = DEFAULT_CONFIG): MatchState {
  return { config, phase: 'LOBBY', seed: '', ledger: 0, dealer: 0, round: null, history: [], winner: null, winReason: null };
}

/** A started match, already in BIDDING. */
export function newMatch(config: MatchConfig, seed: string, dealer: Seat): MatchState {
  return apply(createLobby(config), { type: 'START_MATCH', seed, dealer }).state;
}

export function apply(input: MatchState, action: Action): Applied {
  const state = cloneMatch(input);
  const events: GameEvent[] = [];
  switch (action.type) {
    case 'START_MATCH': {
      if (state.phase !== 'LOBBY' && state.phase !== 'MATCH_END') throw new RuleError('WRONG_PHASE');
      Object.assign(state, { seed: action.seed, dealer: action.dealer, ledger: 0, history: [], winner: null, winReason: null });
      startRound(state, 1, events);
      break;
    }
    case 'BID': {
      const round = requireTurn(state, 'BIDDING', action.seat);
      const { config } = state;
      if (!Number.isInteger(action.value) || action.value < config.minBid || action.value > config.maxBid) throw new RuleError('BID_OUT_OF_RANGE');
      if (!legalBidValues(round.auction, config).includes(action.value)) throw new RuleError('BID_NOT_HIGHER');
      events.push({ t: 'bid', seat: action.seat, value: action.value });
      afterAuctionStep(state, round, stepBid(round.auction, action.seat, action.value, config), events);
      break;
    }
    case 'PASS': {
      const round = requireTurn(state, 'BIDDING', action.seat);
      if (!canPass(round.auction)) throw new RuleError('OPENER_MUST_BID');
      events.push({ t: 'pass', seat: action.seat });
      afterAuctionStep(state, round, stepPass(round.auction, action.seat, state.config), events);
      break;
    }
    case 'CHOOSE_TRUMP': {
      if (state.phase === 'MATCH_END') throw new RuleError('MATCH_OVER');
      if (state.phase !== 'TRUMP_SELECTION') throw new RuleError('WRONG_PHASE');
      const round = state.round!;
      if (action.seat !== round.contract!.seat) throw new RuleError('NOT_CONTRACT_HOLDER');
      round.trump = action.suit;
      events.push({ t: 'trumpChosen', seat: action.seat, suit: action.suit });
      // DEAL_8 is transient: two passes of 4, each starting left of the dealer.
      const order = dealOrder(state.dealer);
      for (let pass = 0; pass < 2; pass++) {
        for (const s of order) round.hands[s].push(...round.stock.splice(0, 4));
        events.push({ t: 'dealt', batch: 4, order });
      }
      state.phase = 'TRICK_LOOP';
      round.current = { leader: round.contract!.seat, plays: [] };
      round.turn = round.contract!.seat;
      break;
    }
    case 'PLAY_CARD': {
      const round = requireTurn(state, 'TRICK_LOOP', action.seat);
      playCard(state, round, action.seat, action.card, events);
      break;
    }
    case 'NEXT_ROUND': {
      if (state.phase === 'MATCH_END') throw new RuleError('MATCH_OVER');
      if (state.phase !== 'ROUND_EVAL') throw new RuleError('WRONG_PHASE');
      state.dealer = nextDealer(state.ledger, state.dealer);
      startRound(state, state.round!.roundNo + 1, events);
      break;
    }
  }
  return { state, events };
}

function requireTurn(state: MatchState, phase: MatchState['phase'], seat: Seat): RoundState {
  if (state.phase === 'MATCH_END') throw new RuleError('MATCH_OVER');
  if (state.phase !== phase) throw new RuleError('WRONG_PHASE');
  const round = state.round!;
  if (round.turn !== seat) throw new RuleError('NOT_YOUR_TURN');
  return round;
}

/** DEAL_5 (transient): shuffle with the round seed, 5 each from dealer+1, the rest is the stock. */
function startRound(state: MatchState, roundNo: number, events: GameEvent[]) {
  const deck = shuffle(SORTED_DECK, roundRng(state.seed, roundNo));
  const order = dealOrder(state.dealer);
  const hands = { 0: [], 1: [], 2: [], 3: [] } as Record<Seat, CardId[]>;
  for (const s of order) hands[s] = deck.splice(0, 5);
  state.round = {
    roundNo, hands, stock: deck, auction: emptyAuction(), contract: null, trump: null,
    tricks: [], current: null, tricksWon: { A: 0, B: 0 }, turn: order[0]!, result: null,
  };
  state.phase = 'BIDDING';
  events.push({ t: 'roundStarted', roundNo, dealer: state.dealer }, { t: 'dealt', batch: 5, order });
}

function afterAuctionStep(state: MatchState, round: RoundState, step: AuctionStep, events: GameEvent[]) {
  round.auction = step.auction;
  if (!step.done) { round.turn = step.turn; return; }
  const { seat, value } = step.winner;
  round.contract = { seat, team: teamOf(seat), bid: value, forced: step.forced };
  round.turn = seat;
  state.phase = 'TRUMP_SELECTION';
  events.push({ t: 'auctionWon', seat, value, forced: step.forced });
}

function playCard(state: MatchState, round: RoundState, seat: Seat, card: CardId, events: GameEvent[]) {
  const hand = round.hands[seat];
  const trick = round.current!;
  if (!hand.includes(card)) throw new RuleError('CARD_NOT_IN_HAND');
  if (!legalCards(hand, trick.plays).includes(card)) throw new RuleError('MUST_FOLLOW_SUIT');

  const cut = isFirstCut(trick.plays, card, round.trump);
  round.hands[seat] = hand.filter((c) => c !== card);
  trick.plays.push({ seat, card });
  events.push({ t: 'cardPlayed', seat, card });
  if (cut) events.push({ t: 'cut', seat, card });

  if (trick.plays.length < 4) { round.turn = nextSeat(seat); return; }

  const winner = trickWinner(trick.plays, round.trump)!.seat;
  trick.winner = winner;
  round.tricks.push(trick);
  round.tricksWon[teamOf(winner)]++;
  events.push({ t: 'trickWon', seat: winner, team: teamOf(winner), trickNo: round.tricks.length });

  const outcome = isRoundDecided(round);
  if (outcome) { decide(state, round, outcome, events); return; }
  round.current = { leader: winner, plays: [] };
  round.turn = winner;
}

/** ROUND_EVAL entry: reveal, score, check for match end, announce the next dealer. */
function decide(state: MatchState, round: RoundState, outcome: Outcome, events: GameEvent[]) {
  const contract = round.contract!;
  const delta = roundDelta(outcome, contract.bid);
  round.current = null;
  round.turn = null;
  events.push(
    { t: 'roundDecided', outcome, afterTrick: round.tricks.length },
    { t: 'handsRevealed', hands: cloneHands(round.hands) },
  );
  state.ledger += contract.team === 'A' ? delta : -delta;
  round.result = {
    roundNo: round.roundNo, dealer: state.dealer, contract, trump: round.trump!,
    tricksWon: { ...round.tricksWon }, outcome, delta, ledgerAfter: state.ledger, tricksPlayed: round.tricks.length,
  };
  state.history.push(round.result);

  if (outcome === 'KOT') return endMatch(state, contract.team, 'KOT', events);
  events.push({ t: 'scored', team: contract.team, delta, ledger: state.ledger });
  if (Math.abs(state.ledger) >= state.config.targetScore) return endMatch(state, state.ledger > 0 ? 'A' : 'B', 'TARGET', events);

  state.phase = 'ROUND_EVAL';
  // Announced now so the summary can show it; applied on NEXT_ROUND (GDD §8.3 note).
  const to = nextDealer(state.ledger, state.dealer);
  events.push(to === state.dealer ? { t: 'dealerStays', seat: to } : { t: 'dealerChanged', from: state.dealer, to });
}

function endMatch(state: MatchState, winner: 'A' | 'B', reason: 'TARGET' | 'KOT', events: GameEvent[]) {
  state.phase = 'MATCH_END';
  state.winner = winner;
  state.winReason = reason;
  events.push({ t: 'matchOver', winner, reason });
}

// ---------------------------------------------------------------- helpers (GDD §8.1)

/** Bids `seat` may make now; [] when it is not their turn to bid. */
export function legalBids(state: MatchState, seat: Seat): number[] {
  if (state.phase !== 'BIDDING' || state.round?.turn !== seat) return [];
  return legalBidValues(state.round.auction, state.config);
}

/** Cards `seat` may play now; [] when it is not their turn to play. */
export function legalCardsFor(state: MatchState, seat: Seat): CardId[] {
  const round = state.round;
  if (state.phase !== 'TRICK_LOOP' || !round || round.turn !== seat) return [];
  return legalCards(round.hands[seat], round.current!.plays);
}

/** Every action the engine accepts now (system NEXT_ROUND included). */
export function legalActions(state: MatchState): Action[] {
  const turn = state.round?.turn;
  switch (state.phase) {
    case 'BIDDING': {
      const bids = legalBids(state, turn!).map((value) => ({ type: 'BID' as const, seat: turn!, value }));
      return canPass(state.round!.auction) ? [{ type: 'PASS', seat: turn! }, ...bids] : bids;
    }
    case 'TRUMP_SELECTION': return SUITS.map((suit) => ({ type: 'CHOOSE_TRUMP' as const, seat: turn!, suit }));
    case 'TRICK_LOOP': return legalCardsFor(state, turn!).map((card) => ({ type: 'PLAY_CARD' as const, seat: turn!, card }));
    case 'ROUND_EVAL': return [{ type: 'NEXT_ROUND' }];
    default: return [];
  }
}
