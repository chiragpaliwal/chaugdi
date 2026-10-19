// Solo match page (GDD §4.1, milestone 3): LocalDriver → animation queue → adapter → screens.

import { useEffect, useRef, useState } from 'react';
import { suitOf, type CardId, type Suit } from '../../engine/types';
import { DISPLAY_SUIT_ORDER } from '../../engine/cards';
import { Feedback } from '../audio/Feedback';
import { Card } from '../components/Card';
import { cardLabel, SUIT_NAME } from '../components/cardText';
import { SuitIcon } from '../components/SuitIcon';
import type { AnimQueue, AnimSnapshot } from '../anim/queue';
import { useAnim, useSoloSession } from '../drivers/session';
import type { GameDriver } from '../drivers/types';
import { AuctionScreen } from '../screens/AuctionScreen';
import { DealFiveScreen, HukumRevealScreen } from '../screens/DealScreens';
import { HukumScreen } from '../screens/HukumScreen';
import { MatchResultScreen } from '../screens/MatchResultScreen';
import { PlayScreen } from '../screens/PlayScreen';
import { GameMenuProvider } from '../screens/GameFrame';
import { RoundSummaryScreen } from '../screens/RoundSummaryScreen';
import { MOTION } from '../../shared/constants';
import { useSettings } from '../stores/settings';
import { toTableView, type TableScreen } from '../view/adapter';

interface Props {
  width: number;
  height: number;
  onHome: () => void;
  onSettings?: () => void;
}

const PEEK_MS = 2500;

export function SoloGame(props: Props) {
  const level = useSettings((s) => s.botLevel);
  const session = useSoloSession(level);
  const snap = useAnim(session);
  return <MatchTable {...props} session={session} snap={snap} />;
}

interface MatchTableProps extends Props {
  session: { driver: GameDriver; anim: AnimQueue };
  snap: AnimSnapshot;
  /** Practice hand: "Practice hand" in the ledger pill, no summary auto-advance. */
  practice?: boolean;
  /** Send Continue when the round summary times out. Online, the server advances it. */
  autoContinue?: boolean;
  /** Online: presence, timers, banners and votes on top of the adapted screen. */
  decorate?: (screen: TableScreen) => TableScreen;
  onVote?: (choice: 'wait' | 'bot') => void;
  /** Online, only the host may rematch; everyone else sees this instead. */
  rematchWaiting?: string;
  /** Leaving the round summary or match result (tutorial: the end of the hand). */
  onFinish?: () => void;
  homeLabel?: string;
  /** Drawn over the table (coach marks; online banners). A function gets the screen shown. */
  children?: React.ReactNode | ((screen: TableScreen) => React.ReactNode);
}

