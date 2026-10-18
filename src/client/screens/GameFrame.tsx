import { createContext, useContext } from 'react';
import { ContractChip, LedgerPill, RoomMenuButton } from '../components/Hud';

/** The HUD menu handler for every in-game screen, set by the page that owns the match. */
const GameMenuContext = createContext<(() => void) | undefined>(undefined);
export const GameMenuProvider = GameMenuContext.Provider;

export interface HudView {
  ledger: React.ComponentProps<typeof LedgerPill>;
  contract: React.ComponentProps<typeof ContractChip>;
}

interface Props {
  width: number;
  height: number;
  hud: HudView;
  onMenu?: () => void;
  children: React.ReactNode;
  label?: string;
}

/** Phone frame with the HUD (HANDOFF §3: 52 tall, LedgerPill, ContractChip, room menu). */
export function GameFrame({ width, height, hud, onMenu, children, label }: Props) {
  const menu = useContext(GameMenuContext);
  return (
    <main className={`game-scr${width < 375 ? ' narrow' : ''}`} style={{ width, minHeight: height }} aria-label={label}>
      <header className="hud">
        <LedgerPill {...hud.ledger} compact={hud.ledger.compact ?? width < 375} />
        <ContractChip {...hud.contract} />
        <div style={{ flex: 1 }} />
        <RoomMenuButton onClick={onMenu ?? menu} />
      </header>
      {children}
    </main>
  );
}

export const TABLE_MARGIN: React.CSSProperties = { margin: '2px 12px 0' };

/** Screen heights the boards are drawn for (HANDOFF §3: 390 × 844). */
export const DESIGN_H = 844;
/** Shortest table with a RacePill: its chips still fit between the trick cross and your seat. */
export const PILL_TABLE_MIN = 356;
/** Shortest table above a bid or Hukum sheet that keeps the four seats apart. */
export const SHEET_TABLE_MIN = 260;

/** Table height for a shorter screen: the table gives up the difference so the sheet or dock below stays on screen. */
export function fitTable(base: number, height: number, min: number): number {
  return Math.max(min, Math.min(base, base - (DESIGN_H - height)));
}
