import type { GameModule } from './types';

// Every folder with an index.ts is a playable game (rules only, no React).
const modules = import.meta.glob<{ game: GameModule }>('./*/index.ts', { eager: true });

export const serverGames: Record<string, GameModule> = Object.fromEntries(
  Object.values(modules).map((m) => [m.game.meta.id, m.game]),
);
