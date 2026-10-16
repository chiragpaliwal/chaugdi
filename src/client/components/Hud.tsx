import type { Suit, Team } from '../../engine/types';
import { SuitIcon } from './SuitIcon';
import { SUIT_NAME } from './cardText';

const MINUS = '−';

/** Signed number with a real minus sign (HANDOFF §8). */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `${MINUS}${-n}` : '0');

interface LedgerProps {
  /** The team that is ahead, or null when level. */
  team: Team | null;
  value: number;
  names: string;
  /** Under 375 px wide: swatch + value only. */
  compact?: boolean;
}

/** Always shows the leading team as "+N"; "Level" at 0. */
export function LedgerPill({ team, value, names, compact }: LedgerProps) {
  if (team === null || value === 0) {
    return <div className="ledger-pill" aria-label="Ledger: level"><span className="v">Level</span></div>;
  }
  return (
    <div className="ledger-pill" aria-label={`Ledger: ${names.replace('&', 'and')} plus ${value}`}>
      <i className={`swatch ${team}`} />
      {!compact && names}
      <span className="v">+{value}</span>
    </div>
  );
}

export function HukumChip({ suit, docking }: { suit: Suit; docking?: boolean }) {
  return (
    <span className={`hukum-chip${docking ? ' docking' : ''}`}>
      <SuitIcon suit={suit} className={`sf-${suit}`} />Hukum
    </span>
  );
}

type ContractProps =
  | { kind: 'contract'; bid: number; hukum: Suit; sar: number; docking?: boolean; tickup?: boolean }
  | { kind: 'phase'; round: number; phase: React.ReactNode; label: string }
  | { kind: 'text'; text: React.ReactNode; label: string };

export function ContractChip(props: ContractProps) {
  if (props.kind === 'phase') {
    return (
      <div className="contract-chip" aria-label={`Round ${props.round}, ${props.label}`}>
        Round <b>{props.round}</b><span className="sep" />{props.phase}
      </div>
    );
  }
  if (props.kind === 'text') {
    return <div className="contract-chip" aria-label={props.label}>{props.text}</div>;
  }
  const { bid, hukum, sar, docking, tickup } = props;
  return (
    <div className="contract-chip" aria-label={`Contract: bid ${bid}, ${SUIT_NAME[hukum]} are Hukum, ${sar} of ${bid} Sar won`}>
      Bid <b>{bid}</b>
      <HukumChip suit={hukum} docking={docking} />
      <span className="sep" />
      <b className={tickup ? 'tickup' : undefined}>{sar}/{bid}</b>Sar
    </div>
  );
}

export function RoomMenuButton({ onClick }: { onClick?: () => void }) {
  return (
    <button className="icon-btn" aria-label="Room menu" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
      </svg>
    </button>
  );
}

export interface HighBidProps {
  at: { x: number; y: number };
  label: string;
  value: number;
  team: Team;
  text: string;
  /** Your unsent number: amber. */
  pending?: boolean;
  /** Smaller numeral on the 300-tall table. */
  compact?: boolean;
  aria?: string;
}

/** Auction centre: "HIGH BID / 8 / ■ Ben" (06), "YOUR CALL / 9 / You · not sent yet" (07). */
export function HighBid({ at, label, value, team, text, pending, compact, aria }: HighBidProps) {
  return (
    <div className={`high-bid${compact ? ' compact' : ''}`} style={{ left: at.x, top: at.y }} aria-live="polite" aria-label={aria ?? `${label} ${value}, ${text}`}>
      <span className="k-label">{label}</span>
      <span className={`n${pending ? ' pending' : ''}`}>{value}</span>
      <span className="w"><i className={`swatch ${team}`} />{text}</span>
    </div>
  );
}
