import { useEffect, useRef, useState } from 'react';
import type { Play } from '../../engine/tricks';
import type { CardId, Suit, Team } from '../../engine/types';
import { cardShort } from '../components/cardText';
import { Banner, type BannerProps, CardsSeenButton, ChatButton, ChatLane, DockStatus, HintLine, LastTrickButton, Reactions, StakeLine, StatusLine, Toast } from '../components/GameParts';
import { HandFan } from '../components/HandFan';
import { PauseVote, type PauseVoteView } from '../components/PauseVote';
import { RacePill } from '../components/RacePill';
import { Table } from '../components/Table';
import { useFeatures } from '../features';
import { describePlay, illegalReason, isLegal, yourTurnStatus, type StatusParts } from '../table/hints';
import { handCardWidth, type CardSizeSetting, type ViewSeat } from '../table/geometry';
import type { RaceView, SeatView, TrickView } from '../view/types';
import { GameFrame, TABLE_MARGIN, fitTable, PILL_TABLE_MIN, type HudView } from './GameFrame';

export interface PlayView {
  hud: HudView;
  seats: SeatView[];
  trick: TrickView;
  /** Plays of the current trick in play order, view-relative seats (for hints and legality). */
  plays: Play[];
  race: RaceView;
  lastTrick?: boolean;
  /** The last trick is showing in the cross (its button reads "Back to play"). */
  peeking?: boolean;
  hand: CardId[];
  hukum: Suit;
  yourTurn: boolean;
  /**
   * 'turn': status line, two-row fan, hint and CTA (10, 10c).
   * 'idle': the same hand, no hint or CTA, while others play (11, 12).
   */
  layout: 'turn' | 'idle';
  status?: StatusParts;
  hint?: string;
  stake?: { suit?: Suit; text: string };
  lane?: { name: string; text: string };
  /** Dock text when there is nothing to do. */
  dock?: string;
  unread?: number;
  /** Your connection dropped: banner under the HUD, hand dimmed, actions off (13). */
  banner?: BannerProps;
  held?: boolean;
  /** Another player dropped and a bot took their seat (13). */
  toast?: { team: Team; title: string; body: string };
  /** Another player dropped on their turn: vote to wait or let a bot play. */
  pauseVote?: PauseVoteView;
}

interface Props {
  v: PlayView;
  width?: number;
  height?: number;
  cardSize?: CardSizeSetting;
  onPlay?: (card: CardId) => void;
  onCardsSeen?: () => void;
  onLastTrick?: () => void;
  onVote?: (choice: 'wait' | 'bot') => void;
  initialSelected?: CardId | null;
  /** Freeze the illegal-tap message (for references). */
  initialIllegal?: CardId | null;
}

const ILLEGAL_MS = 2500;

export function PlayScreen({ v, width = 390, height = 844, cardSize = 'M', onPlay, onCardsSeen, onLastTrick, onVote, initialSelected = null, initialIllegal = null }: Props) {
  const { chat } = useFeatures();
  const [selected, setSelected] = useState<CardId | null>(initialSelected);
  const [illegal, setIllegal] = useState<CardId | null>(initialIllegal);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (!v.yourTurn) setSelected(null); }, [v.yourTurn]);

  const tableW = width - 24;
  const narrow = width < 375;
  // HANDOFF §3: 470 in play, 440 while a banner shows.
  const tableH = fitTable(v.banner ? 440 : narrow ? 430 : 470, height, PILL_TABLE_MIN);
  const yourTurn = v.yourTurn && !v.held;
  const names = Object.fromEntries(v.seats.map((s) => [s.seat, s.name])) as Record<ViewSeat, string>;
  const cards = v.hand.map((card) => ({ card, legal: yourTurn ? isLegal(card, v.hand, v.plays) : true }));
  const w = handCardWidth(cardSize, width) as 56 | 62 | 70;

  const tapIllegal = (card: CardId) => {
    setIllegal(card);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIllegal(null), ILLEGAL_MS);
  };
  const play = (card: CardId) => { setSelected(null); setIllegal(null); onPlay?.(card); };

  const table = (
    <Table width={tableW} height={tableH} seats={v.seats} trick={v.trick} held={v.held} style={TABLE_MARGIN}
      centre={(g) => <RacePill variant="race" at={g.pill} compact={g.pillCompact} race={v.race} />}>
      {v.lastTrick && <LastTrickButton onClick={onLastTrick} showing={v.peeking} />}
    </Table>
  );

  if (v.layout === 'idle' || v.held) {
    return (
      <GameFrame width={width} height={height} hud={v.hud}>
        {v.banner && <Banner {...v.banner} />}
        {table}
        {v.toast && <Toast {...v.toast} />}
        {v.pauseVote && <PauseVote v={v.pauseVote} onVote={onVote} />}
        {v.stake && <StakeLine {...v.stake} />}
        {v.lane && <ChatLane {...v.lane} />}
        {/* An empty status line and the same fan as your turn, so the hand stays put between turns. */}
        <div className="status-line" style={{ marginTop: 4 }} aria-hidden="true" />
        <HandFan cards={cards} width={tableW} cardWidth={w} hukum={v.hukum}
          className={v.held ? 'held' : undefined} style={{ margin: '0 12px' }} />
        <div className="dock">
          <ChatButton unread={v.unread} />
          {chat && !v.held ? <Reactions /> : <DockStatus text={v.dock ?? 'Waiting'} />}
        </div>
      </GameFrame>
    );
  }

  const status = v.status ?? (yourTurn ? yourTurnStatus(v.hand, v.plays) : { bold: 'Waiting', text: '' });
  const ctx = { plays: v.plays, hukum: v.hukum, names };
  const hint = illegal ? illegalReason(v.hand, v.plays)
    : v.hint ?? (selected ? describePlay(selected, ctx) : null);

  return (
    <GameFrame width={width} height={height} hud={v.hud}>
      {table}
      <StatusLine status={status} style={{ marginTop: 4 }} />
      <HandFan cards={cards} width={tableW} cardWidth={w} hukum={v.hukum} yourTurn={yourTurn}
        selected={selected} onSelect={(c) => { setSelected(c); setIllegal(null); }} onPlay={play} onIllegal={tapIllegal}
        style={{ margin: '0 12px' }} />
      {hint && <HintLine text={hint} warn={!!illegal} />}
      <div className="dock">
        <ChatButton unread={v.unread} />
        <CardsSeenButton onClick={onCardsSeen} />
        {yourTurn
          ? <button className={`cta${selected ? '' : ' ghost'}`} aria-disabled={!selected || undefined} onClick={() => selected && play(selected)}>
              {selected ? `Play ${cardShort(selected)}` : 'Pick a card'}
            </button>
          : <div className="cta ghost" aria-live="polite">{v.dock ?? 'Waiting'}</div>}
      </div>
    </GameFrame>
  );
}
