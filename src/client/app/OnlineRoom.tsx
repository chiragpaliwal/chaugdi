// Online room page (GDD §4.2, milestone 6): /r/CODE. RemoteDriver → lobby, or the same
// MatchTable as solo play with presence, timers, reconnect banners and the pause vote.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Seat } from '../../engine/types';
import type { ErrorCode, RoomView } from '../../shared/protocol';
import { cleanNickname } from '../../shared/nickname';
import { Banner, Toast } from '../components/GameParts';
import { NicknameSheet } from '../components/NicknameSheet';
import { PauseVote } from '../components/PauseVote';
import type { RoomSnapshot } from '../drivers/remote';
import { animOf, leaveRoom, useRemoteSession, useRoomSnapshot, type RemoteSession } from '../drivers/remoteSession';
import { LobbyScreen, type LobbyView } from '../screens/LobbyScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useSettings } from '../stores/settings';
import { decorateOnline, newlyDropped, onlineLayer, type OnlineCtx } from '../view/online';
import { MatchTable } from './SoloGame';

interface Props {
  code: string;
  width: number;
  height: number;
  onHome: () => void;
}

const TOAST_MS = 6000;
const ERROR_MS = 4000;

/** Re-renders every `ms` while `on`; returns the client clock. */
function useNow(ms: number, on = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms, on]);
  return on ? Date.now() : now;
}

export default function OnlineRoom(props: Props) {
  const nickname = useSettings((s) => s.nickname);
  const setSetting = useSettings((s) => s.set);
  if (!cleanNickname(nickname)) {
    return (
      <div style={{ position: 'relative', width: props.width, height: props.height }}>
        <RoomMessage {...props} title={`Room ${props.code}`} body="Pick a nickname to join." />
        <NicknameSheet initial={nickname} onDone={(n) => setSetting('nickname', n)} onCancel={props.onHome} />
      </div>
    );
  }
  return <RoomPage {...props} />;
}

function RoomPage({ code, width, height, onHome }: Props) {
  const session = useRemoteSession(code);
  const snap = useRoomSnapshot(session);
  const [settings, setSettings] = useState(false);
  const leave = () => { leaveRoom(session); onHome(); };
  const size = { width, height };

  if (settings) return <SettingsScreen {...size} onBack={() => setSettings(false)} />;
  if (snap.closed) {
    const msg = {
      idle: ['This room has closed', 'Nobody was here for 30 minutes, so the room shut down. Create a new one from Home.'],
      notFound: ['No room with that code', `Check the code ${code} with whoever invited you.`],
      unauthorized: ['Couldn’t sign you in', 'Go back Home and try again.'],
      left: ['You left the room', ''],
    }[snap.closed];
    return <RoomMessage {...size} code={code} title={msg[0]!} body={msg[1]!} onHome={onHome} />;
  }
  const room = snap.room;
  if (!room) {
    const offline = snap.conn === 'reconnecting';
    return <RoomMessage {...size} code={code} title={`Joining room ${code}`} spin
      body={offline ? 'Can’t reach the server yet. Still trying…' : 'Connecting…'} onHome={leave} />;
  }
  if (room.you === null) {
    return <RoomMessage {...size} code={code} title="This room is full"
      body={room.status === 'lobby' || room.status === 'starting' ? 'All four seats are taken by players.' : 'The match there has already started.'} onHome={leave} />;
  }
  const inMatch = snap.hasView && (room.status === 'playing' || room.status === 'over');
  if (!inMatch) return <OnlineLobby session={session} snap={snap} room={room} {...size} onLeave={leave} />;
  return <OnlineTable session={session} snap={snap} room={room} {...size} onLeave={leave} onSettings={() => setSettings(true)} />;
}

// ---------------------------------------------------------------- lobby (03)

const ERRORS: Partial<Record<ErrorCode, string>> = {
  NOT_READY: 'Fill every seat and wait until everyone is ready.',
  NOT_HOST: 'Only the host can change that.',
  SEAT_TAKEN: 'That seat is taken.',
  RATE_LIMITED: 'Slow down a little.',
};

