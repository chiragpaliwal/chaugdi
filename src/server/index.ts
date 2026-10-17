// Worker entry (GDD §10.2): /api/* is the REST API, /parties/game-room/:code is the room
// socket, everything else is the SPA from static assets.

import { routePartykitRequest } from 'partyserver';
import { isRoomCode } from '../shared/roomCode';
import { handleApi } from './api';

export { GameRoom } from './game-room';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(req, env);
      } catch (e) {
        console.error('api error', e);
        return Response.json({ error: 'SERVER_ERROR' }, { status: 500 });
      }
    }
    if (url.pathname.startsWith('/parties/')) {
      const routed = await routePartykitRequest(req, env, {
        // Only real room codes reach a Durable Object; nothing else creates one.
        onBeforeConnect: (_req, lobby) => (lobby.className === 'GameRoom' && isRoomCode(lobby.name) ? undefined : new Response('Not found', { status: 404 })),
        onBeforeRequest: () => new Response('Not found', { status: 404 }),
      });
      if (routed) return routed;
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