/** The table for a local match: LocalDriver → animation queue → adapter → screens. */
export function MatchTable({ width, height, onHome, onSettings, session, snap, practice, autoContinue = !practice, decorate, onVote, rematchWaiting, onFinish, homeLabel = 'Home · the match is saved', children }: MatchTableProps) {
  const cardSize = useSettings((s) => s.cardSize);
  const send = session.driver.send.bind(session.driver);
  const [overlay, setOverlay] = useState<'menu' | 'seen' | null>(null);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);

  const adapted = toTableView({ ...snap, width, peek });
  const screen = decorate ? decorate(adapted) : adapted;
  if (practice && 'hud' in screen.v) screen.v.hud = { ...screen.v.hud, ledger: { ...screen.v.hud.ledger, label: 'Practice hand' } };
  const size = { width, height };
  const { view } = snap;

  // Round summary auto-advances after 6 s (GDD §5).
  const summaryKey = screen.kind === 'summary' ? view.roundNo : null;
  useEffect(() => {
    if (summaryKey === null || overlay || !autoContinue) return;
    const t = window.setTimeout(() => session.driver.send({ type: 'continue' }), MOTION.summarySeconds * 1000);
    return () => window.clearTimeout(t);
  }, [summaryKey, overlay, autoContinue, session]);

  // The Last trick button toggles: a second tap goes straight back to play.
  const showPeek = () => {
    window.clearTimeout(peekTimer.current);
    if (adapted.kind === 'play' && adapted.v.peeking) return setPeek(false);
    setPeek(true);
    peekTimer.current = window.setTimeout(() => setPeek(false), PEEK_MS);
  };

  let body: React.ReactNode;
  switch (screen.kind) {
    case 'deal5': body = <DealFiveScreen v={screen.v} {...size} />; break;
    case 'reveal': body = <HukumRevealScreen v={screen.v} {...size} />; break;
    case 'auction':
      body = <AuctionScreen key={`a${view.roundNo}-${view.auction.log.length}-${screen.v.yourTurn}`} v={screen.v} {...size} cardSize={cardSize}
        onBid={(value) => send({ type: 'bid', value })} onPass={() => send({ type: 'pass' })} />;
      break;
    case 'hukum':
      body = <HukumScreen key={`h${view.roundNo}-${screen.v.yourCall}`} v={screen.v} {...size} cardSize={cardSize} onConfirm={(suit) => send({ type: 'chooseTrump', suit })} />;
      break;
    case 'play':
      body = <PlayScreen v={screen.v} {...size} cardSize={cardSize} onPlay={(card) => send({ type: 'play', card })}
        onLastTrick={showPeek} onCardsSeen={() => setOverlay('seen')} onVote={onVote} />;
      break;
    case 'summary':
      body = <RoundSummaryScreen key={`s${view.roundNo}`} v={screen.v} {...size} onReady={onFinish ?? (() => send({ type: 'continue' }))} />;
      break;
    case 'result':
      body = <MatchResultScreen v={screen.v} {...size} onHome={onFinish ?? onHome} onRematch={onFinish ?? (() => send({ type: 'rematch' }))} rematchWaiting={rematchWaiting} />;
      break;
  }

  return (
    <div style={{ position: 'relative', ...size }}>
      <GameMenuProvider value={() => setOverlay('menu')}>{body}</GameMenuProvider>
      <Feedback anim={session.anim} />
      {typeof children === 'function' ? children(screen) : children}
      {overlay === 'menu' && (
        <Overlay title="Menu" onClose={() => setOverlay(null)}>
          <button className="btn-secondary" onClick={() => setOverlay(null)}>Back to the table</button>
          {onSettings && <button className="btn-secondary" onClick={onSettings}>Settings</button>}
          <button className="btn-secondary" onClick={onHome}>{homeLabel}</button>
        </Overlay>
      )}
      {overlay === 'seen' && <CardsSeen played={view.playedCards} hukum={view.trump} onClose={() => setOverlay(null)} />}
    </div>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <section className="sheet roomy" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="sheet-head"><h2>{title}</h2></div>
        {children}
      </section>
    </div>
  );
}

/** Every card played this round, by suit (the dock's "Cards seen" button). */
function CardsSeen({ played, hukum, onClose }: { played: CardId[]; hukum: Suit | null; onClose: () => void }) {
  return (
    <Overlay title="Cards seen" onClose={onClose}>
      {DISPLAY_SUIT_ORDER.map((s) => {
        const cards = played.filter((c) => suitOf(c) === s);
        return (
          <div key={s} className="seen-row" aria-label={`${SUIT_NAME[s]}: ${cards.length} played`}>
            <SuitIcon suit={s} className={`su-${s}`} />
            <span className="mono dim">{cards.length}</span>
            <div className="rs-minis">
              {cards.map((c) => <Card key={c} card={c} size="mini" hukum={suitOf(c) === hukum} role="img" aria-label={cardLabel(c, hukum)} />)}
            </div>
          </div>
        );
      })}
      <button className="btn-secondary" onClick={onClose}>Close</button>
    </Overlay>
  );
}
