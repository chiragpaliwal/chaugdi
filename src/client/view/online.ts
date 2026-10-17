// Online table extras (GDD §10.6, screen 13) on top of toTableView: who is held or
// replaced by a bot, the turn timer from the server deadline, your own reconnect and AFK
// banners, the pause vote and the round-summary ready dots.

import { SEATS, teamOf, type PlayerView, type Seat, type Team } from '../../engine/types';
import { ONLINE } from '../../shared/constants';
import type { RoomView, SeatControl } from '../../shared/protocol';
import type { BannerProps } from '../components/GameParts';
import { clock, type PauseVoteView } from '../components/PauseVote';
import type { ConnState } from '../drivers/remote';
import type { TableScreen } from './adapter';
import type { SeatView } from './types';

export interface OnlineToast { team: Team; title: string; body: string }

export interface OnlineCtx {
  room: RoomView;
  view: PlayerView;
  conn: ConnState;
  /** Client ms the socket dropped. */
  droppedAt: number | null;
  /** Client ms now. */
  now: number;
  /** serverNow − client now. */
  skew: number;
  /** A seat that just went to a bot (shown for a few seconds). */
  dropped: Seat | null;
  onImBack: () => void;
}

/** What goes over the table: inline on the play screen (13), floating on the others. */
export interface OnlineLayer {
  banner?: BannerProps;
  /** Your own input is off (reconnecting). */
  held: boolean;
  vote?: PauseVoteView & { seat: Seat };
  toast?: OnlineToast;
}

const controlOf = (room: RoomView, s: Seat): SeatControl => room.seats[s]?.control ?? 'bot';
const botPlays = (c: SeatControl) => c === 'bot' || c === 'afk' || c === 'dropped';

export function onlineLayer(c: OnlineCtx): OnlineLayer {
  const { room, view } = c;
  const you = view.you;
  const vt = (s: Seat): Team => (teamOf(s) === teamOf(you) ? 'A' : 'B');
  const name = (s: Seat) => room.seats[s]?.name ?? `Seat ${s + 1}`;
  const out: OnlineLayer = { held: false };

  if (c.conn !== 'open') {
    const left = Math.ceil((ONLINE.graceMs - (c.now - (c.droppedAt ?? c.now))) / 1000);
    const yourTurn = view.turn === you;
    out.held = true;
    out.banner = left > 0
      ? { text: yourTurn ? 'Reconnecting · your turn is held' : 'Reconnecting · nothing is lost', countdown: clock(left) }
      : { text: 'Reconnecting · a bot plays for you meanwhile' };
    return out;
  }

  const mine = controlOf(room, you);
  if (mine === 'afk' || mine === 'dropped') {
    out.banner = { text: 'A bot is playing for you', spin: false, action: { label: 'I’m back', onClick: c.onImBack } };
  }

  const hold = room.holds.find((h) => h.seat !== you && h.voters > 0);
  if (hold) {
    out.vote = {
      seat: hold.seat, name: name(hold.seat), team: vt(hold.seat),
      secondsLeft: Math.max(0, Math.ceil((hold.until - c.skew - c.now) / 1000)),
      voters: hold.voters, votes: hold.votes, yourVote: hold.yourVote,
    };
  } else if (c.dropped !== null && c.dropped !== you && botPlays(controlOf(room, c.dropped))) {
    const n = name(c.dropped);
    out.toast = { team: vt(c.dropped), title: `${n} left.`, body: `A bot is playing ${n}’s hand until ${n} rejoins.` };
  }
  return out;
}

/** Seat presence and the live turn timer on any table screen. */
export function decorateOnline(screen: TableScreen, c: OnlineCtx, layer: OnlineLayer): TableScreen {
  const { room, view } = c;
  const you = view.you;
  const abs = (s: SeatView) => ((s.seat + you) % 4) as Seat;
  const deadline = view.turnDeadline ? view.turnDeadline - c.skew : null;
  const pct = deadline === null ? null
    : Math.round(Math.min(1, Math.max(0, (deadline - c.now) / (room.settings.turnSeconds * 1000))) * 100);

  const seat = (s: SeatView): SeatView => {
    const ctl = controlOf(room, abs(s));
    const next = { ...s, isBot: s.isBot || botPlays(ctl) };
    if (ctl === 'held' && !s.isMe) { next.connected = false; next.tag = { text: 'held', tone: 'hot' }; }
    if (s.turnProgress !== null && pct !== null) next.turnProgress = pct;
    if (s.isMe && layer.held) next.tag = { text: 'held', tone: 'hot' };
    return next;
  };

  switch (screen.kind) {
    case 'deal5': case 'reveal':
      return { ...screen, v: { ...screen.v, seats: screen.v.seats.map(seat) } } as TableScreen;
    case 'auction':
      return { kind: 'auction', v: { ...screen.v, seats: screen.v.seats.map(seat), yourTurn: screen.v.yourTurn && !layer.held, turnLeft: pct ?? screen.v.turnLeft } };
    case 'hukum':
      return { kind: 'hukum', v: { ...screen.v, seats: screen.v.seats.map(seat), yourCall: screen.v.yourCall && !layer.held } };
    case 'play':
      return {
        kind: 'play',
        v: {
          ...screen.v, seats: screen.v.seats.map(seat),
          held: layer.held || undefined, banner: layer.banner, pauseVote: layer.vote, toast: layer.toast,
          dock: layer.vote ? `Waiting for ${layer.vote.name}` : screen.v.dock,
        },
      };
    case 'summary': {
      // Bots and players who are away never hold up the next deal.
      const order = [0, 1, 2, 3].map((k) => ((you + k) % 4) as Seat);
      const ready = screen.v.ready.map((r, i) => {
        const s = order[i]!;
        return r.isMe ? r : { ...r, ready: room.continued.includes(s) || controlOf(room, s) !== 'human' };
      });
      return { kind: 'summary', v: { ...screen.v, ready } };
    }
    case 'result':
      return screen;
  }
}

/** Seats now played by a bot that a human held a moment ago (for the "Ben left" toast). */
export function newlyDropped(prev: RoomView | null, next: RoomView): Seat[] {
  if (!prev) return [];
  return SEATS.filter((s) => {
    const was = prev.seats[s]?.control;
    const now = next.seats[s]?.control;
    return (was === 'held' || was === 'human') && now === 'dropped';
  });
}
