import type { GameClient } from './client-types';

// Views are code-split: a room downloads only the game it is playing.
const loaders = import.meta.glob<{ client: GameClient }>('./*/client.tsx');

const cache = new Map<string, Promise<GameClient>>();

export function loadGameClient(id: string): Promise<GameClient> {
  let p = cache.get(id);
  if (!p) {
    const loader = loaders[`./${id}/client.tsx`];
    p = loader ? loader().then((m) => m.client) : Promise.reject(new Error('GAME_NOT_FOUND'));
    cache.set(id, p);
  }
  return p;
}
