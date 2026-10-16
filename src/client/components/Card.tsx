import { forwardRef } from 'react';
import { rankOf, suitOf, type CardId } from '../../engine/types';
import { SuitIcon } from './SuitIcon';
import { rankLabel } from './cardText';

export type CardSize = 'mini' | 'trick' | 'hand' | 'full';
export type CardState = 'default' | 'legal' | 'selected' | 'dimmed' | 'played' | 'winning' | 'cut' | 'slot' | 'thinking';

interface BaseProps {
  /** Omit for an empty slot (state 'slot' or 'thinking'). */
  card?: CardId;
  size: CardSize;
  /** Hand card width: 56 (S), 62 (M) or 70 (L). */
  handWidth?: 56 | 62 | 70;
  state?: CardState;
  /** Shows the Hukum notch. */
  hukum?: boolean;
  /** Half-strength slot while your turn is held (screen 13). */
  held?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

type DivProps = BaseProps & { as?: 'div' } & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;
type ButtonProps = BaseProps & { as: 'button' } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

const STATE_CLASS: Partial<Record<CardState, string>> = {
  selected: 'is-selected',
  dimmed: 'is-dimmed',
  winning: 'is-winning',
  cut: 'is-cut',
  slot: 'is-slot',
  thinking: 'is-thinking',
};

export function cardClassName(size: CardSize, state: CardState, handWidth: number, card?: CardId, held?: boolean) {
  return [
    'card',
    size,
    size === 'hand' ? `hand-${handWidth}` : '',
    card ? `sf-${suitOf(card)}` : '',
    STATE_CLASS[state] ?? '',
    held ? 'is-held' : '',
  ].filter(Boolean).join(' ');
}

/**
 * Card face. Index face for mini/trick/hand (HANDOFF §4), full face with pips and
 * court tablets at 76 px for the deck preview.
 */
export const Card = forwardRef<HTMLElement, DivProps | ButtonProps>(function Card(props, ref) {
  const { card, size, handWidth = 62, state = 'default', hukum = false, held, className, children, as, ...rest } = props as BaseProps & { as?: 'div' | 'button' } & Record<string, unknown>;
  const cls = [cardClassName(size, state, handWidth, card, held), className].filter(Boolean).join(' ');
  const empty = !card || state === 'slot' || state === 'thinking';
  const body = empty ? null : size === 'full' ? <FullFace card={card} /> : <IndexFace card={card} hukum={hukum} />;
  if (as === 'button') {
    return (
      <button ref={ref as React.Ref<HTMLButtonElement>} type="button" className={cls} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
        {body}{children}
      </button>
    );
  }
  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className={cls} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
      {body}{children}
    </div>
  );
});

function IndexFace({ card, hukum }: { card: CardId; hukum: boolean }) {
  const s = suitOf(card);
  return (
    <>
      <span className="ix">
        <span className="rk">{rankLabel(card)}</span>
        <SuitIcon suit={s} />
      </span>
      <SuitIcon suit={s} className="bp" />
      {hukum && <i className="tn" aria-hidden="true" />}
    </>
  );
}

// Pip grid from the Cards board: three columns on a 19 × 68 grid between the indices.
const L = 0, M = 0.5, R = 1, T3 = 1 / 3, T6 = 1 / 6;
const PIPS: Record<string, [number, number][]> = {
  '2': [[M, 0], [M, 1]],
  '3': [[M, 0], [M, 0.5], [M, 1]],
  '4': [[L, 0], [R, 0], [L, 1], [R, 1]],
  '5': [[L, 0], [R, 0], [M, 0.5], [L, 1], [R, 1]],
  '6': [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  '7': [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  '8': [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [M, 0.75], [L, 1], [R, 1]],
  '9': [[L, 0], [R, 0], [L, T3], [R, T3], [M, 0.5], [L, 2 * T3], [R, 2 * T3], [L, 1], [R, 1]],
  '10': [[L, 0], [R, 0], [M, T6], [L, T3], [R, T3], [L, 2 * T3], [R, 2 * T3], [M, 5 * T6], [L, 1], [R, 1]],
};

function FullFace({ card }: { card: CardId }) {
  const s = suitOf(card);
  const r = rankOf(card);
  const label = rankLabel(card);
  const court = r === 'J' || r === 'Q' || r === 'K';
  return (
    <>
      <span className="fix"><span className="rk">{label}</span><SuitIcon suit={s} /></span>
      <span className="fix bt" aria-hidden="true"><span className="rk">{label}</span><SuitIcon suit={s} /></span>
      {(PIPS[label] ?? []).map(([px, py], i) => (
        <SuitIcon key={i} suit={s} className={`pp${py > 0.5 ? ' dn' : ''}`} style={{ left: Math.round(28.5 + px * 19 - 6), top: Math.round(19 + py * 68 - 6) }} />
      ))}
      {r === 'A' && (<><span className="ring" aria-hidden="true" /><SuitIcon suit={s} className="ace" /></>)}
      {court && (
        <span className="ct" aria-hidden="true">
          <span className="ctin"><span className="L">{label}</span><SuitIcon suit={s} /></span>
        </span>
      )}
    </>
  );
}
