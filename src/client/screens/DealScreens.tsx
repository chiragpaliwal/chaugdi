import type { CardId, Suit, Team } from '../../engine/types';
import { CardBack } from '../components/CardBack';
import { ChatButton, DockStatus, StatusLine } from '../components/GameParts';
import { HandFan } from '../components/HandFan';
import { RacePill } from '../components/RacePill';
import { Table } from '../components/Table';
import { DealTable, DockPath, HukumReveal, Packet, type FlyingBack } from '../components/TableCentre';
import { FAN_STYLES, fanLayout, type ViewSeat } from '../table/geometry';
import type { SeatView } from '../view/types';
import { GameFrame, TABLE_MARGIN, fitTable, PILL_TABLE_MIN, type HudView } from './GameFrame';

interface DealPill { title: string; line: string; steps: number; done: number; nowFraction: number; label?: string }

export interface DealFiveView {
  hud: HudView;
  seats: SeatView[];
  dealer: ViewSeat;
  counts: Record<ViewSeat, number>;
  deckLeft: number;
  flying?: FlyingBack[];
  pill: DealPill;
  dock: string;
}

/** Screen 05: the 5-card deal, singles in turn order. Your cards land face down. */
export function DealFiveScreen({ v, width = 390, height = 844 }: { v: DealFiveView; width?: number; height?: number }) {
  const tableW = width - 24;
  const dealerName = v.seats.find((s) => s.seat === v.dealer)?.name ?? '';
  const slots = fanLayout(5, tableW, 62, { ...FAN_STYLES.deal5, top: 12 });
  const mine = v.counts[0];
  return (
    <GameFrame width={width} height={height} hud={v.hud}>
      <Table width={tableW} height={fitTable(470, height, PILL_TABLE_MIN)} seats={v.seats} style={TABLE_MARGIN} centre={(g) => (
        <>
          <DealTable g={g} dealer={v.dealer} dealerName={dealerName} counts={v.counts} deckLeft={v.deckLeft} flying={v.flying} />
          <RacePill variant="dealing" at={g.pill} compact={g.pillCompact} {...v.pill} />
        </>
      )} />
      <StatusLine status={{ bold: 'Your 5', text: 'flip face-up once all land' }} style={{ marginTop: 4 }} />
      <section className="deal-slots" style={{ width: tableW, height: 120, margin: '0 12px' }} aria-label={`Your hand, ${mine} of 5 dealt`}>
        {slots.map((s, i) => i < mine
          ? <CardBack key={i} size="hand" style={{ left: s.x, top: s.y, transform: `rotate(${s.rotate}deg)` }} />
          : <div key={i} className="slot-ph" style={{ left: s.x, top: s.y, transform: `rotate(${s.rotate}deg)` }} />)}
      </section>
      <div className="dock"><ChatButton /><DockStatus text={v.dock} /></div>
    </GameFrame>
  );
}

export interface HukumRevealView {
  hud: HudView;
  seats: SeatView[];
  hukum: Suit;
  caller: { name: string; team: Team };
  /** Ghost discs on the path to the HUD chip while it docks. */
  dockPath?: { x: number; y: number; size?: number; opacity: number }[];
  packet?: { x: number; y: number; rotate: number; label: string };
  pill: DealPill;
  hand: CardId[];
  faceDown: number;
  handNote: string;
  dock: string;
}

/** Screen 09: the Hukum reveal docking into the HUD while Deal 8 starts in packets of 4. */
export function HukumRevealScreen({ v, width = 390, height = 844 }: { v: HukumRevealView; width?: number; height?: number }) {
  const tableW = width - 24;
  return (
    <GameFrame width={width} height={height} hud={v.hud}>
      <Table width={tableW} height={fitTable(470, height, PILL_TABLE_MIN)} seats={v.seats} style={TABLE_MARGIN} centre={(g) => (
        <>
          {v.dockPath && <DockPath suit={v.hukum} discs={v.dockPath} />}
          <HukumReveal at={{ x: g.C.x, y: g.C.y + 9 }} suit={v.hukum} caller={v.caller.name} team={v.caller.team} />
          {v.packet && <Packet {...v.packet} />}
          <RacePill variant="dealing" at={g.pill} compact={g.pillCompact} {...v.pill} />
        </>
      )} />
      <StatusLine status={{ bold: 'Your hand', text: v.handNote }} style={{ marginTop: 4 }} />
      <HandFan cards={v.hand.map((card) => ({ card }))} faceDown={v.faceDown} width={tableW} cardWidth={62} hukum={v.hukum} shape="deal8" height={160} style={{ margin: '0 12px' }} />
      <div className="dock"><ChatButton /><DockStatus text={v.dock} /></div>
    </GameFrame>
  );
}
