import { FeaturesProvider } from '../features';
import { CardSystemBoard } from './CardSystemBoard';
import { FanLab } from './FanLab';
import { SCREEN_RENDERS } from './screenFixtures';
import { AuctionSandbox, YourTurnSandbox } from './TableSandbox';
import './dev.css';

type Entry = { render: () => React.ReactNode; theme?: 'dark' | 'light' };

// Screen references render with chat on so their layout can be checked against the PNGs;
// "<id>~app" renders the same screen as the app ships it today (chat off).
const screens: Record<string, Entry> = {};
for (const [id, render] of Object.entries(SCREEN_RENDERS)) {
  const theme = id.startsWith('20-') ? 'light' : undefined;
  screens[id] = { render: () => <FeaturesProvider value={{ chat: true, tutorial: true }}>{render()}</FeaturesProvider>, theme };
  screens[`${id}~app`] = { render, theme };
}

/** Dev-only reference renders, served at /dev/<id>. Keys follow docs/screens/<id>.png. */
export const DEV_SCREENS: Record<string, Entry> = {
  '31-card-system': { render: () => <CardSystemBoard /> },
  '10-table': { render: () => <YourTurnSandbox /> },
  '06-table': { render: () => <AuctionSandbox /> },
  '20-table': { render: () => <YourTurnSandbox />, theme: 'light' },
  '21-table': { render: () => <YourTurnSandbox width={360} height={800} /> },
  'fan-lab': { render: () => <FanLab /> },
  ...screens,
};
