import { games } from '../src/games/registry';

// Phase 0: health + game list. Phase 1 mounts the Rooms Durable Object under /parties/*.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, games: games.map((g) => ({ id: g.id, status: g.status })) });
    }

    return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  },
} satisfies ExportedHandler;
