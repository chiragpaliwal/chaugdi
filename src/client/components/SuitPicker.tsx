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
            <button key={s} className={`suit-tile${on ? ' on' : ''}`} role="radio" aria-checked={on}
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
