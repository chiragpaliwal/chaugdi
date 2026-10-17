// Local stand-in for the room server (GDD §10) so the lobby can be used before the
// GameRoom Durable Object exists. Replace with RemoteDriver lobby messages.

import { useEffect, useState } from 'react';
import type { Seat } from '../../engine/types';
import type { LobbyView } from '../screens/LobbyScreen';
import { START_SECONDS } from '../screens/LobbyScreen';
import type { BotLevel } from '../stores/settings';

const BOT_NAMES = ['Dev', 'Mira', 'Kiran', 'Ravi'];

export function useDemoLobby(code: string, nickname: string, botLevel: BotLevel, onDeal: () => void) {
  const [v, setV] = useState<LobbyView>(() => ({
    code,
    url: `${window.location.origin}/r/${code}`,
    you: 0,
    seats: {
      0: { name: nickname || 'You', isBot: false, ready: true, isHost: true },
      1: { name: 'Ben', isBot: false, ready: false, isHost: false },
      2: { name: 'Asha', isBot: false, ready: true, isHost: false },
      3: null,
    },
    turnSeconds: 20,
    botLevel,
    startingIn: null,
  }));

  // Ben gets ready a moment after the table fills, as a human would.
  useEffect(() => {
    if (!v.seats[3] || v.seats[1]?.ready) return;
    const t = window.setTimeout(() => setV((s) => ({ ...s, seats: { ...s.seats, 1: s.seats[1] && { ...s.seats[1], ready: true } } })), 1200);
    return () => window.clearTimeout(t);
  }, [v.seats]);

  useEffect(() => {
    if (v.startingIn == null) return;
    if (v.startingIn <= 0) { onDeal(); return; }
    const t = window.setTimeout(() => setV((s) => ({ ...s, startingIn: s.startingIn == null ? null : s.startingIn - 1 })), 1000);
    return () => window.clearTimeout(t);
  }, [v.startingIn, onDeal]);

  return {
    v,
    fillBot: (seat: Seat) => setV((s) => {
      const used = Object.values(s.seats).map((p) => p?.name);
      const name = BOT_NAMES.find((n) => !used.includes(n)) ?? 'Bot';
      return { ...s, seats: { ...s.seats, [seat]: { name, isBot: true, ready: true, isHost: false } } };
    }),
    partner: (seat: Seat) => setV((s) => {
      const opposite = ((s.you + 2) % 4) as Seat;
      if (seat === opposite) return s;
      return { ...s, seats: { ...s.seats, [opposite]: s.seats[seat], [seat]: s.seats[opposite] } };
    }),
    turnSeconds: (t: 10 | 20 | 30) => setV((s) => ({ ...s, turnSeconds: t })),
    botLevel: (l: BotLevel) => setV((s) => ({ ...s, botLevel: l })),
    start: () => setV((s) => ({ ...s, startingIn: START_SECONDS })),
    cancel: () => setV((s) => ({ ...s, startingIn: null })),
  };
}

export { newRoomCode } from '../../shared/roomCode';
