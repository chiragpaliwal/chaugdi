import { useState } from 'react';
import type { CardId } from '../../engine/types';
import { HandFan } from '../components/HandFan';
import { ContractChip, HighBid, LedgerPill, RoomMenuButton } from '../components/Hud';
import { RacePill } from '../components/RacePill';
import { Table } from '../components/Table';
import { r4AuctionSeats, r4FirstFive, r5Hand, r5Trick1, r5Trick1Race, r5Trick1Seats } from './fixtures';

// Steps 1–3 check: HUD + table + hand fan in the exact frame of the screen PNGs.
// The status line, fact chips, hint and dock are step 4; their rows are left empty here
// and masked out by e2e/visual.mjs.

export function YourTurnSandbox({ width = 390, height = 844 }: { width?: number; height?: number }) {
  const narrow = width < 375;
  const tableW = width - 24;
  const tableH = narrow ? 430 : 470;
  const [selected, setSelected] = useState<CardId | null>('AC');
  const [played, setPlayed] = useState<CardId | null>(null);
  const hand = r5Hand.filter((c) => c.card !== played);
  return (
    <main className="dev-scr" style={{ width, height }}>
      <header className="hud">
        <LedgerPill team="A" value={26} names="You & Asha" compact={narrow} />
        <ContractChip kind="contract" bid={8} hukum="S" sar={0} />
        <div style={{ flex: 1 }} />
        <RoomMenuButton />
      </header>
      <Table
        width={tableW}
        height={tableH}
        seats={r5Trick1Seats}
        trick={r5Trick1}
        style={{ margin: '2px 12px 0' }}
        centre={(g) => <RacePill variant="race" at={g.pill} race={r5Trick1Race} />}
      />
      <div style={{ height: 20, marginTop: 4, flex: 'none' }} data-step4="status" />
      <HandFan
        cards={hand}
        width={tableW}
        cardWidth={62}
        hukum="S"
        yourTurn={!played}
        selected={selected}
        onSelect={setSelected}
        onPlay={(c) => { setPlayed(c); setSelected(null); }}
        style={{ margin: '0 12px' }}
      />
    </main>
  );
}

export function AuctionSandbox() {
  return (
    <main className="dev-scr" style={{ width: 390, height: 844 }}>
      <header className="hud">
        <LedgerPill team="A" value={17} names="You & Asha" />
        <ContractChip kind="phase" round={4} phase="Auction" label="auction" />
        <div style={{ flex: 1 }} />
        <RoomMenuButton />
      </header>
      <Table
        width={366}
        height={470}
        seats={r4AuctionSeats}
        style={{ margin: '2px 12px 0' }}
        centre={(g) => (
          <>
            <HighBid at={g.C} label="High bid" value={8} team="B" text="Ben" />
            <RacePill variant="auction" at={g.pill} passes={1} line="Three passes in a row close the auction" />
          </>
        )}
      />
      <div style={{ height: 62, marginTop: 8, flex: 'none' }} data-step4="facts" />
      <HandFan cards={r4FirstFive} width={366} cardWidth={70} hukum={null} shape="deal5" height={126} style={{ margin: '4px 12px 0' }} />
    </main>
  );
}
