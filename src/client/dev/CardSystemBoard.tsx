import { RANKS, SUITS, type CardId } from '../../engine/types';
import { Card, type CardState } from '../components/Card';
import { CardBack } from '../components/CardBack';
import { cardLabel } from '../components/cardText';

// Recreates docs/screens/31-card-system.png from the real components. The board chrome
// (headings, panels, notes) is copied from docs/boards/Cards.dc.html.

const DECK_ORDER = ['A', ...RANKS.slice(0, 12)] as const; // A 2 … K

function StateCell({ name, meta, card, size, state, hukum, lift }: { name: string; meta: string; card?: CardId; size: 'hand' | 'trick'; state: CardState; hukum?: boolean; lift?: number }) {
  return (
    <div className="cs-cell">
      <Card card={card} size={size} state={state} hukum={hukum} style={lift ? { transform: `translateY(-${lift}px)` } : undefined} role="img" aria-label={name} />
      {name}<span className="m">{meta}</span>
    </div>
  );
}

export function CardSystemBoard() {
  return (
    <main className="cs-wrap">
      <div className="cs-hd">
        <div><span className="cs-k">Chaugadi · foundations</span><h1>Card system</h1></div>
        <p>One face built three ways. <b>Full face</b> (76 px and up) has mirrored corner indices, the pip layout and the court frame. <b>Index face</b> (46–70 px, in play) drops the pips: rank and small suit top-left, one large suit bottom-right. <b>Mini</b> (30 px) is rank plus suit only. Four-colour suits throughout.</p>
      </div>

      <div className="cs-deckwrap">
        <section className="cs-deck" aria-label="Full deck, 52 faces">
          {SUITS.map((s) => DECK_ORDER.map((r) => {
            const c = `${r}${s}` as CardId;
            return <Card key={c} card={c} size="full" role="img" aria-label={cardLabel(c)} />;
          }))}
        </section>
        <div className="cs-side">
          <div className="cs-pan">
            <h3>Pip layouts</h3>
            <p className="cs-note">Three columns (left, centre, right) on a 19 × 68 pip grid between the indices. Pips below the midline turn 180°.</p>
            <div className="cs-lo"><span>2 · C top, C bottom</span><span>3 · + C mid</span><span>4 · corners</span><span>5 · + C mid</span><span>6 · L/R × 3</span><span>7 · 6 + C ¼</span><span>8 · 6 + C ¼, ¾</span><span>9 · L/R × 4 + C mid</span><span>10 · L/R × 4 + C ⅙, ⅚</span></div>
          </div>
          <div className="cs-pan">
            <h3>Ace and courts</h3>
            <p className="cs-note"><b>Ace:</b> one 38 px pip inside a thin ring. <b>J Q K:</b> no figures. A framed panel in the suit colour, a dotted block-print field, and a centre tablet with the letter (Bricolage 800) and its suit. Reads at a glance and keeps the line-work family of the back.</p>
          </div>
          <div className="cs-pan">
            <h3>Indices</h3>
            <p className="cs-note">DM Mono 500, tight tracking so <b>10</b> fits the same width as one digit. Corner index is the only part that must survive overlap: at 13 cards the back row shows only the top 50 px of each card.</p>
          </div>
        </div>
      </div>

      <section className="cs-bottom">
        <div className="cs-pan">
          <h3>Sizes in play</h3>
          <div className="cs-row">
            <div className="cs-cell"><Card card="QD" size="hand" handWidth={70} />Large hand<span className="m">70 × 98 · ≤ 5 cards</span></div>
            <div className="cs-cell"><Card card="QD" size="hand" handWidth={62} />Hand<span className="m">62 × 87 · 6–13</span></div>
            <div className="cs-cell"><Card card="QD" size="trick" />Trick<span className="m">46 × 64</span></div>
            <div className="cs-cell"><Card card="QD" size="mini" />Mini<span className="m">30 × 42</span></div>
          </div>
          <p className="cs-note">Settings › Card size scales hand cards S 56 · M 62 · L 70. At 13 cards the hand is always two rows; L falls back to M below 390 px wide.</p>
        </div>
        <div className="cs-pan">
          <h3>States</h3>
          <div className="cs-row" style={{ paddingTop: 18 }}>
            <StateCell name="Default" meta="" card="9C" size="hand" state="default" />
            <StateCell name="Legal" meta="lift 5" card="9C" size="hand" state="legal" lift={5} />
            <StateCell name="Selected" meta="lift 16 · amber" card="AC" size="hand" state="selected" lift={16} />
            <StateCell name="Dimmed" meta="brightness .42" card="KH" size="hand" state="dimmed" />
            <StateCell name="Hukum" meta="notch" card="AS" size="hand" state="default" hukum />
            <StateCell name="Played" meta="trick" card="TD" size="trick" state="played" />
            <StateCell name="Winning" meta="blue ring" card="KD" size="trick" state="winning" />
            <StateCell name="Cut" meta="ivory glow" card="4S" size="trick" state="cut" hukum />
            <StateCell name="Your slot" meta="dashed" size="trick" state="slot" />
          </div>
        </div>
        <div className="cs-pan">
          <h3>Back</h3>
          <div className="cs-row" style={{ alignItems: 'flex-end' }}>
            <CardBack size="xl" label="Card back, large" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <CardBack size="hand" /><CardBack size="trick" /><CardBack size="mini" />
            </div>
          </div>
          <p className="cs-note">Indigo #262B5C with ivory line work: a block-print lattice, dots at the crossings, a double rule and a centre medallion. Same back in both themes.</p>
        </div>
      </section>
    </main>
  );
}
