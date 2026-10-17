import { Suspense, lazy, useCallback, useMemo } from 'react';
import { standing } from '../../engine/types';
import { loadLastResult, loadSolo } from '../drivers/save';
import { newSoloMatch } from '../drivers/session';
import { HomeScreen, type HomeFooter } from '../screens/HomeScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TARGET_SCORE, useSettings } from '../stores/settings';
import { newRoomCode, useDemoLobby } from './demoLobby';
import { useRoute, type Route } from './router';
import { SoloGame } from './SoloGame';

const DevScreen = import.meta.env.DEV ? lazy(() => import('../dev/DevScreen')) : null;

/** Phone-width column centred on larger screens; 100dvh (GDD §13). */
function Frame({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) {
  const width = Math.min(window.innerWidth, 430);
  const height = Math.max(window.innerHeight, 640);
  return <div style={{ display: 'flex', justifyContent: 'center', minHeight: '100dvh' }}>{children({ width, height })}</div>;
}

export function App() {
  const [route, go] = useRoute();
  if (route.name === 'dev' && DevScreen) {
    return <Suspense fallback={null}><DevScreen id={route.id} /></Suspense>;
  }
  return <Frame>{(size) => <Page route={route} go={go} size={size} />}</Frame>;
}

function Page({ route, go, size }: { route: Route; go: (r: Route, replace?: boolean) => void; size: { width: number; height: number } }) {
  const nickname = useSettings((s) => s.nickname);
  const botLevel = useSettings((s) => s.botLevel);
  switch (route.name) {
    case 'settings':
      return <SettingsScreen {...size} onBack={() => (window.history.length > 1 ? window.history.back() : go({ name: 'home' }, true))} />;
    case 'room':
      return <Room code={route.code} go={go} size={size} nickname={nickname} botLevel={botLevel} />;
    case 'play':
      return <SoloGame {...size} onHome={() => go({ name: 'home' })} onSettings={() => go({ name: 'settings' })} />;
    default:
      return <Home size={size} go={go} nickname={nickname} botLevel={botLevel} />;
  }
}

/** Resume banner for a saved solo match, else the last result (GDD §5 Home). */
function homeFooter(): HomeFooter | undefined {
  const saved = loadSolo();
  if (saved && saved.state.phase !== 'MATCH_END') {
    const s = standing(saved.state.ledger, 'A');
    const team = s > 0 ? 'A' : s < 0 ? 'B' : null;
    const n = saved.players.names;
    return { kind: 'resume', team, names: team === 'A' ? `${n[0]} & ${n[2]}` : `${n[1]} & ${n[3]}`, value: Math.abs(s), round: saved.state.round?.roundNo ?? 1 };
  }
  const last = loadLastResult();
  return last ? { kind: 'last', ...last } : undefined;
}

function Home({ size, go, nickname, botLevel }: { size: { width: number; height: number }; go: (r: Route) => void; nickname: string; botLevel: 'easy' | 'medium' | 'hard' }) {
  const footer = useMemo(homeFooter, []);
  const target = useSettings((s) => TARGET_SCORE[s.matchLength]);
  const fresh = () => { newSoloMatch(); go({ name: 'play' }); };
  return (
    <HomeScreen
      {...size}
      nickname={nickname}
      botLevel={botLevel}
      target={target}
      footer={footer}
      onFooter={() => (footer?.kind === 'resume' ? go({ name: 'play' }) : fresh())}
      onPlayBots={fresh}
      onCreateRoom={() => go({ name: 'room', code: newRoomCode() })}
      onJoin={(code) => go({ name: 'room', code })}
      onSettings={() => go({ name: 'settings' })}
      onNickname={() => go({ name: 'settings' })}
    />
  );
}

function Room({ code, go, size, nickname, botLevel }: { code: string; go: (r: Route) => void; size: { width: number; height: number }; nickname: string; botLevel: 'easy' | 'medium' | 'hard' }) {
  const onDeal = useCallback(() => go({ name: 'play' }), [go]);
  const lobby = useDemoLobby(code, nickname, botLevel, onDeal);
  return (
    <LobbyScreen
      {...size}
      v={lobby.v}
      onLeave={() => go({ name: 'home' })}
      onFillBot={lobby.fillBot}
      onPartner={lobby.partner}
      onTurnSeconds={lobby.turnSeconds}
      onBotLevel={lobby.botLevel}
      onStart={lobby.start}
      onCancel={lobby.cancel}
    />
  );
}
