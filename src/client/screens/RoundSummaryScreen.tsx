import { useEffect, useState } from 'react';
import { suitOf, type CardId, type Suit, type Team } from '../../engine/types';
import { Card } from '../components/Card';
import { cardLabel } from '../components/cardText';
import { HukumChip } from '../components/Hud';

export interface RoundSummaryView {
  roundNo: number;
  tricksPlayed: number;
  bidder: { name: string; team: Team; bid: number; hukum: Suit };
  teamNames: Record<Team, string>;
  /** Your team (view-relative: always A). */
  you: Team;
  outcome: 'MADE' | 'FAILED';
  /** Tricks won by the bidding team. */
  sarWon: number;
  story: string;
  /** Signed ledger, positive = Team A ahead. */
  ledgerBefore: number;
  ledgerAfter: number;
  target: number;
  /** Remaining hands, only when the round ended early. */
  revealed?: { name: string; team: Team; cards: CardId[] }[];
  next: { roundNo: number; dealerName: string; stays: boolean; note: string };
  ready: { initial: string; isMe?: boolean; ready: boolean }[];
  /** Seconds until the next deal (GDD: auto-advance after 6 s). */
  countdown: number;
}

const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');
const leader = (ledger: number): Team | null => (ledger > 0 ? 'A' : ledger < 0 ? 'B' : null);

function Cross() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}
function Tick() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}

/** Screen 14. Shows certainty the moment it exists: the round ended after the deciding trick. */
export function RoundSummaryScreen({ v, width = 390, height = 844, onReady, onHistory }: { v: RoundSummaryView; width?: number; height?: number; onReady?: () => void; onHistory?: () => void }) {
  const [ready, setReady] = useState(false);
  const [left, setLeft] = useState(v.countdown);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);

  const { bidder, outcome, teamNames } = v;
  const made = outcome === 'MADE';
  const b = bidder.bid;
  const delta = made ? b : -2 * b;
  const gainer = made ? bidder.team : other(bidder.team);
  const gain = Math.abs(delta);
  const ledTeam = leader(v.ledgerAfter);
  const after = Math.abs(v.ledgerAfter);
  const before = Math.abs(v.ledgerBefore);
  const sameLeader = leader(v.ledgerBefore) === ledTeam;
  const early = v.tricksPlayed < 13;
  const readyList = v.ready.map((r) => (r.isMe ? { ...r, ready: r.ready || ready } : r));
  const readyCount = readyList.filter((r) => r.ready).length;

  return (
    <main className="result-scr" style={{ width, height }}>
      <span className="k-label">Round {v.roundNo} · {early ? `ended after trick ${v.tricksPlayed}` : 'all 13 tricks'}</span>
      <h1>{teamNames[bidder.team]}<span className={made ? 'ok' : 'bad'}>{made ? 'made' : 'missed'} {b}.</span></h1>
      <p className="story">{v.story}</p>

      <section className="rs-card" aria-label="Contract result">
        <div className="rs-row">
          <i className={`swatch ${bidder.team}`} /><b>{bidder.name}</b><span className="dim">bid</span><span className="rs-big">{b}</span>
          <HukumChip suit={bidder.hukum} />
          <span style={{ flex: 1 }} />
          <span className={`res-chip ${made ? 'ok' : 'bad'}`} aria-label={made ? 'Made' : 'Failed'}>{made ? <Tick /> : <Cross />}{made ? 'Made' : 'Failed'}</span>
        </div>
        <div className="rs-row" aria-label={`Sar won ${v.sarWon} of ${b}`}>
          <span className="dim" style={{ width: 56 }}>Sar won</span>
          <span className="pips">
            {Array.from({ length: b }, (_, i) => <i key={i} className={i < v.sarWon ? `pip won ${bidder.team}` : 'pip miss'} />)}
          </span>
          <span className="mono" style={{ marginLeft: 'auto' }}>{v.sarWon} of {b}</span>
        </div>
        <div className="rs-sep" />
        <div className="rs-row">
          <span className="dim">Points</span>
          <span className="mono dim">{made ? `+${b}` : `−2 × ${b}`}</span>
          <span style={{ flex: 1 }} />
          <span className={`res-chip ${gainer === v.you ? 'ok' : 'bad'}`}>+{gain} to {teamNames[gainer]}</span>
        </div>
        <div className="rs-led" aria-live="polite" aria-label={ledTeam ? `Ledger now ${teamNames[ledTeam].replace('&', 'and')} plus ${after}` : 'Ledger now level'}>
          {ledTeam && <i className={`swatch ${ledTeam}`} />}
          <span style={{ fontSize: 13, fontWeight: 600 }}>{ledTeam ? teamNames[ledTeam] : 'Level'}</span>
          <span style={{ flex: 1 }} />
          <span className="from">{v.ledgerBefore === 0 ? '0' : `+${before}`}</span>
          <span className="v">{ledTeam ? `+${after}` : '0'}</span>
        </div>
        <div>
          <div className="rs-track" role="img" aria-label={`${after} of ${v.target} to win`}>
            {ledTeam && <span className={`f ${ledTeam}`} style={{ width: `${Math.min(100, (after / v.target) * 100).toFixed(1)}%` }} />}
            {sameLeader && v.ledgerBefore !== 0 && <span className="was" style={{ left: `${Math.min(100, (before / v.target) * 100)}%` }} />}
          </div>
          <div className="rs-tl"><span>0</span><span>{v.target - after} to win</span><span>+{v.target}</span></div>
        </div>
      </section>

      {early && v.revealed && (
        <section style={{ marginTop: 14 }} aria-label="Unplayed cards, revealed">
          <div className="k-label" style={{ marginBottom: 8 }}>Unplayed cards</div>
          <div className="rs-reveal">
            {v.revealed.map((r) => (
              <div className="rs-rvc" key={r.name}>
                <span className="rs-rvn"><i className={`swatch ${r.team}`} />{r.name}</span>
                <div className="rs-minis">
                  {r.cards.map((c) => <Card key={c} card={c} size="mini" hukum={suitOf(c) === bidder.hukum} role="img" aria-label={cardLabel(c, bidder.hukum)} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rs-next" aria-label="Next round">
        <div className="rs-nxh">Next: round {v.next.roundNo}<span className="r"><span className="rs-dl" aria-hidden="true">D</span>{v.next.dealerName} {v.next.stays ? 'deals again' : 'deals next'}</span></div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: -4 }}>{v.next.note}</div>
        <div className="rs-ready">
          {readyList.map((r) => <span key={r.initial} className={`rs-ra${r.ready ? ' on' : ''}${r.isMe ? ' me' : ''}`}>{r.initial}</span>)}
          <span className="t">{readyCount} of {readyList.length} ready · deals in {left}s</span>
        </div>
      </section>
      <div className="rs-dock">
        <button className="ib" aria-label="Match history" onClick={onHistory}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6" /></svg>
        </button>
        <button className={`cta${ready ? ' done' : ''}`} onClick={() => { if (!ready) { setReady(true); onReady?.(); } }} aria-pressed={ready}>
          {ready ? 'Ready · waiting for others' : 'Ready'}
        </button>
      </div>
    </main>
  );
}

