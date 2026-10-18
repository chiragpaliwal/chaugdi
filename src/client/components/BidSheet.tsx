import { useEffect } from 'react';
import type { Team } from '../../engine/types';
import type { Fact } from '../table/facts';
import { FactChips } from './GameParts';

export interface BidSheetProps {
  high: { bid: number; name: string; team: Team } | null;
  /** Passes since the high bid (0–2). No high bid means you are the opener and must bid. */
  passes: number;
  facts: Fact[];
  selected: number | null;
  passed: boolean;
  onSelect: (n: number) => void;
  onBid: (n: number) => void;
  onPass: () => void;
}

const BIDS = [7, 8, 9, 10, 11, 12, 13];
const KEY_TO_BID: Record<string, number> = { '7': 7, '8': 8, '9': 9, '0': 10, '1': 11, '2': 12, '3': 13 };

export function passLine(p: Pick<BidSheetProps, 'high' | 'passes' | 'passed'>): string {
  if (!p.high) return 'You open: 7 is compulsory, or bid more';
  if (p.passed && p.passes >= 2) return `You passed. Three in a row: ${p.high.name} plays ${p.high.bid}.`;
  if (p.passes >= 2) return `${p.passes} of 3 passes · passing now gives ${p.high.name} the bid at ${p.high.bid}`;
  return `${p.passes} of 3 passes · three in a row give ${p.high.name} the bid at ${p.high.bid}`;
}

/** "Your call" (07): 7–13 grid, numbers at or under the high bid locked, Pass and Bid. */
export function BidSheet(props: BidSheetProps) {
  const { high, passes, facts, selected, passed, onSelect, onBid, onPass } = props;
  const min = high ? high.bid + 1 : 7;
  const canPass = high !== null;

  useEffect(() => {
    if (passed) return;
    const focusBid = (n: number) => document.getElementById(`bid-${n}`)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const inGrid = e.target instanceof Element && !!e.target.closest('.bid-grid');
      const n = KEY_TO_BID[e.key];
      if (n !== undefined && n >= min) { onSelect(n); if (inGrid) focusBid(n); }
      else if ((e.key === 'p' || e.key === 'P') && canPass) onPass();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const up = e.key === 'ArrowRight' || e.key === 'ArrowDown';
        const cur = selected ?? (up ? min - 1 : 14);
        const next = Math.min(13, Math.max(min, cur + (up ? 1 : -1)));
        onSelect(next);
        if (inGrid) focusBid(next);
      } else if (e.key === 'Enter') {
        // Other buttons (Pass, the menu) act through their own click.
        if (e.target instanceof HTMLButtonElement && !inGrid) return;
        const focused = inGrid ? Number((e.target as Element).closest('.bid-num')?.getAttribute('data-bid')) : NaN;
        const value = focused >= min ? focused : selected;
        if (value !== null && value >= min) { e.preventDefault(); onBid(value); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [passed, min, canPass, selected, onSelect, onPass, onBid]);

  return (
    <section className="sheet" aria-label="Your call">
      <div className="grab" aria-hidden="true" />
      <div className="sheet-head">
        <h2>Your call</h2>
        {high
          ? <span>High bid <b className="mono">{high.bid}</b> · <i className={`swatch ${high.team}`} />{high.name}</span>
          : <span>No bids yet</span>}
      </div>
      <FactChips facts={facts} />
      <div className="bid-grid" role="radiogroup" aria-label="Sar to bid, 7 to 13">
        {BIDS.map((n) => {
          const lock = n < min;
          const on = !passed && selected === n;
          const cls = ['bid-num', lock ? 'lock' : '', on ? 'on' : '', n === 13 ? 'kot' : ''].filter(Boolean).join(' ');
          const aria = lock
            ? `${n}, not allowed: must beat ${high?.bid}`
            : n === 13 ? '13, Kot: win all 13 to win the match' : `${n}: make it for plus ${n}, miss it for minus ${2 * n}`;
          return (
            <button key={n} id={`bid-${n}`} data-bid={n} className={cls} role="radio" aria-checked={on}
              tabIndex={on || (selected === null && n === min) ? 0 : -1} aria-disabled={lock || passed || undefined} aria-label={aria}
              onClick={() => { if (!lock && !passed) onSelect(n); }}>
              <span className="n">{n}</span>
              <span className="x">{lock ? 'taken' : n === 13 ? 'Kot' : `+${n} · −${2 * n}`}</span>
            </button>
          );
        })}
      </div>
      <div className="pass-line" aria-live="polite">
        <span className="pass-bars" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => <i key={i} className={i < passes + (passed ? 1 : 0) ? 'on' : ''} />)}
        </span>
        {passLine(props)}
      </div>
      <div className="sheet-btns">
        <button className={`pass${passed ? ' on' : ''}`} onClick={() => { if (!passed && canPass) onPass(); }} aria-pressed={passed}
          aria-disabled={!canPass || undefined} title={canPass ? undefined : 'The opener must bid'}>Pass</button>
        <button className={`cta${selected !== null && !passed ? '' : ' ghost'}`} aria-disabled={selected === null || passed || undefined}
          onClick={() => { if (selected !== null && !passed) onBid(selected); }}>
          {passed ? 'Passed' : selected !== null ? `Bid ${selected}` : 'Pick a number'}
        </button>
      </div>
    </section>
  );
}
