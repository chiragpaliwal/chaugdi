import { useState } from 'react';
import { Segmented, Switch } from '../components/Controls';
import { SuitIcon } from '../components/SuitIcon';
import { useSettings, type BotLevel, type DeckSetting, type MotionSetting, type ThemeSetting } from '../stores/settings';
import type { CardSizeSetting } from '../table/geometry';

const THEMES = [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }] as const;
const DECKS = [{ value: '4', label: '4-colour' }, { value: '2', label: '2-colour' }] as const;
const SIZES = [{ value: 'S', label: 'S' }, { value: 'M', label: 'M' }, { value: 'L', label: 'L' }] as const;
const MOTIONS = [{ value: 'reduced', label: 'Reduced' }, { value: 'relaxed', label: 'Relaxed' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }] as const;
const BOTS = [{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }] as const;

// Preview card per size: width, height, rank size, suit size (Settings board).
const PREVIEW: Record<CardSizeSetting, [number, number, number, number]> = { S: [56, 78, 16, 20], M: [62, 87, 19, 24], L: [70, 98, 21, 26] };
const MOTION_NOTE: Record<MotionSetting, string> = {
  reduced: 'Fades instead of travel. No shake, no confetti, no loops. On by default when your phone asks for less motion.',
  relaxed: 'All motion 1.25× slower.',
  normal: 'Default timings from the motion spec.',
  fast: 'All motion 0.7× (deal stays ≤ 530 ms).',
};
const BOT_NOTE: Record<BotLevel, string> = { easy: 'Bids safely, makes mistakes', medium: 'Counts trumps, plays fair', hard: 'Tracks every card played' };

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;

/** Screen 02. Every control writes to the settings store; previews update live. */
export function SettingsScreen({ width = 390, height = 844, onBack }: { width?: number; height?: number; onBack?: () => void }) {
  const s = useSettings();
  const [name, setName] = useState(s.nickname);
  const [pw, ph, pr, ps] = PREVIEW[s.cardSize];
  const short = name.trim().length > 0 && name.trim().length < NICKNAME_MIN;

  const saveName = (v: string) => {
    setName(v);
    const t = v.trim();
    if (t.length >= NICKNAME_MIN && t.length <= NICKNAME_MAX) s.set('nickname', t);
  };

  return (
    <main className="menu-scr" style={{ width, height }}>
      <header className="menu-top">
        <button className="icon-btn" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h1>Settings</h1>
      </header>

      <span className="k-label set-k">Look</span>
      <section className="set-grp">
        <div className="set-row"><span className="l">Theme</span><Segmented label="Theme" options={THEMES} value={s.theme} onChange={(v: ThemeSetting) => s.set('theme', v)} /></div>
        <div className="set-row"><span className="l">Deck colours</span><Segmented label="Deck colours" options={DECKS} value={s.deck} onChange={(v: DeckSetting) => s.set('deck', v)} /></div>
        <div className="set-row"><span className="l">Card size</span><Segmented label="Card size" options={SIZES} value={s.cardSize} onChange={(v: CardSizeSetting) => s.set('cardSize', v)} /></div>
        <div className="set-pv" aria-label="Preview">
          {(['S', 'H', 'D', 'C'] as const).map((x) => <SuitIcon key={x} suit={x} className={`su-${x}`} label={{ S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' }[x]} />)}
          <span style={{ flex: 1 }} />
          <span className="pv-card sf-D" style={{ width: pw, height: ph }} role="img" aria-label="Preview card, Queen of diamonds">
            <span className="r" style={{ fontSize: pr }}>Q</span>
            <SuitIcon suit="D" style={{ width: ps, height: ps }} />
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{pw} px</span>
        </div>
      </section>

      <span className="k-label set-k">Feel</span>
      <section className="set-grp">
        <div className="set-row"><span className="l">Sound</span><Switch label="Sound" checked={s.sound} onChange={(v) => s.set('sound', v)} /></div>
        <div className="set-row"><span className="l">Haptics<small>Your turn, tricks won, contract result</small></span><Switch label="Haptics" checked={s.haptics} onChange={(v) => s.set('haptics', v)} /></div>
        <div className="set-row stack"><span className="l">Animation</span><Segmented label="Animation speed" full options={MOTIONS} value={s.motion} onChange={(v: MotionSetting) => s.set('motion', v)} /></div>
        <p className="set-note">{MOTION_NOTE[s.motion]}</p>
      </section>

      <span className="k-label set-k">Bots</span>
      <section className="set-grp">
        <div className="set-row"><span className="l">Difficulty<small>{BOT_NOTE[s.botLevel]}</small></span><Segmented label="Bot difficulty" options={BOTS} value={s.botLevel} onChange={(v: BotLevel) => s.set('botLevel', v)} /></div>
      </section>

      <span className="k-label set-k">You</span>
      <section className="set-grp">
        <div className="set-row">
          <label className="name-inp">
            <span className="lbl">Name</span>
            <input aria-label="Nickname" aria-invalid={short || undefined} maxLength={NICKNAME_MAX} value={name} placeholder="2 to 16 letters" onChange={(e) => saveName(e.target.value)} />
            <span className="c">{name.length}/{NICKNAME_MAX}</span>
          </label>
        </div>
        {short && <p className="set-note" role="alert" style={{ marginTop: 0 }}>At least {NICKNAME_MIN} characters.</p>}
      </section>
    </main>
  );
}
