import { create } from 'zustand';
import type { CardSizeSetting } from '../table/geometry';

export type ThemeSetting = 'dark' | 'light' | 'system';
export type DeckSetting = '4' | '2';
export type MotionSetting = 'reduced' | 'relaxed' | 'normal' | 'fast';
export type BotLevel = 'easy' | 'medium' | 'hard';
/** Short: first to +26. Standard: first to +52 (GDD §3.7 targetScore). */
export { TARGET_SCORE, type MatchLength } from '../../shared/constants';
import type { MatchLength } from '../../shared/constants';

export interface Settings {
  theme: ThemeSetting;
  deck: DeckSetting;
  cardSize: CardSizeSetting;
  sound: boolean;
  haptics: boolean;
  motion: MotionSetting;
  botLevel: BotLevel;
  matchLength: MatchLength;
  nickname: string;
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const STORAGE_KEY = 'chaugadi.settings.v1';

const media = (q: string) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null);

export function defaultSettings(): Settings {
  return {
    theme: 'dark',
    deck: '4',
    cardSize: 'M',
    sound: true,
    haptics: true,
    // Reduced is pre-selected when the OS asks for less motion (HANDOFF §5, Settings).
    motion: media('(prefers-reduced-motion: reduce)')?.matches ? 'reduced' : 'normal',
    botLevel: 'medium',
    // Careful bots take about 45 rounds to reach +52, about 11 to reach +26.
    matchLength: 'short',
    nickname: '',
  };
}

function load(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Settings>;
    return { ...base, ...saved };
  } catch {
    return base;
  }
}

function save(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable: settings live for this session only (GDD §14)
  }
}

const pick = (s: SettingsStore): Settings => ({
  theme: s.theme, deck: s.deck, cardSize: s.cardSize, sound: s.sound, haptics: s.haptics,
  motion: s.motion, botLevel: s.botLevel, matchLength: s.matchLength, nickname: s.nickname,
});

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set: (key, value) => {
    set({ [key]: value } as Partial<SettingsStore>);
    save(pick(get()));
  },
  reset: () => {
    set(defaultSettings());
    save(pick(get()));
  },
}));

export function resolvedTheme(theme: ThemeSetting): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return media('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
}

/** Mirrors settings onto <html data-theme data-deck data-motion> (HANDOFF §2). */
export function applySettingsToDocument(s: Pick<Settings, 'theme' | 'deck' | 'motion'>, root = document.documentElement) {
  const theme = resolvedTheme(s.theme);
  root.dataset.theme = theme;
  root.dataset.deck = s.deck;
  root.dataset.motion = s.motion;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', theme === 'light' ? '#F2F1EC' : '#0E1014');
}

/** Keep <html> in sync with the store and the OS colour scheme. Returns an unsubscribe. */
export function bindSettingsToDocument(): () => void {
  applySettingsToDocument(useSettings.getState());
  const unsub = useSettings.subscribe((s) => applySettingsToDocument(s));
  const mq = media('(prefers-color-scheme: light)');
  const onScheme = () => applySettingsToDocument(useSettings.getState());
  mq?.addEventListener('change', onScheme);
  return () => {
    unsub();
    mq?.removeEventListener('change', onScheme);
  };
}
