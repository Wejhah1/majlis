import { describe, expect, it } from 'vitest';
import { game, type State } from './index';
import { defaultPuzzles } from './puzzles';
import type { Ctx, GameContent, Seat } from '../types';
import { isGameError } from '../types';

const seats: Seat[] = [
  { id: 'h', name: 'Host', team: null, role: 'host', portrait: null },
  { id: 'f1', name: 'F1', team: 'falcons', role: 'player', portrait: null },
  { id: 'w1', name: 'W1', team: 'wolves', role: 'player', portrait: null },
];
const content: GameContent = { words: [], pictures: [], questions: [], puzzles: defaultPuzzles, roleArt: {}, cardBack: null };
const ctx = (): Ctx => {
  let s = 5;
  return { now: 0, adminId: 'h', rng: () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646 };
};
const run = (s: State, id: string, action: unknown) => {
  const next = game.transition(s, id, action, ctx());
  if (isGameError(next)) throw new Error(next.error);
  return next;
};

describe('picture puzzle engine', () => {
  it('needs a host and both teams', () => {
    expect(game.seatRules(seats.slice(1), game.defaultSettings)).toEqual({ error: 'HOST_REQUIRED' });
    expect(game.seatRules(seats.slice(0, 2), game.defaultSettings)).toEqual({ error: 'TEAM_EMPTY_WOLVES' });
    expect(game.seatRules(seats, game.defaultSettings)).toBe(true);
  });

  it('only the host sees the answer before it is revealed', () => {
    const s = game.setup(game.defaultSettings, seats, content, ctx());
    expect(game.view(s, { kind: 'player', seatId: 'h' }, ctx()).answer).toBe(s.puzzles[0]!.answer);
    expect(game.view(s, { kind: 'player', seatId: 'f1' }, ctx()).answer).toBeNull();
    expect(game.view(s, { kind: 'screen' }, ctx()).answer).toBeNull();
  });

  it('first buzz wins; a wrong answer locks that team out; award scores the buzzing team', () => {
    let s = game.setup(game.defaultSettings, seats, content, ctx());
    s = run(s, 'f1', { type: 'BUZZ' });
    s = run(s, 'w1', { type: 'BUZZ' });
    expect(s.buzz?.team).toBe('falcons');
    s = run(s, 'h', { type: 'WRONG' });
    expect(game.transition(s, 'f1', { type: 'BUZZ' }, ctx())).toEqual({ error: 'LOCKED_OUT' });
    s = run(s, 'w1', { type: 'BUZZ' });
    s = run(s, 'h', { type: 'AWARD' });
    expect(s.scores.wolves).toBe(10);
    expect(s.event).toMatchObject({ kind: 'award', team: 'wolves', points: 10 });
    expect(s.phase).toBe('answer');
  });

  it('players cannot award points', () => {
    const s = game.setup(game.defaultSettings, seats, content, ctx());
    expect(game.transition(s, 'f1', { type: 'AWARD', team: 'falcons' }, ctx())).toEqual({ error: 'HOST_ONLY' });
  });

  it('a hint halves the points; NEXT ends after the last puzzle', () => {
    let s = game.setup({ rounds: 2, points: 10 }, seats, { ...content, puzzles: defaultPuzzles.filter((p) => p.hint) }, ctx());
    s = run(s, 'h', { type: 'HINT' });
    s = run(s, 'h', { type: 'AWARD', team: 'falcons' });
    expect(s.scores.falcons).toBe(5);
    s = run(s, 'h', { type: 'NEXT' });
    s = run(s, 'h', { type: 'NEXT' });
    expect(s.phase).toBe('final');
  });
});
