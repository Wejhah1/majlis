import type { GameMeta } from './types';

// Drop a folder with a meta.ts into src/games and it shows up everywhere.
const metaModules = import.meta.glob<{ meta: GameMeta }>('./*/meta.ts', { eager: true });

/** Display order in the picker; games not listed here are appended alphabetically. */
const ORDER = ['passnames', 'mafia', 'kalak', 'picture-puzzle'];

export const games: GameMeta[] = Object.values(metaModules)
  .map((m) => m.meta)
  .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));

function rank(id: string) {
  const i = ORDER.indexOf(id);
  return i === -1 ? ORDER.length : i;
}

export const gameById = (id: string) => games.find((g) => g.id === id);
