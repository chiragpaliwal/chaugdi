import { ContractChip, LedgerPill, RoomMenuButton } from '../components/Hud';

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
  return (
    <main className={`game-scr${width < 375 ? ' narrow' : ''}`} style={{ width, height }} aria-label={label}>
      <header className="hud">
        <LedgerPill {...hud.ledger} compact={hud.ledger.compact ?? width < 375} />
        <ContractChip {...hud.contract} />
        <div style={{ flex: 1 }} />
        <RoomMenuButton onClick={onMenu} />
      </header>
      {children}
    </main>
  );
}

export const TABLE_MARGIN: React.CSSProperties = { margin: '2px 12px 0' };
