import { useMemo } from 'react';
import { tableGeometry, type TableGeometry, type ViewSeat } from '../table/geometry';
import type { SeatView, TrickView } from '../view/types';
import { PlayerBadge } from './PlayerBadge';
import { TrickArea } from './TrickArea';

interface Props {
  width: number;
  /** 470 in play, 440 with a banner, 300 with a sheet open (HANDOFF §3). */
  height: number;
  seats: SeatView[];
  trick?: TrickView;
  held?: boolean;
  /** Centre content (RacePill, high bid, reveal disc), given the geometry. */
  centre?: (g: TableGeometry) => React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Felt oval, four seats in true turn order, the trick cross and the centre readout. */
export function Table({ width, height, seats, trick, held, centre, children, style }: Props) {
  const g = useMemo(() => tableGeometry(width, height), [width, height]);
  const names = Object.fromEntries(seats.map((s) => [s.seat, s.name])) as Record<ViewSeat, string>;
  return (
    <section className="table" style={{ width, height, ...style }} aria-label="Table">
      <div className="felt" />
      {centre?.(g)}
      {trick && <TrickArea trick={trick} geometry={g} names={names} held={held} />}
      {seats.map((s) => (
        <PlayerBadge key={s.seat} seat={s} style={{ left: g.seatBox[s.seat].x, top: g.seatBox[s.seat].y }} />
      ))}
      {children}
    </section>
  );
}
