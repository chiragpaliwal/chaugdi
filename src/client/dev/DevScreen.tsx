import { useLayoutEffect } from 'react';
import { applySettingsToDocument, type MotionSetting } from '../stores/settings';
import { DEV_SCREENS } from './registry';

const MOTIONS: MotionSetting[] = ['reduced', 'relaxed', 'normal', 'fast'];

export default function DevScreen({ id }: { id: string }) {
  const entry = DEV_SCREENS[id];
  useLayoutEffect(() => {
    // References render with fixed settings, applied straight to <html> so the
    // saved settings in localStorage are left alone.
    const q = new URLSearchParams(window.location.search);
    const motion = q.get('motion') as MotionSetting | null;
    applySettingsToDocument({
      theme: entry?.theme ?? (q.get('theme') === 'light' ? 'light' : 'dark'),
      deck: q.get('deck') === '2' ? '2' : '4',
      motion: motion && MOTIONS.includes(motion) ? motion : 'normal',
    });
  }, [entry]);

  if (!entry) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Dev screens</h1>
        <ul>{Object.keys(DEV_SCREENS).map((k) => <li key={k}><a href={`/dev/${k}`} style={{ color: 'var(--amber)' }}>{k}</a></li>)}</ul>
      </main>
    );
  }
  return <>{entry.render()}</>;
}
