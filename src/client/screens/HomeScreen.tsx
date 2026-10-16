import { useState } from 'react';
import type { Team } from '../../engine/types';
import { ROOM_CODE_LENGTH, RoomCodeField } from '../components/Controls';
import { SuitIcon } from '../components/SuitIcon';
import { useFeatures } from '../features';
import type { BotLevel } from '../stores/settings';

const LEVEL: Record<BotLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export type HomeFooter =
  | { kind: 'last'; team: Team; names: string; value: number }
  /** GDD §5: resume banner when a solo match is saved. */
  | { kind: 'resume'; team: Team | null; names: string; value: number; round: number };

interface Props {
  nickname: string;
  botLevel: BotLevel;
  footer?: HomeFooter;
  joinError?: string;
  initialCode?: string;
  width?: number;
  height?: number;
  onPlayBots?: () => void;
  onCreateRoom?: () => void;
  onJoin?: (code: string) => void;
  onSettings?: () => void;
  onNickname?: () => void;
  onHowToPlay?: () => void;
  onFooter?: () => void;
}

/** Screen 01. */
export function HomeScreen({ nickname, botLevel, footer, joinError, initialCode = '', width = 390, height = 844, onPlayBots, onCreateRoom, onJoin, onSettings, onNickname, onHowToPlay, onFooter }: Props) {
  const { tutorial } = useFeatures();
  const [code, setCode] = useState(initialCode);
  const ready = code.length === ROOM_CODE_LENGTH;
  const name = nickname || 'Guest';
  const join = () => { if (ready) onJoin?.(code); };

  return (
    <main className="menu-scr" style={{ width, height, paddingBottom: 20 }}>
      <header className="home-top">
        <button className="me-chip" aria-label={`Playing as ${name}. Change nickname`} onClick={onNickname}>
          <span className="av">{name.charAt(0).toUpperCase()}</span>Playing as <b>{name}</b>
        </button>
        <button className="icon-btn" aria-label="Settings" onClick={onSettings}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </button>
      </header>

      <section className="hero" aria-label="Chaugadi">
        <div className="dia" role="img" aria-label="Four seats: partners sit opposite each other">
          <span className="tb" />
          <span className="s A" style={{ left: 88, top: 20 }}><SuitIcon suit="H" className="su-H" /></span>
          <span className="s B" style={{ left: 18, top: 75 }}><SuitIcon suit="S" className="su-S" /></span>
          <span className="s B" style={{ left: 158, top: 75 }}><SuitIcon suit="C" className="su-C" /></span>
          <span className="s A you" style={{ left: 88, top: 130 }}><SuitIcon suit="D" /></span>
        </div>
        <h1 className="wordmark">Chaugadi</h1>
        <p className="tagline">Four players, two teams. Bid the Sar, call the Hukum, first to +52.</p>
      </section>

      <div className="home-acts">
        <button className="btn-primary" onClick={onPlayBots}>Play vs bots<span className="chip">{LEVEL[botLevel]}</span></button>
        <button className="btn-secondary" onClick={onCreateRoom}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Create room
        </button>
        <div className="join-row" role="group" aria-label="Join a room with a code">
          <RoomCodeField value={code} onChange={setCode} onSubmit={join} invalid={!!joinError} />
          <button className={`jb${ready ? ' go' : ''}`} aria-disabled={!ready || undefined} onClick={join}>Join</button>
        </div>
        {joinError && <p className="join-msg" role="alert">{joinError}</p>}
        {tutorial && (
          <button className="btn-ghost" onClick={onHowToPlay}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" /></svg>
            How to play<span className="m">· 1 practice hand</span>
          </button>
        )}
      </div>

      {footer?.kind === 'last' && (
        <div className="home-last">
          <i className={`swatch ${footer.team}`} />
          <span>Last match: <b>{footer.names}</b> won <span className="v">+{footer.value}</span></span>
          <button onClick={onFooter}>Rematch</button>
        </div>
      )}
      {footer?.kind === 'resume' && (
        <div className="home-last resume">
          {footer.team && <i className={`swatch ${footer.team}`} />}
          <span aria-label={`Match in progress, round ${footer.round}`}>Round {footer.round} · {footer.team ? <><b>{footer.names}</b> <span className="v">+{footer.value}</span></> : <b>Level</b>}</span>
          <button onClick={onFooter}>Resume</button>
        </div>
      )}
    </main>
  );
}
