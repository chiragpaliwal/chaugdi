// Solo match page (GDD §4.1, milestone 3): LocalDriver → animation queue → adapter → screens.

import { useEffect, useRef, useState } from 'react';
import { suitOf, type CardId, type Suit } from '../../engine/types';
import { DISPLAY_SUIT_ORDER } from '../../engine/cards';
import { Card } from '../components/Card';
import { cardLabel, SUIT_NAME } from '../components/cardText';
import { SuitIcon } from '../components/SuitIcon';
import { useAnim, useSoloSession } from '../drivers/session';
import { AuctionScreen } from '../screens/AuctionScreen';
import { DealFiveScreen, HukumRevealScreen } from '../screens/DealScreens';
import { HukumScreen } from '../screens/HukumScreen';
import { MatchResultScreen } from '../screens/MatchResultScreen';
import { PlayScreen } from '../screens/PlayScreen';
import { GameMenuProvider } from '../screens/GameFrame';
import { RoundSummaryScreen } from '../screens/RoundSummaryScreen';
import { MOTION } from '../../shared/constants';
import { useSettings } from '../stores/settings';
import { toTableView } from '../view/adapter';

interface Props {
  width: number;
  height: number;
  onHome: () => void;
  onSettings: () => void;
}

const PEEK_MS = 2500;

export function SoloGame({ width, height, onHome, onSettings }: Props) {
  const level = useSettings((s) => s.botLevel);
  const cardSize = useSettings((s) => s.cardSize);
  const session = useSoloSession(level);
  const snap = useAnim(session);
  const send = session.driver.send.bind(session.driver);
  const [overlay, setOverlay] = useState<'menu' | 'seen' | null>(null);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);

  const screen = toTableView({ ...snap, width, peek });
  const size = { width, height };
  const { view } = snap;

  // Round summary auto-advances after 6 s (GDD §5).
  const summaryKey = screen.kind === 'summary' ? view.roundNo : null;
  useEffect(() => {
    if (summaryKey === null || overlay) return;
    const t = window.setTimeout(() => session.driver.send({ type: 'continue' }), MOTION.summarySeconds * 1000);
    return () => window.clearTimeout(t);
  }, [summaryKey, overlay, session]);

  const showPeek = () => {
    setPeek(true);
    window.clearTimeout(peekTimer.current);
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
        onLastTrick={showPeek} onCardsSeen={() => setOverlay('seen')} />;
      break;
    case 'summary':
      body = <RoundSummaryScreen key={`s${view.roundNo}`} v={screen.v} {...size} onReady={() => send({ type: 'continue' })} />;
      break;
    case 'result':
      body = <MatchResultScreen v={screen.v} {...size} onHome={onHome} onRematch={() => send({ type: 'rematch' })} />;
      break;
  }

  return (
    <div style={{ position: 'relative', ...size }}>
      <GameMenuProvider value={() => setOverlay('menu')}>{body}</GameMenuProvider>
      {overlay === 'menu' && (
        <Overlay title="Menu" onClose={() => setOverlay(null)}>
          <button className="btn-secondary" onClick={() => setOverlay(null)}>Back to the table</button>
          <button className="btn-secondary" onClick={onSettings}>Settings</button>
          <button className="btn-secondary" onClick={onHome}>Home · the match is saved</button>
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
