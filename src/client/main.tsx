import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { bindSettingsToDocument } from './stores/settings';
import './styles/index.css';

bindSettingsToDocument();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Offline shell for solo play (GDD §13). Production only: dev serves modules live.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
