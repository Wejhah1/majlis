import { routePartykitRequest } from 'partyserver';
import { games } from '../src/games/registry';
import { serverGames } from '../src/games/server';
import { RoomError, normalizeCode, randomCode, validCode } from '../src/platform/room/core';
import { handleAdmin } from './admin';
import { getGroup, getRoster } from './db';
import { errorResponse, noStore, readJSON, sameOrigin } from './http';
import { serveMedia } from './media';
import { rateLimit } from './rate-guard';

export { RoomsServer } from './room-server';
export { RateGuardServer } from './rate-guard';

async function handleRooms(request: Request, env: Env, path: string): Promise<Response> {
  try {
    if (!sameOrigin(request)) throw new RoomError('ORIGIN_DENIED', 403);
    if (request.method !== 'POST') throw new RoomError('METHOD_NOT_ALLOWED', 405);
    const data = await readJSON(request);
    const invoke = (code: string, action: 'create' | 'join') =>
      env.Rooms.get(env.Rooms.idFromName(code)).fetch(
        new Request(`https://room.internal/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-partykit-room': code },
          body: JSON.stringify(data),
        }),
      );
    if (path === '/api/rooms') {
      if (!serverGames[String(data.gameId)]) throw new RoomError('GAME_NOT_FOUND', 404);
      const limited = await rateLimit(request, env, 'room-create');
      if (limited) return limited;
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await invoke(randomCode(), 'create');
        if (response.status !== 409) return response;
        const result = (await response.clone().json()) as { error?: string };
        if (result.error !== 'ROOM_EXISTS') return response;
      }
      throw new RoomError('SERVER_ERROR', 503);
    }
    const match = path.match(/^\/api\/rooms\/([^/]+)\/join$/);
    if (!match) throw new RoomError('NOT_FOUND', 404);
    const code = normalizeCode(match[1]);
    if (!validCode(code)) throw new RoomError('CODE_INVALID');
    return await invoke(code, 'join');
  } catch (error) {
    return errorResponse(error);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/rooms' || path.startsWith('/api/rooms/')) return handleRooms(request, env, path);

    const socket = path.match(/^\/parties\/rooms\/([^/]+)$/);
    if (socket) {
      if (!validCode(socket[1])) return new Response('Not found', { status: 404 });
      if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
      return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 });
    }

    if (path.startsWith('/api/admin/')) return handleAdmin(request, env, path);
    if (path.startsWith('/media/')) return serveMedia(request, env, ctx, path);

    try {
      if (path === '/api/health') return Response.json({ ok: true, games: games.map((g) => g.id) }, { headers: noStore });
      if (path === '/api/group') return Response.json({ ok: true, group: await getGroup(env) }, { headers: noStore });
      if (path === '/api/roster') return Response.json({ ok: true, members: await getRoster(env) }, { headers: noStore });
    } catch (error) {
      return errorResponse(error);
    }

    return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
