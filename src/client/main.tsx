import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { bindSettingsToDocument } from './stores/settings';
import './styles/index.css';

bindSettingsToDocument();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
