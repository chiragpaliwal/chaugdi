import { suitOf } from '../../engine/types';
import { TRICK_ROTATION, type TableGeometry, type ViewSeat } from '../table/geometry';
import type { TrickView } from '../view/types';
import { Card, type CardState } from './Card';
import { cardLabel } from './cardText';

interface Props {
  trick: TrickView;
  geometry: TableGeometry;
  names: Record<ViewSeat, string>;
  /** Your slot at half strength while your turn is held. */
  held?: boolean;
}

const SEATS: ViewSeat[] = [0, 1, 2, 3];

/** The trick cross (HANDOFF §3). Absolutely positioned inside the table. */
export function TrickArea({ trick, geometry, names, held }: Props) {
  const sweep = trick.sweep;
  return (
    <>
      {sweep && SEATS.map((seat) => trick.plays[seat] && (
        <div key={`g${seat}`} className="sweep-ghost" aria-hidden="true"
          style={{ left: geometry.slot[seat].x, top: geometry.slot[seat].y, transform: `rotate(${TRICK_ROTATION[seat]}deg)` }} />
      ))}
      {SEATS.map((seat) => {
        const p = trick.plays[seat];
        const slot = geometry.slot[seat];
        const f = sweep ? sweep.progress[seat] ?? 0 : 0;
        const pos = sweep ? { x: Math.round(slot.x + (sweep.target.x - slot.x) * f), y: Math.round(slot.y + (sweep.target.y - slot.y) * f) } : slot;
        const rot = TRICK_ROTATION[seat] + 8 * f;
        if (p) {
          const state: CardState = p.winning ? 'winning' : 'played';
          const tag = sweep ? null : p.led ? 'led' : p.cut ? 'cut' : null;
          const label = `${names[seat]} played ${cardLabel(p.card)}${p.cut ? ', cut' : ''}${p.winning ? ', winning' : ''}`;
          return (
            <Card
              key={seat}
              card={p.card}
              size="trick"
              state={state}
              hukum={trick.hukum !== null && suitOf(p.card) === trick.hukum}
              className={['trick-card', p.cut ? 'is-cut' : '', sweep ? 'sweeping' : ''].filter(Boolean).join(' ')}
              style={{ left: pos.x, top: pos.y, transform: `rotate(${rot}deg)` }}
              role="img"
              aria-label={label}
            >
              {tag && <span className={`ttag ${tag}`}>{tag}</span>}
            </Card>
          );
        }
        if (seat === 0 && trick.yourSlot) {
          return <Card key={seat} size="trick" state="slot" held={held} className="trick-card" style={{ left: pos.x, top: pos.y }} role="img" aria-label="Your card goes here" />;
        }
        if (trick.thinkingSeat === seat) {
          return <Card key={seat} size="trick" state="thinking" className="trick-card" style={{ left: pos.x, top: pos.y }} role="img" aria-label={`${names[seat]} is choosing`} />;
        }
        return null;
      })}
    </>
  );
}
