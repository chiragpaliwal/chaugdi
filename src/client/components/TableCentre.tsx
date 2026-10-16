import type { Suit, Team } from '../../engine/types';
import type { Point, TableGeometry, ViewSeat } from '../table/geometry';
import { CardBack } from './CardBack';
import { SUIT_NAME } from './cardText';
import { SuitIcon } from './SuitIcon';

const SUIT_TITLE: Record<Suit, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

/** Centre while the bidder picks: the suit on an ivory disc with an amber ring (08). */
export function HukumPickDisc({ at, suit }: { at: Point; suit: Suit }) {
  return (
    <div className="hukum-pick" style={{ left: at.x, top: at.y }} aria-live="polite">
      <span className="disc"><SuitIcon suit={suit} className={`sf-${suit}`} /></span>
      <span className="w">{SUIT_TITLE[suit]} · not called yet</span>
    </div>
  );
}

/** "Spades are Hukum" (09). Announced assertively (HANDOFF §9). */
export function HukumReveal({ at, suit, caller, team }: { at: Point; suit: Suit; caller: string; team: Team }) {
  return (
    <div className="hukum-reveal" style={{ left: at.x, top: at.y }} role="status" aria-live="assertive" aria-label={`${caller} called ${SUIT_NAME[suit]} as Hukum`}>
      <span className="disc"><SuitIcon suit={suit} className={`sf-${suit}`} /></span>
      <span className="who"><i className={`swatch ${team}`} />{caller} called</span>
      <span className="what">{SUIT_TITLE[suit]} are Hukum</span>
    </div>
  );
}

/** Ghost discs on the way to the ContractChip while the reveal docks. */
export function DockPath({ suit, discs }: { suit: Suit; discs: { x: number; y: number; size?: number; opacity: number }[] }) {
  return (
    <>
      {discs.map((d, i) => (
        <span key={i} className="dock-ghost" aria-hidden="true"
          style={{ left: d.x, top: d.y, opacity: d.opacity, ...(d.size ? { width: d.size, height: d.size } : null) }}>
          <SuitIcon suit={suit} className={`sf-${suit}`} />
        </span>
      ))}
    </>
  );
}

// Piles of dealt backs beside each seat's trick slot (05). Offsets follow the Dealing board.
const PILE: Record<Exclude<ViewSeat, 0>, [number, number, number][]> = {
  1: [[-4, 2, -8], [0, -1, -2]],
  2: [[-2, -9, 4], [1, -12, -3]],
  3: [[4, 2, 8], [0, -1, 2]],
};

export interface FlyingBack { x: number; y: number; rotate: number; opacity?: number; label?: string }

interface DealProps {
  g: TableGeometry;
  dealer: ViewSeat;
  dealerName: string;
  /** Cards dealt so far per seat. */
  counts: Record<ViewSeat, number>;
  deckLeft: number;
  /** Cards in the air, frozen for references; step 6 animates them. */
  flying?: FlyingBack[];
}

export function DealTable({ g, dealer, dealerName, counts, deckLeft, flying = [] }: DealProps) {
  const deck = g.slot[dealer];
  return (
    <>
      {([1, 2, 3] as const).filter((s) => s !== dealer && counts[s] > 0).map((s) =>
        PILE[s].slice(0, Math.min(2, counts[s])).map(([dx, dy, r], i) => (
          <CardBack key={`${s}-${i}`} size="trick" className="dealt" style={{ left: g.slot[s].x + dx, top: g.slot[s].y + dy, transform: `rotate(${r}deg)` }} />
        )),
      )}
      {[0, 1, 2].map((i) => (
        <CardBack key={`d${i}`} size="trick" className="dealt" label={i === 2 ? `${dealerName}'s deck, ${deckLeft} cards left` : undefined}
          style={{ left: deck.x + i * 3, top: deck.y + 4 - i * 3, transform: 'rotate(8deg)' }} />
      ))}
      <span className="deck-count" style={{ left: deck.x + 6 + 23, top: deck.y - 2 + 64 + 11 }}>{deckLeft}</span>
      {flying.map((f, i) => (
        <CardBack key={`f${i}`} size="trick" className={`dealt${f.opacity === undefined ? ' flying' : ''}`} label={f.label}
          style={{ left: f.x, top: f.y, transform: `rotate(${f.rotate}deg)`, opacity: f.opacity }} />
      ))}
    </>
  );
}

/** A 4-card packet in the air during Deal 8, tagged ×4 (09). */
export function Packet({ x, y, rotate, label }: { x: number; y: number; rotate: number; label: string }) {
  return (
    <div className="packet" style={{ left: x, top: y, transform: `rotate(${rotate}deg)` }} aria-label={label}>
      <span className="x4">×4</span>
      {[0, 1, 2, 3].map((i) => <CardBack key={i} size="trick" style={{ left: i * 2, top: -i * 2 }} />)}
    </div>
  );
}
