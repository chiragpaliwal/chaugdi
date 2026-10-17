import { useEffect } from 'react';
import type { CardId, Suit } from '../../engine/types';
import { suitTileFact } from '../table/facts';
import { SuitIcon } from './SuitIcon';

const TILE_ORDER: Suit[] = ['S', 'H', 'D', 'C'];
const NAME: Record<Suit, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

interface Props {
  hand: CardId[];
  bid: number;
  selected: Suit;
  onPick: (s: Suit) => void;
  onConfirm: (s: Suit) => void;
}

/** "Call Hukum" (08). Picking re-sorts the hand above as a live preview. */
export function SuitPicker({ hand, bid, selected, onPick, onConfirm }: Props) {
  // Keyboard (GDD §11.4): arrows or S/H/D/C pick, Enter calls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const letter = e.key.toUpperCase() as Suit;
      const at = TILE_ORDER.indexOf(selected);
      let next: Suit | null = null;
      if (TILE_ORDER.includes(letter)) next = letter;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = TILE_ORDER[(at + 1) % 4]!;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = TILE_ORDER[(at + 3) % 4]!;
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement && !e.target.closest('.suit-tile'))) {
        e.preventDefault();
        onConfirm(selected);
        return;
      }
      if (!next) return;
      e.preventDefault();
      onPick(next);
      if (document.activeElement?.closest('.suit-tiles')) document.getElementById(`suit-${next}`)?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onPick, onConfirm]);

  return (
    <section className="sheet roomy" aria-label="Call Hukum">
      <div className="grab" aria-hidden="true" />
      <div className="sheet-intro">
        <h2>Call Hukum</h2>
        <p>You won the auction at {bid}. Your Hukum is shown to everyone, then 8 more cards are dealt.</p>
      </div>
      <div className="suit-tiles" role="radiogroup" aria-label="Hukum suit">
        {TILE_ORDER.map((s) => {
          const f = suitTileFact(hand, s);
          const on = s === selected;
          return (
            <button key={s} id={`suit-${s}`} className={`suit-tile${on ? ' on' : ''}`} role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              aria-label={`${NAME[s]}, you hold ${f.replace(' · ', ': ')}`} onClick={() => onPick(s)}>
              <SuitIcon suit={s} className={`g su-${s}`} />
              <span><span className="nm2">{NAME[s]}</span><span className="f">{f}</span></span>
              {on && (
                <span className="ck">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button className="cta" onClick={() => onConfirm(selected)}>
        Call <SuitIcon suit={selected} /> Hukum
      </button>
    </section>
  );
}
