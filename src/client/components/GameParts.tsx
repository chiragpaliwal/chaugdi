import { useState } from 'react';
import type { Suit, Team } from '../../engine/types';
import { useFeatures } from '../features';
import type { Fact } from '../table/facts';
import type { StatusParts } from '../table/hints';
import { SuitIcon } from './SuitIcon';

export function StatusLine({ status, style }: { status: StatusParts; style?: React.CSSProperties }) {
  return (
    <div className="status-line" style={style}>
      <b>{status.bold}</b>
      <span className="dim">{status.text}</span>
      {status.suit && <SuitIcon suit={status.suit} className={`su-${status.suit}`} />}
      {status.tail && <span className="dim">· {status.tail}</span>}
    </div>
  );
}

export function HintLine({ text, warn }: { text: string; warn?: boolean }) {
  return <p className={`hint${warn ? ' warn' : ''}`} aria-live="polite">{text}</p>;
}

export function StakeLine({ suit, text }: { suit?: Suit; text: string }) {
  return (
    <div className="stake" aria-live="polite">
      {suit && <SuitIcon suit={suit} className={`su-${suit}`} />}
      <span>{text}</span>
    </div>
  );
}

/** Newest chat line on the table. Only with the chat feature. */
export function ChatLane({ name, text }: { name: string; text: string }) {
  const { chat } = useFeatures();
  if (!chat) return null;
  return <div className="lane" aria-live="polite"><b>{name}</b><span>{text}</span><span className="now">now</span></div>;
}

export function FactChips({ facts, pad, style, label = 'Facts about your hand' }: { facts: Fact[]; pad?: boolean; style?: React.CSSProperties; label?: string }) {
  return (
    <div className={`facts${pad ? ' pad' : ''}`} style={style} aria-label={label}>
      {facts.map((f, i) => (
        <span className="fact" key={i}>
          {f.map((p, j) =>
            p.kind === 'suit' ? <SuitIcon key={j} suit={p.suit} className={`su-${p.suit}`} />
              : p.kind === 'num' ? <b key={j}>{p.value}</b>
                : <span key={j}>{p.value}</span>)}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- dock

export function ChatButton({ unread = 0, onClick }: { unread?: number; onClick?: () => void }) {
  const { chat } = useFeatures();
  if (!chat) return null;
  return (
    <button className="icon-btn sq" aria-label={unread ? `Chat, ${unread} unread` : 'Chat'} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M4 5.5h16v11H10l-4.5 3.5v-3.5H4z" /></svg>
      {unread > 0 && <span className="unread">{unread}</span>}
    </button>
  );
}

export function CardsSeenButton({ onClick }: { onClick?: () => void }) {
  return (
    <button className="icon-btn sq" aria-label="Cards seen this round" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
      </svg>
    </button>
  );
}

const REACTIONS: [string, string][] = [['😄', 'laugh'], ['😮', 'shocked'], ['👏', 'clap'], ['🔥', 'fire'], ['😬', 'grimace']];

/** Five reactions while waiting. Part of the chat set. */
export function Reactions({ onReact }: { onReact?: (emoji: string) => void }) {
  const { chat } = useFeatures();
  if (!chat) return null;
  return <>{REACTIONS.map(([e, n]) => <button key={n} className="react" aria-label={`React: ${n}`} onClick={() => onReact?.(e)}>{e}</button>)}</>;
}

/** Grey status in the dock when there is nothing to do. */
export function DockStatus({ text }: { text: string }) {
  return <div className="cta status" aria-live="polite">{text}</div>;
}

export function LastTrickButton({ onClick }: { onClick?: () => void }) {
  return (
    <button className="last-trick" aria-label="Show the last trick" onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>
      Last trick
    </button>
  );
}

export interface BannerProps {
  text: string;
  countdown?: string;
  /** A spinner while something is in progress (reconnecting); off for a plain notice. */
  spin?: boolean;
  /** One action at the end of the line (I'm back). */
  action?: { label: string; onClick: () => void };
}

/** Your own connection problem, under the HUD (13). */
export function Banner({ text, countdown, spin = true, action }: BannerProps) {
  return (
    <div className="banner" role="status" aria-live="assertive">
      {spin && <span className="sp" aria-hidden="true" />}{text}{countdown && <span className="r">{countdown}</span>}
      {action && <button className="act" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

export function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4M9.5 13.5h.01M14.5 13.5h.01" />
    </svg>
  );
}

/** "Ben left. A bot is playing Ben’s hand…" (13). Dismissible. */
export function Toast({ team, title, body, onDismiss }: { team: Team; title: string; body: string; onDismiss?: () => void }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="toast" role="status">
      <span className={`bi ${team}`}><BotIcon /></span>
      <span><b>{title}</b> {body}</span>
      <button className="x" aria-label="Dismiss" onClick={() => { setOpen(false); onDismiss?.(); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}
