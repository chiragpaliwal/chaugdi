import type { Team } from '../../engine/types';
import type { Point } from '../table/geometry';
import type { RaceView } from '../view/types';

const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');

type Props =
  | { variant: 'race'; at: Point; race: RaceView }
  | { variant: 'auction'; at: Point; passes: number; of?: number; line: string }
  | { variant: 'dealing'; at: Point; title: string; line: string; steps: number; done: number; nowFraction: number; label?: string };

/**
 * The one centre readout (HANDOFF §1 rule 2). Race: "[■ 8 to make][● 6 to break]",
 * a line and 13 trick dots. Variants for the auction and the deals.
 */
export function RacePill(props: Props) {
  const style = { left: props.at.x, top: props.at.y };

  if (props.variant === 'auction') {
    const of = props.of ?? 3;
    return (
      <div className="pill" style={style} aria-live="polite">
        <span className="chip">{props.passes} of {of} passes</span>
        <span className="t">{props.line}</span>
        <span className="bars" aria-hidden="true">
          {Array.from({ length: of }, (_, i) => <i key={i} className={i < props.passes ? 'on' : ''} />)}
        </span>
      </div>
    );
  }

  if (props.variant === 'dealing') {
    const pct = Math.round(props.nowFraction * 100);
    return (
      <div className="pill" style={style} aria-live="polite">
        <span className="chip">{props.title}</span>
        <span className="t">{props.line}</span>
        <span className={`bars${props.steps <= 2 ? ' wide' : ''}`} aria-label={props.label}>
          {Array.from({ length: props.steps }, (_, i) => (
            <i
              key={i}
              className={i < props.done ? 'on' : ''}
              style={i === props.done ? { background: `linear-gradient(90deg, var(--amber) ${pct}%, var(--line) ${pct}%)` } : undefined}
            />
          ))}
        </span>
      </div>
    );
  }

  const r = props.race;
  const halves = [
    { text: `${r.toMake} to make`, team: r.bidderTeam, value: r.toMake },
    { text: `${r.toBreak} to break`, team: other(r.bidderTeam), value: r.toBreak },
  ];
  return (
    <div className="pill" style={style} aria-live="polite" aria-label={r.aria}>
      <div className="race">
        {halves.map((h) => (
          <span key={h.text} className={h.value <= 2 ? 'hot' : ''}>
            <i className={`swatch ${h.team}`} />{h.text}
          </span>
        ))}
      </div>
      <span className="t">{r.line}</span>
      <span className="dots" aria-hidden="true">
        {r.history.map((d, i) => <i key={i} className={d ?? ''} />)}
      </span>
    </div>
  );
}
