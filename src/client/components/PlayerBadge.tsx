import { useFeatures } from '../features';
import type { SeatBadge, SeatView } from '../view/types';

interface Props {
  seat: SeatView;
  style?: React.CSSProperties;
}

function badgeText(b: SeatBadge) {
  return b.kind === 'wait' ? '…' : String(b.value);
}

function badgeLabel(b: SeatBadge, name: string) {
  switch (b.kind) {
    case 'call': return `${name} called ${b.value}`;
    case 'wait': return `${name} is deciding`;
    case 'sar': return `${b.value} Sar`;
    case 'pending': return `${b.value}, not sent yet`;
  }
}

/** Seat column, 84 wide (HANDOFF §4). Positioned by the table. */
export function PlayerBadge({ seat: s, style }: Props) {
  const { chat } = useFeatures();
  const cls = ['seat', s.isMe ? 'me' : '', s.connected ? '' : 'off', s.turnProgress !== null ? 'turn' : ''].filter(Boolean).join(' ');
  const name = s.isBot ? `${s.name} · bot` : s.name;
  return (
    <div className={cls} style={style}>
      <div className={`av ${s.team}`}>
        {s.turnProgress !== null && (
          <span
            className="tmr"
            style={{ background: `conic-gradient(var(--amber) ${s.turnProgress}%, var(--line) 0)` }}
            role="img"
            aria-label={s.isMe ? 'Your turn' : `${s.name}'s turn`}
          />
        )}
        {s.wonTrick && <><span className="won" aria-hidden="true" /><span className="plus" aria-label="Won the trick">+1</span></>}
        {s.isBot ? <BotIcon /> : s.name.charAt(0)}
        {s.badge && (
          <span className={`nb ${s.badge.kind}`} aria-label={badgeLabel(s.badge, s.name)}>{badgeText(s.badge)}</span>
        )}
        {s.isDealer && <span className="dl" aria-label="Dealer">D</span>}
        {chat && s.hasMessage && <span className="mk" aria-label="Sent a message">···</span>}
      </div>
      <span className="nm">{name}</span>
      <div className="sr">
        {s.handCount !== null && (
          <span className="hn" aria-label={`${s.handCount} cards in hand`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="6" width="11" height="15" rx="2" fill="var(--hand-icon-back)" />
              <rect x="9" y="3" width="11" height="15" rx="2" fill="var(--hand-icon-front)" />
            </svg>
            {s.handCount}
          </span>
        )}
        {s.bidderBid !== null && <span className="bdr">Bid {s.bidderBid}</span>}
        {s.tag && <span className={`stx ${s.tag.tone ?? ''}`}>{s.tag.text}</span>}
      </div>
    </div>
  );
}

function BotIcon() {
  return (
    <svg className="bot" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" role="img" aria-label="Bot">
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 4v4M9.5 13.5h.01M14.5 13.5h.01" />
    </svg>
  );
}
