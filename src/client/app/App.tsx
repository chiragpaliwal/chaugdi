import { Suspense, lazy, useCallback } from 'react';
import { HomeScreen } from '../screens/HomeScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useSettings } from '../stores/settings';
import { newRoomCode, useDemoLobby } from './demoLobby';
import { useRoute, type Route } from './router';

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
      // The table needs the rules engine (GDD milestone 1); the screens exist in /dev.
      return (
        <main className="menu-scr" style={{ ...size, justifyContent: 'center', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>The table arrives with the engine</h1>
          <p className="dim" style={{ margin: 0 }}>Every in-game screen can be previewed under /dev.</p>
          <button className="btn-secondary" onClick={() => go({ name: 'home' })}>Home</button>
        </main>
      );
    default:
      return (
        <HomeScreen
          {...size}
          nickname={nickname}
          botLevel={botLevel}
          onPlayBots={() => go({ name: 'play' })}
          onCreateRoom={() => go({ name: 'room', code: newRoomCode() })}
          onJoin={(code) => go({ name: 'room', code })}
          onSettings={() => go({ name: 'settings' })}
          onNickname={() => go({ name: 'settings' })}
        />
      );
  }
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
