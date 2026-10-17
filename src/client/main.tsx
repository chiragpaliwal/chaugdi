import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { bindAudioUnlock, setVolume } from './audio/sounds';
import { bindGuestRename } from './net/guest';
import { bindSettingsToDocument, useSettings } from './stores/settings';
import './styles/index.css';

bindSettingsToDocument();
bindGuestRename();
// Audio starts on the first gesture (GDD §12.3).
bindAudioUnlock();
setVolume(useSettings.getState().volume / 100);
useSettings.subscribe((s) => setVolume(s.volume / 100));

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Offline shell for solo play (GDD §13). Production only: dev serves modules live.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
