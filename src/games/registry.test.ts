import { describe, expect, it } from 'vitest';
import { games } from './registry';

describe('game registry', () => {
  it('discovers every game folder', () => {
    expect(games.map((g) => g.id)).toEqual(['passnames', 'mafia', 'kalak', 'picture-puzzle']);
  });

  it('gives every game both languages and a sane player range', () => {
    for (const g of games) {
      expect(g.name.ar && g.name.en && g.tagline.ar && g.tagline.en).toBeTruthy();
      expect(g.players[0]).toBeGreaterThanOrEqual(2);
      expect(g.players[1]).toBeGreaterThanOrEqual(g.players[0]);
      expect(g.surfaces.length).toBeGreaterThan(0);
    }
  });
});
