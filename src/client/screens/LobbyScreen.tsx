import { useState } from 'react';
import type { Seat } from '../../engine/types';
import { ONLINE, TARGET_SCORE, type MatchLength } from '../../shared/constants';
import { Segmented } from '../components/Controls';
import { BotIcon } from '../components/GameParts';
import type { BotLevel } from '../stores/settings';

export interface LobbyPlayer {
  name: string;
  isBot: boolean;
  ready: boolean;
  isHost: boolean;
  /** False while a human's seat is held after they dropped. */
  connected?: boolean;
}

export interface LobbyView {
  code: string;
  url: string;
  /** Your absolute room seat. Teams are fixed: seats {0,2} and {1,3} (GDD §3.1). */
  you: Seat;
  seats: Record<Seat, LobbyPlayer | null>;
  turnSeconds: 10 | 20 | 30;
  botLevel: BotLevel;
  /** Online rooms: first to +26 or +52 (host setting). */
  matchLength?: MatchLength;
  /** Seconds until the deal once the host starts (03c). */
  startingIn?: number | null;
}

interface Props {
  v: LobbyView;
  width?: number;
  height?: number;
  onLeave?: () => void;
  onFillBot?: (seat: Seat) => void;
  onRemoveBot?: (seat: Seat) => void;
  /** Host: make this seat your partner (GDD swapTeams). */
  onPartner?: (seat: Seat) => void;
  onTurnSeconds?: (s: 10 | 20 | 30) => void;
  onBotLevel?: (l: BotLevel) => void;
  onMatchLength?: (m: MatchLength) => void;
  onReady?: (ready: boolean) => void;
  onStart?: () => void;
  onCancel?: () => void;
  /** A refused action, shown under the button. */
  error?: string | null;
}

const TIMERS = [{ value: '10', label: '10s' }, { value: '20', label: '20s' }, { value: '30', label: '30s' }] as const;
const BOTS = [{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }] as const;
const LEVEL: Record<BotLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const LENGTHS = [{ value: 'short', label: `+${TARGET_SCORE.short}` }, { value: 'standard', label: `+${TARGET_SCORE.standard}` }] as const;

/** The deal starts this many seconds after the host taps Start (03c). */
export const START_SECONDS = ONLINE.startSeconds;

const rel = (you: Seat, k: number) => ((you + k) % 4) as Seat;

function Tick() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}