function OnlineLobby({ session, snap, room, width, height, onLeave }: { session: RemoteSession; snap: RoomSnapshot; room: RoomView; width: number; height: number; onLeave: () => void }) {
  const d = session.driver;
  const you = room.you!;
  const err = snap.error;
  const now = useNow(250, room.startingAt !== null || !!err);
  const seats = {} as LobbyView['seats'];
  for (const s of [0, 1, 2, 3] as Seat[]) {
    const p = room.seats[s];
    seats[s] = p && { name: p.name, isBot: p.isBot, ready: p.ready, isHost: p.isHost, connected: p.connected };
  }
  const v: LobbyView = {
    code: room.code,
    url: `${window.location.origin}/r/${room.code}`,
    you,
    seats,
    turnSeconds: room.settings.turnSeconds,
    botLevel: room.settings.botLevel,
    matchLength: room.settings.matchLength,
    startingIn: room.startingAt === null ? null : Math.max(0, Math.ceil((d.local(room.startingAt) - now) / 1000)),
  };
  return (
    <LobbyScreen
      v={v} width={width} height={height}
      error={err && now - err.at < ERROR_MS ? (ERRORS[err.code] ?? 'That didn’t work. Try again.') : null}
      onLeave={onLeave}
      onFillBot={(seat) => d.message({ type: 'fillBot', seat })}
      onRemoveBot={(seat) => d.message({ type: 'removeBot', seat })}
      onPartner={(seat) => d.message({ type: 'swapTeams', a: seat, b: ((you + 2) % 4) as Seat })}
      onTurnSeconds={(turnSeconds) => d.message({ type: 'hostSettings', turnSeconds })}
      onBotLevel={(botLevel) => d.message({ type: 'hostSettings', botLevel })}
      onMatchLength={(matchLength) => d.message({ type: 'hostSettings', matchLength })}
      onReady={(ready) => d.message({ type: 'setReady', ready })}
      onStart={() => d.message({ type: 'start' })}
      onCancel={() => d.message({ type: 'cancelStart' })}
    />
  );
}

// ---------------------------------------------------------------- table (05–15)

function OnlineTable({ session, snap, room, width, height, onLeave, onSettings }: { session: RemoteSession; snap: RoomSnapshot; room: RoomView; width: number; height: number; onLeave: () => void; onSettings: () => void }) {
  const anim = animOf(session);
  const a = useSyncExternalStore(anim.subscribe, anim.getSnapshot);
  const now = useNow(250);
  const d = session.driver;

  // "Ben left. A bot is playing Ben's hand…" for a few seconds after a seat goes to a bot.
  const prevRoom = useRef<RoomView | null>(null);
  const [dropped, setDropped] = useState<{ seat: Seat; at: number } | null>(null);
  useEffect(() => {
    const seat = newlyDropped(prevRoom.current, room)[0];
    prevRoom.current = room;
    if (seat !== undefined) setDropped({ seat, at: Date.now() });
  }, [room]);

  const ctx: OnlineCtx = {
    room, view: a.view, conn: snap.conn, droppedAt: snap.droppedAt, now, skew: snap.skew,
    dropped: dropped && now - dropped.at < TOAST_MS ? dropped.seat : null,
    onImBack: () => d.message({ type: 'imBack' }),
  };
  const layer = onlineLayer(ctx);
  const vote = (choice: 'wait' | 'bot') => { if (layer.vote) d.message({ type: 'vote', seat: layer.vote.seat, choice }); };
  const host = Object.values(room.seats).find((s) => s?.isHost);
  const isHost = room.seats[room.you!]?.isHost;

  return (
    <MatchTable
      width={width} height={height}
      session={{ driver: d, anim }} snap={a}
      autoContinue={false}
      decorate={(s) => decorateOnline(s, ctx, layer)}
      onVote={vote}
      rematchWaiting={isHost ? undefined : `Waiting for ${host?.name ?? 'the host'} to rematch`}
      onHome={onLeave} onSettings={onSettings}
      homeLabel="Leave room · a bot takes your seat"
    >
      {(screen) => (screen.kind === 'play' || screen.kind === 'summary' || screen.kind === 'result' ? null : (
        <>
          {layer.banner && <div className="online-top"><Banner {...layer.banner} /></div>}
          {(layer.vote || layer.toast) && (
            <div className="online-bottom">
              {layer.vote && <PauseVote v={layer.vote} onVote={vote} />}
              {layer.toast && <Toast {...layer.toast} />}
            </div>
          )}
        </>
      ))}
    </MatchTable>
  );
}

// ---------------------------------------------------------------- messages

function RoomMessage({ width, height, code, title, body, spin, onHome }: { width: number; height: number; code?: string; title: string; body: string; spin?: boolean; onHome: () => void }) {
  return (
    <main className="menu-scr room-msg" style={{ width, minHeight: height }} aria-busy={spin || undefined}>
      <header className="lobby-top">
        <button className="icon-btn" aria-label="Home" onClick={onHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h1>Chaugadi</h1>{code && <span className="dim">· room {code}</span>}
      </header>
      <section className="room-msg-body" role="status">
        {spin && <span className="sp" aria-hidden="true" />}
        <h2>{title}</h2>
        {body && <p>{body}</p>}
      </section>
      <button className="btn-secondary" onClick={onHome}>Home</button>
    </main>
  );
}
