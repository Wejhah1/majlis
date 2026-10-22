import { describe, expect, it } from 'vitest';
import { game, type State } from './index';
import words from './words.json';
import type { Ctx, GameContent, Seat } from '../types';
import { isGameError } from '../types';

const content: GameContent = { words, pictures: [], questions: [], puzzles: [], roleArt: {}, cardBack: null };
const seats: Seat[] = [
  { id: 'bs', name: 'BlueSpy', team: 'blue', role: 'spy', portrait: null },
  { id: 'ba', name: 'BlueAgent', team: 'blue', role: 'agent', portrait: null },
  { id: 'rs', name: 'RedSpy', team: 'red', role: 'spy', portrait: null },
  { id: 'ra', name: 'RedAgent', team: 'red', role: 'agent', portrait: null },
];

function ctx(now = 1000, seed = 7): Ctx {
  let s = seed;
  return { now, adminId: 'bs', rng: () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646 };
}

function run(state: State, seat: string, action: unknown, now = 1000) {
  const next = game.transition(state, seat, action, ctx(now));
  if (isGameError(next)) throw new Error(next.error);
  return next;
}

const spyOf = (s: State) => (s.active === 'blue' ? 'bs' : 'rs');
const agentOf = (s: State) => (s.active === 'blue' ? 'ba' : 'ra');

function standard() {
  return game.setup(game.defaultSettings, seats, content, ctx());
}

describe('passnames engine', () => {
  it('deals a 5×5 board with 9/8/7/1 colours', () => {
    const s = standard();
    expect(s.board).toHaveLength(25);
    const count = (c: string) => s.board.filter((x) => x.color === c).length;
    expect(count(s.active)).toBe(9);
    expect(count('neutral')).toBe(7);
    expect(count('black')).toBe(1);
    expect(s.phase).toBe('clue');
  });

  it('rejects clues that match a hidden word and clues longer than two words', () => {
    const s = standard();
    const word = s.board[0]!.word!.replace(/_/g, ' ');
    expect(game.transition(s, spyOf(s), { type: 'CLUE', text: word, count: 1 }, ctx())).toEqual({ error: 'CLUE_ON_BOARD' });
    expect(game.transition(s, spyOf(s), { type: 'CLUE', text: 'واحد اثنين ثلاثة', count: 1 }, ctx())).toEqual({ error: 'CLUE_INVALID' });
  });

  it('requires a teammate mark before revealing, then scores a correct guess', () => {
    let s = standard();
    s = run(s, spyOf(s), { type: 'CLUE', text: 'تلميح', count: 2 });
    const own = s.board.find((c) => c.color === s.active)!;
    expect(game.transition(s, agentOf(s), { type: 'GUESS', cell: own.id }, ctx())).toEqual({ error: 'SUSPECT_FIRST' });
    s = run(s, agentOf(s), { type: 'MARK', cell: own.id });
    const team = s.active;
    s = run(s, agentOf(s), { type: 'GUESS', cell: own.id });
    expect(s.board[own.id]!.revealed).toBe(true);
    expect(s.active).toBe(team);
    expect(s.good).toBe(1);
  });

  it('revealing the black card loses immediately', () => {
    let s = standard();
    const team = s.active;
    s = run(s, spyOf(s), { type: 'CLUE', text: 'تلميح', count: 1 });
    const black = s.board.find((c) => c.color === 'black')!;
    s = run(s, agentOf(s), { type: 'MARK', cell: black.id });
    s = run(s, agentOf(s), { type: 'GUESS', cell: black.id });
    expect(s.phase).toBe('finished');
    expect(s.winner).not.toBe(team);
  });

  it('a timer expiry ends the turn through tick()', () => {
    let s = game.setup({ ...game.defaultSettings, timerSeconds: 30 }, seats, content, ctx());
    const team = s.active;
    s = run(s, spyOf(s), { type: 'CLUE', text: 'تلميح', count: 1 });
    expect(game.nextDeadline!(s)).toBe(1000 + 30_000);
    s = game.tick!(s, ctx(1000 + 30_000));
    expect(s.active).not.toBe(team);
  });

  it('only spymasters see unrevealed colours; the screen sees none', () => {
    const s = standard();
    const hidden = (v: { board: { color: unknown }[] }) => v.board.filter((c) => c.color !== null).length;
    expect(hidden(game.view(s, { kind: 'player', seatId: 'bs' }, ctx()))).toBe(25);
    expect(hidden(game.view(s, { kind: 'player', seatId: 'ba' }, ctx()))).toBe(0);
    expect(hidden(game.view(s, { kind: 'screen' }, ctx()))).toBe(0);
  });

  it('expanded mode: 6×6, two blacks, two yellows, starting hands', () => {
    const s = game.setup({ ...game.defaultSettings, mode: 'expanded' }, seats, content, ctx());
    expect(s.board).toHaveLength(36);
    expect(s.board.filter((c) => c.color === 'black')).toHaveLength(2);
    expect(s.board.filter((c) => c.color === 'yellow')).toHaveLength(2);
    expect(s.phase).toBe('deal');
    expect(game.transition(s, 'ba', { type: 'BEGIN' }, ctx())).toEqual({ error: 'ADMIN_ONLY' });
    expect(run(s, 'bs', { type: 'BEGIN' }).phase).toBe('clue');
  });

  it('photo board mixes uploaded pictures in and tops up with words', () => {
    const pics = Array.from({ length: 10 }, (_, i) => ({ key: i.toString(16).padStart(16, '0'), widths: [320], thumb: '', aspect: 1 }));
    const s = game.setup({ ...game.defaultSettings, board: 'photos' }, seats, { ...content, pictures: pics }, ctx());
    expect(s.board.filter((c) => c.picture)).toHaveLength(10);
    expect(s.board.filter((c) => c.word)).toHaveLength(15);
  });
});
