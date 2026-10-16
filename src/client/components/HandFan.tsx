import { useMemo } from 'react';
import type { CardId, Suit } from '../../engine/types';
import { FAN_STYLES, fanHeight, fanLayout, LIFT_LEGAL, LIFT_SELECTED, type FanStyleName } from '../table/geometry';
import { Card } from './Card';
import { CardBack } from './CardBack';
import { cardLabel } from './cardText';

export interface HandCard {
  card: CardId;
  /** Only read when `yourTurn` is true. */
  legal?: boolean;
}

interface Props {
  cards: HandCard[];
  /** Width the fan may use (container width). */
  width: number;
  cardWidth: 56 | 62 | 70;
  hukum: Suit | null;
  /** Legal cards lift 5 px and illegal ones dim only on your turn. */
  yourTurn?: boolean;
  selected?: CardId | null;
  onSelect?: (card: CardId) => void;
  onPlay?: (card: CardId) => void;
  onIllegal?: (card: CardId) => void;
  /** Fan shape: 'play' (HANDOFF §3, default), 'deal5' or 'idle'. */
  shape?: FanStyleName;
  /** Row-0 baseline override in px. */
  top?: number;
  /** Face-down cards still landing, laid out after the face-up ones (09). */
  faceDown?: number;
  /** Hukum preview: lift cards of this suit by 6 px (08). */
  previewHukum?: boolean;
  /** Height override; defaults to 112 for one row, 160 for two. */
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Tap to select, tap again to play (HANDOFF §6). No drag. Illegal cards stay focusable
 * with aria-disabled so the tap can explain why (HANDOFF §9).
 */
export function HandFan({ cards, width, cardWidth, hukum, yourTurn = false, selected = null, onSelect, onPlay, onIllegal, shape = 'play', top, faceDown = 0, previewHukum = false, height, className, style }: Props) {
  const layout = useMemo(() => {
    const base = FAN_STYLES[shape];
    return fanLayout(cards.length + faceDown, width, cardWidth, top === undefined ? base : { ...base, top });
  }, [cards.length, faceDown, width, cardWidth, shape, top]);
  const total = cards.length + faceDown;
  const rows = total > 7 ? 'two rows' : 'one row';

  const tap = (c: HandCard) => {
    if (!yourTurn) return;
    if (c.legal === false) return onIllegal?.(c.card);
    if (selected === c.card) onPlay?.(c.card);
    else onSelect?.(c.card);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!yourTurn || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const legal = cards.filter((c) => c.legal !== false);
    if (!legal.length) return;
    e.preventDefault();
    const at = legal.findIndex((c) => c.card === selected);
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const next = legal[at < 0 ? (step > 0 ? 0 : legal.length - 1) : (at + step + legal.length) % legal.length]!;
    onSelect?.(next.card);
    document.getElementById(`hand-${next.card}`)?.focus();
  };

  return (
    <section
      className={['fan', className].filter(Boolean).join(' ')}
      style={{ width, height: height ?? fanHeight(total), ...style }}
      aria-label={`Your hand, ${total} cards in ${rows}${faceDown ? `, ${faceDown} still face-down` : ''}`}
      onKeyDown={onKeyDown}
    >
      {cards.map((c, i) => {
        const slot = layout[i]!;
        const illegal = yourTurn && c.legal === false;
        const isSel = yourTurn && selected === c.card;
        const isHukum = hukum !== null && c.card[1] === hukum;
        const lift = isSel ? LIFT_SELECTED : yourTurn && !illegal ? LIFT_LEGAL : previewHukum && isHukum ? 6 : 0;
        const label = cardLabel(c.card, hukum) + (illegal ? ', not playable' : '') + (isSel ? ', selected, tap again to play' : '');
        return (
          <Card
            key={c.card}
            id={`hand-${c.card}`}
            as="button"
            card={c.card}
            size="hand"
            handWidth={cardWidth}
            hukum={isHukum}
            state={isSel ? 'selected' : illegal ? 'dimmed' : 'default'}
            style={{ left: slot.x, top: slot.y - lift, transform: `rotate(${slot.rotate}deg)` }}
            aria-label={label}
            aria-disabled={illegal || undefined}
            aria-pressed={yourTurn ? isSel : undefined}
            onClick={() => tap(c)}
          />
        );
      })}
      {Array.from({ length: faceDown }, (_, k) => {
        const slot = layout[cards.length + k]!;
        return <CardBack key={`down${k}`} size="hand" style={{ left: slot.x, top: slot.y, transform: `rotate(${slot.rotate}deg)` }} />;
      })}
    </section>
  );
}
