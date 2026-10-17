import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface CoachMarkProps {
  /** CSS selector of the element to spotlight, searched in the parent of the layer. */
  target?: string;
  /** A circle around the target (seats), else a rounded rectangle. */
  circle?: boolean;
  /** "n of 6" and the step dots. */
  step?: { n: number; of: number };
  title: string;
  body: React.ReactNode;
  /** Buttons for the bottom row; the last one gets focus. */
  actions: React.ReactNode;
  /** Let taps through to the table (the "tap the K♥" step). */
  passThrough?: boolean;
}

interface Rect { x: number; y: number; w: number; h: number }

const PAD = 6;
const GAP = 16;
const EDGE = 8;

const same = (a: Rect | null, b: Rect | null) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** Spotlight + ivory coach card (HANDOFF §4 CoachMark). Fills its positioned parent. */
export function CoachMark({ target, circle, step, title, body, actions, passThrough }: CoachMarkProps) {
  const layer = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [size, setSize] = useState({ w: 390, h: 844, card: 180 });

  // Targets move while cards deal and sheets slide in: re-measure every frame.
  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      const root = layer.current;
      if (!root) return;
      const box = root.getBoundingClientRect();
      const el = target ? root.parentElement?.querySelector(target) : null;
      let next: Rect | null = null;
      if (el) {
        const r = el.getBoundingClientRect();
        next = { x: Math.round(r.left - box.left), y: Math.round(r.top - box.top), w: Math.round(r.width), h: Math.round(r.height) };
      }
      setRect((prev) => (same(prev, next) ? prev : next));
      const cardH = card.current?.offsetHeight ?? 180;
      setSize((prev) => (prev.w === box.width && prev.h === box.height && prev.card === cardH ? prev : { w: box.width, h: box.height, card: cardH }));
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [target]);

  useEffect(() => {
    const btns = card.current?.querySelectorAll<HTMLButtonElement>('.coach-row button');
    btns?.[btns.length - 1]?.focus({ preventScroll: true });
  }, [title]);

  let spot: React.CSSProperties | null = null;
  let top = (size.h - size.card) / 2;
  if (rect) {
    if (circle) {
      const d = Math.max(rect.w, rect.h) + 2 * 31;
      spot = { left: rect.x + rect.w / 2 - d / 2, top: rect.y + rect.h / 2 - d / 2, width: d, height: d, borderRadius: d / 2 };
    } else {
      const h = rect.h + 2 * PAD;
      spot = { left: rect.x - PAD, top: rect.y - PAD, width: rect.w + 2 * PAD, height: h, borderRadius: Math.min(16, h / 2) };
    }
    const sTop = spot.top as number;
    const sBottom = sTop + (spot.height as number);
    top = sTop + (spot.height as number) / 2 < size.h / 2 ? sBottom + GAP : sTop - GAP - size.card;
  }
  top = Math.max(EDGE, Math.min(size.h - size.card - EDGE, top));

  return (
    <div ref={layer} className={`coach-layer${passThrough ? ' pass' : ''}`}>
      <div className={`coach-spot${spot ? '' : ' none'}`} style={spot ?? undefined} aria-hidden="true" />
      <section ref={card} className="coach" style={{ top }} role="dialog" aria-live="polite" aria-label={step ? `Coach mark ${step.n} of ${step.of}` : title}>
        {step && <span className="st">{step.n} of {step.of}</span>}
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="coach-row">
          {step
            ? <span className="pd" aria-hidden="true">{Array.from({ length: step.of }, (_, i) => <i key={i} className={i === step.n - 1 ? 'on' : ''} />)}</span>
            : <span style={{ flex: 1 }} />}
          {actions}
        </div>
      </section>
    </div>
  );
}
