// Whole games played by bots alone: catches stuck states and rule errors in the bot logic and engines.
import { describe, expect, it } from 'vitest';
import { serverGames } from './server';
import { defaultQuestions } from './kalak/questions';
import { defaultPuzzles } from './picture-puzzle/puzzles';
import words from './passnames/words.json';
import type { Ctx, GameContent, GameModule, Seat } from './types';
import { isGameError } from './types';

const content: GameContent = { words, pictures: [], agentPhotos: [], questions: defaultQuestions, puzzles: defaultPuzzles, roleArt: {}, cardBack: null };

function play(game: GameModule, seats: Seat[], settings: Record<string, unknown>, isOver: (s: any) => boolean, nudge: (s: any) => unknown) {
  let seed = 42;
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const ctx = (): Ctx => ({ rng, now: 0, adminId: seats[0]!.id });
  let state = game.setup(game.parseSettings(settings) as never, seats, content, ctx());
  for (let step = 0; step < 4000 && !isOver(state); step++) {
    let moved = false;
    for (const seat of seats) {
      const action = game.bot!(game.view(state, { kind: 'player', seatId: seat.id }, ctx()) as never, seat.id, rng);
      if (!action) continue;
      const next = game.transition(state, seat.id, action, ctx());
      if (isGameError(next)) throw new Error(`${seat.id} ${JSON.stringify(action)} → ${next.error}`);
      state = next;
      moved = true;
    }
    // The human admin's part: continue / next when bots are waiting on it.
    if (!moved) {
      const a = nudge(state);
      if (!a) throw new Error('stuck');
      const next = game.transition(state, seats[0]!.id, a, ctx());
      if (isGameError(next)) throw new Error(`admin ${JSON.stringify(a)} → ${next.error}`);
      state = next;
    }
  }
  return state;
}

const seat = (id: string, team: string | null = null, role: string | null = null): Seat => ({ id, name: id, team, role, portrait: null });

describe('bots can finish every game on their own', () => {
  it('passnames', () => {
    const seats = [seat('b1', 'blue', 'spy'), seat('b2', 'blue', 'agent'), seat('r1', 'red', 'spy'), seat('r2', 'red', 'agent')];
    const s = play(serverGames.passnames!, seats, {}, (s) => s.phase === 'finished', () => null);
    expect(s.winner).toBeTruthy();
  });

  it('mafia', () => {
    const seats = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => seat(id, null, 'player'));
    const s = play(serverGames.mafia!, seats, {}, (s) => s.phase === 'over', (s) => (s.phase === 'dawn' || s.phase === 'verdict' ? { type: 'CONTINUE' } : { type: 'CLOSE' }));
    expect(s.winner).toBeTruthy();
  });

  it('kalak', () => {
    const seats = ['a', 'b', 'c', 'd'].map((id) => seat(id));
    const s = play(serverGames.kalak!, seats, { rounds: 5 }, (s) => s.phase === 'final', (s) => (s.phase === 'reveal' ? { type: 'NEXT' } : { type: 'SKIP' }));
    expect(s.round).toBe(5);
  });

  it('picture puzzle with a bot host', () => {
    const seats = [seat('h', null, 'host'), seat('f', 'falcons', 'player'), seat('w', 'wolves', 'player')];
    const s = play(serverGames['picture-puzzle']!, seats, { rounds: 6 }, (s) => s.phase === 'final', () => ({ type: 'REVEAL' }));
    expect(s.index).toBe(5);
  });
});