/** Screens 03 / 03b / 03c. You at the bottom, your partner opposite. */
export function LobbyScreen({ v, width = 390, height = 844, onLeave, onFillBot, onRemoveBot, onPartner, onTurnSeconds, onBotLevel, onMatchLength, onReady, onStart, onCancel, error }: Props) {
  const [copied, setCopied] = useState(false);
  const me = v.seats[v.you];
  const isHost = !!me?.isHost;
  const diaW = width - 32;
  const pos: [number, number][] = [[diaW / 2, 206], [62, 92], [diaW / 2, 0], [diaW - 62, 92]];
  const players = ([0, 1, 2, 3] as Seat[]).map((s) => v.seats[s]);
  const seated = players.filter(Boolean).length;
  const ready = players.filter((p) => p && (p.isBot || p.ready)).length;
  const open = 4 - seated;
  const starting = v.startingIn != null;
  const partnerSeat = rel(v.you, 2);

  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Chaugadi', text: `Join my Chaugadi room: ${v.code}`, url: v.url }); return; }
    } catch { /* cancelled */ return; }
    copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(v.url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard */ }
  };

  let cta: { cls: 'go' | 'wait'; text: string; act?: () => void };
  if (starting) cta = { cls: 'go', text: `Dealing in ${v.startingIn}` };
  else if (isHost) {
    cta = open > 0 ? { cls: 'wait', text: `Start · waiting for ${open} seat${open === 1 ? '' : 's'}` }
      : ready < 4 ? { cls: 'wait', text: `Start · ${ready} of 4 ready` }
        : { cls: 'go', text: 'Start · everyone’s ready', act: onStart };
  } else {
    cta = me?.ready ? { cls: 'wait', text: 'Ready · waiting for the host', act: () => onReady?.(false) } : { cls: 'go', text: 'I’m ready', act: () => onReady?.(true) };
  }

  const others = ([1, 2, 3] as const).map((k) => rel(v.you, k)).filter((s) => v.seats[s] !== null);
  // Fixed name order so the options don't jump when seats swap (03).
  const partnerOpts = others.map((s) => ({ value: String(s), label: v.seats[s]!.name })).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <main className="menu-scr" style={{ width, minHeight: height }}>
      <header className="lobby-top">
        <button className="icon-btn" aria-label="Leave room" onClick={onLeave}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h1>Chaugadi</h1><span className="dim">· room</span>
      </header>

      <section className="room-code" aria-label={`Room code ${v.code.split('').join(' ')}`}>
        <span className="k-label">Room code</span>
        <span className="c">{v.code}</span>
        <span className="u">{v.url.replace(/^https?:\/\//, '')}</span>
        <div className="row">
          <button className="share" onClick={share}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>Share invite
          </button>
          <button className="icon-btn" aria-label={copied ? 'Link copied' : 'Copy room link'} onClick={copy}>
            {copied ? <Tick /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>}
          </button>
        </div>
        <span className="sr-only" aria-live="polite">{copied ? 'Link copied' : ''}</span>
      </section>

      <section className="lobby-dia" aria-label="Seats. Partners sit opposite.">
        <div className="tbl" />
        <div className="ax" aria-hidden="true"><span className="A">↕ Team A</span><span className="B">↔ Team B</span></div>
        {([0, 1, 2, 3] as const).map((k) => {
          const seat = rel(v.you, k);
          const p = v.seats[seat];
          const team = k % 2 === 0 ? 'A' : 'B';
          const [x, y] = pos[k]!;
          if (!p) {
            return (
              <div key={k} className="lslot" style={{ left: x, top: y }}>
                <div className="av empty" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 6v12M6 12h12" /></svg></div>
                <span className="nm dim">Open seat</span>
                {isHost && !starting && (
                  <button className="fill" onClick={() => onFillBot?.(seat)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4" /></svg>Fill with bot
                  </button>
                )}
              </div>
            );
          }
          const isReady = p.isBot || p.ready;
          const away = !p.isBot && p.connected === false;
          return (
            <div key={k} className="lslot" style={{ left: x, top: y }}>
              <div className={`av ${team}${k === 0 ? ' me' : ''}`}>
                {p.isBot ? <BotIcon /> : (k === 0 ? 'Y' : p.name.charAt(0))}
                {isReady && <span className="ok" role="img" aria-label="Ready"><Tick /></span>}
              </div>
              <span className="nm">{k === 0 ? 'You' : p.isBot ? `${p.name} · bot` : p.name}{p.isHost && <span className="host">HOST</span>}</span>
              {away ? <span className="rs">Reconnecting…</span>
                : <span className={`rs${isReady ? ' on' : ''}`}>{isReady ? 'Ready' : 'Not ready'}</span>}
              {p.isBot && isHost && !starting && onRemoveBot && (
                <button className="fill" aria-label={`Remove bot ${p.name}`} onClick={() => onRemoveBot(seat)}>Remove bot</button>
              )}
            </div>
          );
        })}
      </section>

      <section className="lobby-grp" aria-label={isHost ? 'Host settings' : 'Room settings'}>
        {isHost && partnerOpts.length > 0 && (
          <div className="gr">
            <span className="l">Your partner<small>Sits opposite you on Team A</small></span>
            <Segmented label="Your partner" tall options={partnerOpts} value={String(partnerSeat)} onChange={(s) => onPartner?.(Number(s) as Seat)} />
          </div>
        )}
        <div className="gr">
          <span className="l">Turn timer</span>
          {isHost ? <Segmented label="Turn timer" tall options={TIMERS} value={String(v.turnSeconds) as '10' | '20' | '30'} onChange={(t) => onTurnSeconds?.(Number(t) as 10 | 20 | 30)} />
            : <span className="val">{v.turnSeconds}s</span>}
        </div>
        <div className="gr">
          <span className="l">Bots</span>
          {isHost ? <Segmented label="Bot difficulty" tall options={BOTS} value={v.botLevel} onChange={(l: BotLevel) => onBotLevel?.(l)} />
            : <span className="val">{LEVEL[v.botLevel]}</span>}
        </div>
        {v.matchLength && (
          <div className="gr">
            <span className="l">First to</span>
            {isHost ? <Segmented label="Match length" tall options={LENGTHS} value={v.matchLength} onChange={(m: MatchLength) => onMatchLength?.(m)} />
              : <span className="val">+{TARGET_SCORE[v.matchLength]}</span>}
          </div>
        )}
      </section>
      {error && <p className="join-msg" role="alert">{error}</p>}

      <button className={`lobby-cta ${cta.cls}`} aria-live="polite" aria-disabled={!cta.act || undefined} onClick={cta.act}>
        {starting && <span className="ring" aria-hidden="true" style={{ background: `conic-gradient(var(--on-amber) ${Math.round(((v.startingIn ?? 0) / START_SECONDS) * 100)}%, rgba(26,20,5,.18) 0)` }} />}
        {cta.text}
      </button>
      {starting && isHost && <button className="lobby-cancel" onClick={onCancel}>Cancel</button>}
    </main>
  );
}
