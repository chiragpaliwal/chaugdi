// What each game event sounds, buzzes and says (GDD §12.3, §12.4, §14; HANDOFF §7, §9).
// Pure, so the mapping is tested without a browser.

import { nextSeat, otherTeam, partnerOf, standing, teamOf, type GameEvent, type PlayerView, type Seat, type Team } from '../../engine/types';
import { MOTION } from '../../shared/constants';
import { cardLabel, SUIT_NAME } from '../components/cardText';
import { HAPTIC, type Pattern } from './haptics';
import type { Cue } from './sounds';

export interface FeedbackContext {
  view: Pick<PlayerView, 'you' | 'contract' | 'trump'>;
  names: Record<Seat, string>;
  /** Motion speed multiplier, so delayed cues land with their animation. */
  scale: number;
}

export interface Feedback {
  cues: { cue: Cue; delayMs: number }[];
  haptic?: Pattern;
  /** Sentence for the ARIA live region. */
  say?: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "You & Asha", "Ben & Dev" (HANDOFF §8): your pair first names you, the other pair goes left then right. */
export function teamName(team: Team, you: Seat, names: Record<Seat, string>): string {
  if (team === teamOf(you)) return `You & ${names[partnerOf(you)]}`;
  const left = nextSeat(you);
  return `${names[left]} & ${names[partnerOf(left)]}`;
}

export function feedbackFor(e: GameEvent, ctx: FeedbackContext): Feedback {
  const { you, contract, trump } = ctx.view;
  const ours = teamOf(you);
  const who = (s: Seat) => (s === you ? 'You' : ctx.names[s]);
  /** Third person for others, second for you: verb('deal', 'deals'). */
  const verb = (s: Seat, second: string, third: string) => `${who(s)} ${s === you ? second : third}`;
  const team = (t: Team) => teamName(t, you, ctx.names);
  const cue = (c: Cue, delayMs = 0) => ({ cue: c, delayMs: Math.round(delayMs * ctx.scale) });

  switch (e.t) {
    case 'roundStarted':
      return { cues: [cue('shuffle')], say: `Round ${e.roundNo}. ${verb(e.dealer, 'deal', 'deals')}.` };
    case 'dealt': {
      const n = e.batch === 5 ? 20 : 4;
      const stagger = e.batch === 5 ? MOTION.deal5Stagger : MOTION.deal8Stagger;
      const flight = e.batch === 5 ? MOTION.deal5Flight : MOTION.deal8Flight;
      const cues = Array.from({ length: n }, (_, i) => cue('dealTick', i * stagger + flight));
      return { cues, say: e.batch === 5 ? 'Five cards dealt. Bidding starts.' : undefined };
    }
    case 'bid':
      return { cues: [cue('bidPop')], say: `${who(e.seat)} bid ${e.value}${e.value === 13 ? ', Kot' : ''}.` };
    case 'pass':
      return { cues: [cue('pass')], say: `${who(e.seat)} passed.` };
    case 'auctionWon':
      return { cues: [], say: e.forced ? `Everyone passed. ${who(e.seat)} must play 7.` : `${who(e.seat)} won the auction at ${e.value}.` };
    case 'trumpChosen':
      return { cues: [cue('trumpReveal')], haptic: HAPTIC.hukum, say: `${cap(SUIT_NAME[e.suit])} are Hukum. Eight more cards each.` };
    case 'cardPlayed':
      return { cues: [cue('cardPlace')], say: `${who(e.seat)} played ${cardLabel(e.card, trump)}.` };
    case 'cut':
      return { cues: [cue('cut')], say: `${who(e.seat)} cut with Hukum.` };
    case 'trickWon':
      return {
        cues: [cue('trickSweep', MOTION.trickHold)],
        haptic: e.team === ours ? HAPTIC.trickOurs : undefined,
        say: `${who(e.seat)} won trick ${e.trickNo}.`,
      };
    case 'roundDecided': {
      if (!contract) return { cues: [] };
      const bidders = team(contract.team);
      if (e.outcome === 'KOT') return { cues: [], say: `Kot! ${bidders} won all 13 Sar.` };
      const good = (e.outcome === 'MADE') === (contract.team === ours);
      return {
        cues: [cue(good ? 'made' : 'failed')],
        haptic: good ? HAPTIC.made : HAPTIC.failed,
        say: e.outcome === 'MADE' ? `Contract made. ${bidders} made ${contract.bid}.` : `Contract broken. ${bidders} missed ${contract.bid}.`,
      };
    }
    case 'handsRevealed':
      return { cues: [] };
    case 'scored': {
      if (e.delta === 0) return { cues: [] };
      const s = standing(e.ledger, ours);
      const lead = s === 0 ? 'Level' : `${team(s > 0 ? ours : otherTeam(ours))} lead by ${Math.abs(s)}`;
      const change = e.delta > 0 ? `score ${e.delta}` : `lose ${-e.delta}`;
      return { cues: [], say: `${team(e.team)} ${change}. ${lead}.` };
    }
    case 'dealerChanged':
      return { cues: [], say: `${verb(e.to, 'deal', 'deals')} next.` };
    case 'dealerStays':
      return { cues: [], say: `${verb(e.seat, 'deal', 'deals')} again.` };
    case 'matchOver': {
      const won = e.winner === ours;
      const kot = e.reason === 'KOT';
      return {
        cues: [cue(won ? (kot ? 'kot' : 'made') : 'failed')],
        haptic: won ? (kot ? HAPTIC.kot : HAPTIC.matchWon) : HAPTIC.failed,
        say: `${kot ? 'Kot! ' : ''}${team(e.winner)} win the match.`,
      };
    }
  }
}

/** The prompt when the turn reaches you, or null when there is nothing to do. */
export function turnPrompt(view: Pick<PlayerView, 'you' | 'turn' | 'phase' | 'current'>): string | null {
  if (view.turn !== view.you) return null;
  switch (view.phase) {
    case 'BIDDING': return 'Your call. Bid or pass.';
    case 'TRUMP_SELECTION': return 'Call Hukum.';
    case 'TRICK_LOOP': return view.current?.plays.length ? 'Your turn.' : 'Your lead.';
    default: return null;
  }
}
