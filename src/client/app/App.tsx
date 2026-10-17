import { Suspense, lazy, useMemo, useState } from 'react';
import { cleanNickname } from '../../shared/nickname';
import { isRoomCode } from '../../shared/roomCode';
import { standing } from '../../engine/types';
import { loadLastResult, loadSolo } from '../drivers/save';
import { newSoloMatch } from '../drivers/session';
import { NicknameSheet } from '../components/NicknameSheet';
import { apiMessage, createRoom, roomInfo } from '../net/guest';
import { HomeScreen, type HomeFooter } from '../screens/HomeScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TARGET_SCORE, useSettings } from '../stores/settings';
import { useRoute, type Route } from './router';
import { SoloGame } from './SoloGame';
import { Tutorial } from './Tutorial';

const DevScreen = import.meta.env.DEV ? lazy(() => import('../dev/DevScreen')) : null;
// Online play loads on demand: the socket client stays out of the first paint.
const OnlineRoom = lazy(() => import('./OnlineRoom'));

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
      return <Suspense fallback={null}><OnlineRoom key={route.code} code={route.code} {...size} onHome={() => go({ name: 'home' })} /></Suspense>;
    case 'play':
      return <SoloGame {...size} onHome={() => go({ name: 'home' })} onSettings={() => go({ name: 'settings' })} />;
    case 'learn':
      return <Tutorial {...size} onExit={() => go({ name: 'home' }, true)} />;
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

type OnlineAction = { kind: 'create' } | { kind: 'join'; code: string };

function Home({ size, go, nickname, botLevel }: { size: { width: number; height: number }; go: (r: Route) => void; nickname: string; botLevel: 'easy' | 'medium' | 'hard' }) {
  const footer = useMemo(homeFooter, []);
  const target = useSettings((s) => TARGET_SCORE[s.matchLength]);
  const setSetting = useSettings((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<OnlineAction | null>(null);
  const fresh = () => { newSoloMatch(); go({ name: 'play' }); };

  /** Create or join a room; asks for a nickname first when there is none. */
  const online = async (act: OnlineAction, name = nickname) => {
    if (busy) return;
    if (!cleanNickname(name)) { setAsking(act); return; }
    setError(null);
    setBusy(true);
    try {
      if (act.kind === 'create') {
        go({ name: 'room', code: await createRoom(name) });
        return;
      }
      const code = act.code.toUpperCase();
      const info = isRoomCode(code) ? await roomInfo(code) : { exists: false };
      if (!info.exists) setError(`No open room with the code ${code}.`);
      else go({ name: 'room', code });
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <HomeScreen
        {...size}
        nickname={nickname}
        botLevel={botLevel}
        target={target}
        footer={footer}
        onFooter={() => (footer?.kind === 'resume' ? go({ name: 'play' }) : fresh())}
        onPlayBots={fresh}
        joinError={error ?? undefined}
        onCreateRoom={() => void online({ kind: 'create' })}
        onJoin={(code) => void online({ kind: 'join', code })}
        onSettings={() => go({ name: 'settings' })}
        onNickname={() => go({ name: 'settings' })}
        onHowToPlay={() => go({ name: 'learn' })}
      />
      {asking && (
        <NicknameSheet initial={nickname} onCancel={() => setAsking(null)}
          onDone={(n) => { setSetting('nickname', n); setAsking(null); void online(asking, n); }} />
      )}
    </div>
  );
}
