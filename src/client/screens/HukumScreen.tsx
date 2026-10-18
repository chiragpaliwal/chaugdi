import { useState } from 'react';
import { sortHand } from '../../engine/cards';
import type { CardId, Suit } from '../../engine/types';
import { ChatButton, DockStatus } from '../components/GameParts';
import { HandFan } from '../components/HandFan';
import { SuitPicker } from '../components/SuitPicker';
import { Table } from '../components/Table';
import { HukumPickDisc } from '../components/TableCentre';
import { handWidthFor, type CardSizeSetting } from '../table/geometry';
import type { SeatView } from '../view/types';
import { GameFrame, TABLE_MARGIN, fitTable, SHEET_TABLE_MIN, PILL_TABLE_MIN, type HudView } from './GameFrame';

export interface HukumPickView {
  hud: HudView;
  seats: SeatView[];
  bid: number;
  hand: CardId[];
  /** True for the contract holder; everyone else waits (no design yet: see note). */
  yourCall: boolean;
  callerName: string;
}

interface Props {
  v: HukumPickView;
  width?: number;
  height?: number;
  cardSize?: CardSizeSetting;
  initialSuit?: Suit;
  onConfirm?: (s: Suit) => void;
}

/** Screen 08: you choose Hukum. The hand re-sorts Hukum-first and lifts as you pick. */
export function HukumScreen({ v, width = 390, height = 844, cardSize = 'M', initialSuit = 'S', onConfirm }: Props) {
  const [suit, setSuit] = useState<Suit>(initialSuit);
  const tableW = width - 24;

  if (!v.yourCall) {
    // Not in the designs: the waiting players keep the 470 table with the bidder's timer.
    const hand = sortHand(v.hand, null).map((card) => ({ card }));
    return (
      <GameFrame width={width} height={height} hud={v.hud}>
        <Table width={tableW} height={fitTable(470, height, PILL_TABLE_MIN)} seats={v.seats} style={TABLE_MARGIN} />
        <HandFan cards={hand} width={tableW} cardWidth={handWidthFor(cardSize, width, hand.length)} hukum={null} shape="deal5" height={126} style={{ margin: '82px 12px 0' }} />
        <div className="dock"><ChatButton /><DockStatus text={`${v.callerName} is choosing Hukum`} /></div>
      </GameFrame>
    );
  }

  const hand = sortHand(v.hand, suit).map((card) => ({ card }));
  return (
    <GameFrame width={width} height={height} hud={v.hud}>
      <Table width={tableW} height={fitTable(300, height, SHEET_TABLE_MIN)} seats={v.seats} style={TABLE_MARGIN} centre={(g) => <HukumPickDisc at={g.sheetCentre} suit={suit} />} />
      <HandFan cards={hand} width={tableW} cardWidth={handWidthFor(cardSize, width, hand.length, true)} hukum={suit} previewHukum shape="deal5" top={14} height={112} style={{ margin: '0 12px' }} />
      <SuitPicker hand={v.hand} bid={v.bid} selected={suit} onPick={setSuit} onConfirm={(s) => onConfirm?.(s)} />
    </GameFrame>
  );
}
