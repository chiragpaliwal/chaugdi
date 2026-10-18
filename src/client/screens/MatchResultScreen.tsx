import type { Suit, Team } from '../../engine/types';
import { SuitIcon } from '../components/SuitIcon';
import { SUIT_NAME } from '../components/cardText';
import { signed } from '../components/Hud';

export interface MatchRound {
  who: string;
  team: Team;
  bid: number;
  hukum: Suit;
  outcome: 'MADE' | 'FAILED' | 'KOT';
  /** Signed ledger after the round, positive = Team A ahead. */
  ledgerAfter: number;
}

export interface MatchResultView {
  winner: Team;
  teamNames: Record<Team, string>;
  reason: 'TARGET' | 'KOT';
  story: string;
  history: MatchRound[];
  target: number;
}

const CONFETTI: Record<Team, string[]> = {
  A: ['#A897FF', '#C9BFFF', '#F5F5F2', '#A897FF', '#7B68E0'],
  B: ['#4CC9A0', '#A8EBD3', '#F5F5F2', '#4CC9A0', '#2E9C78'],
};

/** Screens 15 / 15b. A Kot ends the match with no points added (GDD §3.5, delta 0). */
/** `rematchWaiting`: online, only the host may rematch; others see this in place of the button. */
export function MatchResultScreen({ v, width = 390, height = 844, onHome, onRematch, rematchWaiting }: { v: MatchResultView; width?: number; height?: number; onHome?: () => void; onRematch?: () => void; rematchWaiting?: string }) {
  const kot = v.reason === 'KOT';
  const vals = [0, ...v.history.map((r) => r.ledgerAfter)];
  const final = vals[vals.length - 1]!;
  const lo = Math.min(-10, ...vals);
  const hi = Math.max(v.target + 4, ...vals);
  const y = (val: number) => Math.round(14 + (hi - val) * (96 / (hi - lo)));
  const step = Math.min(49, 294 / Math.max(1, vals.length - 1));
  const pts = vals.map((val, i) => ({ x: Math.round(36 + i * step), y: y(val), team: (val >= 0 ? 'A' : 'B') as Team, end: i === vals.length - 1, label: i === 0 ? 'start' : `R${i}` }));
  const finalTeam: Team = final >= 0 ? 'A' : 'B';

  const conf = Array.from({ length: kot ? 26 : 14 }, (_, i) => ({
    x: Math.round(150 + ((i * 61) % 210)), y: Math.round(-10 + ((i * 37) % 20)),
    w: i % 3 === 0 ? 4 : 6, h: i % 3 === 0 ? 10 : 4, c: CONFETTI[v.winner][i % 5]!,
    dy: Math.round(20 + ((i * 53) % (kot ? 190 : 90))), rt: Math.round((i * 137.5) % 360), d: (i * 45) % 600,
  }));

  return (
    <main className="result-scr" style={{ width, minHeight: height }}>
      <div className="mr-confetti" aria-hidden="true">
        {conf.map((c, i) => (
          <i key={i} style={{ left: c.x, top: c.y, width: c.w, height: c.h, background: c.c, animationDelay: `${c.d}ms`, ['--dy' as string]: `${c.dy}px`, ['--rt' as string]: `${c.rt}deg` }} />
        ))}
      </div>
      <span className="k-label" style={{ position: 'relative' }}>
        {kot ? `Match over · round ${v.history.length} · instant win` : `Match over · ${v.history.length} rounds`}
      </span>
      {kot && <div className={`mr-kot ${v.winner}`} role="text">Kot!</div>}
      <h1 className="mr-h">{v.teamNames[v.winner]}<br />win the match.</h1>
      <p className="story">{v.story}</p>
      <div className="mr-fin" aria-label="Final ledger">
        <i className={`swatch ${finalTeam}`} style={{ width: 14, height: 14 }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Final</span>
        <span className="v">{final === 0 ? 'Level' : `+${Math.abs(final)}`}</span>
        {kot && <span className="mr-badge">Instant win</span>}
      </div>

      <section className="mr-chart" aria-label="Ledger after each round">
        <div style={{ position: 'relative', width: 338, height: 128 }}>
          <svg width="338" height="128" viewBox="0 0 338 128" role="img" aria-label={`Ledger by round: ${vals.slice(1).join(', ')}. Positive is ${v.teamNames.A.replace('&', 'and')}.`}>
            <line x1="28" x2="334" y1={y(0)} y2={y(0)} stroke="var(--sar-line)" strokeWidth="1" />
            <line x1="28" x2="334" y1={y(v.target)} y2={y(v.target)} stroke="var(--team-a)" strokeWidth="1" strokeDasharray="3 4" opacity=".6" />
            {lo <= -v.target && <line x1="28" x2="334" y1={y(-v.target)} y2={y(-v.target)} stroke="var(--team-b)" strokeWidth="1" strokeDasharray="3 4" opacity=".6" />}
            <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <span className="mr-ax" style={{ left: 0, top: y(v.target) }}>+{v.target}</span>
          <span className="mr-ax" style={{ left: 10, top: y(0) }}>0</span>
          {pts.map((p) => (
            <span key={p.label}>
              <i className={`mr-dot ${p.team}${p.end ? ' end' : ''}`} style={{ left: p.x, top: p.y }} />
              <span className="mr-xl" style={{ left: p.x }}>{p.label}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="mr-hist" aria-label="Round by round">
        <div className="mr-hr h k-label"><span>Rd</span><span>Contract</span><span>Result</span><span className="mr-num">Pts</span><span className="mr-num">Ledger</span></div>
        {v.history.map((r, i) => {
          const d = r.ledgerAfter - vals[i]!;
          return (
            <div className="mr-hr" key={i}>
              <span className="mono dim">{i + 1}</span>
              <span className="who"><i className={`swatch ${r.team}`} />{r.who} <b className="mono">{r.bid}</b><SuitIcon suit={r.hukum} className={`su-${r.hukum}`} label={`${SUIT_NAME[r.hukum]} Hukum`} /></span>
              <span className={`mr-res ${r.outcome === 'KOT' ? 'kt' : r.outcome === 'MADE' ? 'ok' : 'bad'}`}>{r.outcome === 'KOT' ? 'Kot' : r.outcome === 'MADE' ? 'Made' : 'Failed'}</span>
              <span className="mr-num">{r.outcome === 'KOT' ? '—' : signed(d)}</span>
              <span className="mr-led"><i className={`swatch ${r.ledgerAfter >= 0 ? 'A' : 'B'}`} style={{ width: 8, height: 8 }} />{Math.abs(r.ledgerAfter)}</span>
            </div>
          );
        })}
      </section>

      <div className="mr-btns">
        <button className="sec" onClick={onHome}>Home</button>
        {rematchWaiting
          ? <button className="cta" aria-disabled="true" style={{ opacity: 0.55 }}>{rematchWaiting}</button>
          : <button className="cta" onClick={onRematch}>Rematch, same teams</button>}
      </div>
    </main>
  );
}
