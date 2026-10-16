import type { CardId } from '../../engine/types';
import { sortHand } from '../../engine/cards';
import { HandFan } from '../components/HandFan';
import { fanStripWidths, handCardWidth } from '../table/geometry';

// HANDOFF §14 step 2: the fan at 5, 8, 12 and 13 cards, 360 and 390 wide.
const DEAL: CardId[] = ['AS', 'QS', 'TS', '6S', '3S', 'KH', 'JH', '8H', 'AC', '9C', '4C', 'QD', '7D'];

export function FanLab() {
  return (
    <main className="dev-fanlab">
      {[390, 360].map((W) =>
        [5, 8, 12, 13].map((n) => {
          const w = handCardWidth('M', W) as 56 | 62 | 70;
          const cards = sortHand(DEAL.slice(0, n), 'S').map((card) => ({ card, legal: card[1] === 'S' }));
          const strip = Math.min(...fanStripWidths(n, W - 24, w));
          return (
            <figure key={`${W}-${n}`} style={{ width: W }} data-fan={`${W}-${n}`}>
              <figcaption>{W}px · {n} cards · narrowest strip {strip.toFixed(1)}px</figcaption>
              <HandFan cards={cards} width={W - 24} cardWidth={w} hukum="S" yourTurn selected={cards[1]?.card ?? null} style={{ margin: '0 12px' }} />
            </figure>
          );
        }),
      )}
    </main>
  );
}
