import { useState } from 'react';
import type { CardId, Team } from '../../engine/types';
import { BidSheet } from '../components/BidSheet';
import { ChatButton, DockStatus, FactChips } from '../components/GameParts';
import { HandFan } from '../components/HandFan';
import { HighBid } from '../components/Hud';
import { RacePill } from '../components/RacePill';
import { Table } from '../components/Table';
import { handFacts } from '../table/facts';
import { handWidthFor, type CardSizeSetting } from '../table/geometry';
import type { SeatView } from '../view/types';
import { GameFrame, TABLE_MARGIN, type HudView } from './GameFrame';

export interface AuctionView {
  hud: HudView;
  seats: SeatView[];
  high: { bid: number; name: string; team: Team } | null;
  /** Passes since the high bid, or since the start when nobody has bid. */
  passes: number;
  forcedName: string;
  hand: CardId[];
  yourTurn: boolean;
  /** Dock status while someone else calls. */
  dock: string;
  /** Percent of your turn left (timer ring) while the sheet is open. */
  turnLeft?: number;
}

interface Props {
  v: AuctionView;
  width?: number;
  height?: number;
  cardSize?: CardSizeSetting;
  onBid?: (n: number) => void;
  onPass?: () => void;
  /** Initial sheet state, for references. */
  initial?: { selected?: number | null; passed?: boolean };
}

/** Screens 06 (someone else calling) and 07 / 07b (your bid sheet). */
export function AuctionScreen({ v, width = 390, height = 844, cardSize = 'M', onBid, onPass, initial }: Props) {
  const [selected, setSelected] = useState<number | null>(initial?.selected ?? null);
  const [passed, setPassed] = useState(initial?.passed ?? false);
  const tableW = width - 24;
  const hand = v.hand.map((card) => ({ card }));

  if (!v.yourTurn) {
    const w = handWidthFor(cardSize, width, hand.length);
    return (
      <GameFrame width={width} height={height} hud={v.hud}>
        <Table width={tableW} height={470} seats={v.seats} style={TABLE_MARGIN} centre={(g) => (
          <>
            {v.high && <HighBid at={g.C} label="High bid" value={v.high.bid} team={v.high.team} text={v.high.name} />}
            <RacePill variant="auction" at={g.pill} passes={v.passes} of={v.high ? 3 : 4}
              line={v.high ? 'Three passes in a row close the auction' : `If everyone passes, ${v.forcedName} must play 7`} />
          </>
        )} />
        <FactChips facts={handFacts(v.hand, { moreCards: 8 })} pad style={{ marginTop: 8 }} />
        <HandFan cards={hand} width={tableW} cardWidth={w} hukum={null} shape="deal5" height={126} style={{ margin: '4px 12px 0' }} />
        <div className="dock"><ChatButton /><DockStatus text={v.dock} /></div>
      </GameFrame>
    );
  }

  // Your call: live preview of the unsent number on your seat and in the centre.
  const seats = v.seats.map((s) => {
    if (!s.isMe) return s;
    if (passed) return { ...s, turnProgress: null, badge: undefined, tag: { text: 'pass', tone: 'mute' as const } };
    return { ...s, turnProgress: v.turnLeft ?? 64, badge: selected !== null ? { kind: 'pending' as const, value: selected } : undefined, tag: { text: 'choosing', tone: 'hot' as const } };
  });
  const closes = passed && v.high && v.passes >= 2;
  const centre = closes && v.high
    ? { label: 'Auction closed', value: v.high.bid, team: v.high.team, text: `${v.high.name} wins at ${v.high.bid}`, pending: false }
    : selected !== null && !passed
      ? { label: 'Your call', value: selected, team: 'A' as Team, text: 'You · not sent yet', pending: true }
      : v.high ? { label: 'High bid', value: v.high.bid, team: v.high.team, text: v.high.name, pending: false } : null;

  return (
    <GameFrame width={width} height={height} hud={v.hud}>
      <Table width={tableW} height={300} seats={seats} style={TABLE_MARGIN} centre={(g) => centre && <HighBid at={g.sheetCentre} compact {...centre} />} />
      <HandFan cards={hand} width={tableW} cardWidth={handWidthFor(cardSize, width, hand.length, true)} hukum={null} shape="deal5" top={14} height={112} style={{ margin: '0 12px' }} />
      <BidSheet
        high={v.high}
        passes={v.passes}
        forcedName={v.forcedName}
        facts={handFacts(v.hand)}
        selected={selected}
        passed={passed}
        onSelect={setSelected}
        onBid={(n) => onBid?.(n)}
        onPass={() => { setPassed(true); setSelected(null); onPass?.(); }}
      />
    </GameFrame>
  );
}
