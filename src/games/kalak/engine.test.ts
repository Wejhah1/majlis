import { describe, expect, it } from 'vitest';
import { game, normalizeAnswer, type State } from './index';
import { defaultQuestions } from './questions';
import type { Ctx, GameContent, Seat } from '../types';
import { isGameError } from '../types';

const seats: Seat[] = ['a', 'b', 'c'].map((id) => ({ id, name: id, team: null, role: null, portrait: null }));
const content: GameContent = { words: [], pictures: [], questions: defaultQuestions, puzzles: [], roleArt: {}, cardBack: null };
const ctx = (now = 0): Ctx => {
  let s = 11;
  return { now, adminId: 'a', rng: () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646 };
};
const run = (s: State, id: string, action: unknown) => {
  const next = game.transition(s, id, action, ctx());
  if (isGameError(next)) throw new Error(next.error);
  return next;
};
const start = () => game.setup({ rounds: 2, writeSeconds: 0, voteSeconds: 0 }, seats, content, ctx());

describe('kalak engine', () => {
  it('normalises Arabic answers loosely', () => {
    expect(normalizeAnswer('الزَّهرة')).toBe(normalizeAnswer('زهره'));
    expect(normalizeAnswer('٢٠٦')).toBe('206');
    expect(normalizeAnswer('  إيطاليا! ')).toBe(normalizeAnswer('ايطاليا'));
  });

  it('rejects typing the real answer as a fake', () => {
    const s = start();
    expect(game.transition(s, 'a', { type: 'FAKE', text: s.questions[0]!.answer }, ctx())).toEqual({ error: 'IS_TRUTH' });
  });

  it('hides the answer and authorship until the reveal', () => {
    let s = start();
    const before = JSON.stringify(game.view(s, { kind: 'screen' }, ctx()));
    expect(before).not.toContain(`"answer":"${s.questions[0]!.answer}"`);
    s = run(s, 'a', { type: 'FAKE', text: 'كذبة أ' });
    s = run(s, 'b', { type: 'FAKE', text: 'كذبة ب' });
    s = run(s, 'c', { type: 'FAKE', text: 'كذبة ب' }); // duplicates merge
    expect(s.phase).toBe('vote');
    expect(s.options).toHaveLength(3);
    const v = game.view(s, { kind: 'player', seatId: 'a' }, ctx());
    expect(v.options.every((o) => o.authors.length === 0 && !o.truth)).toBe(true);
    expect(v.options.filter((o) => o.mine)).toHaveLength(1);
  });

  it('scores +2 for the truth and +1 per friend fooled, no voting for your own fake', () => {
    let s = start();
    s = run(s, 'a', { type: 'FAKE', text: 'كذبة أ' });
    s = run(s, 'b', { type: 'FAKE', text: 'كذبة ب' });
    s = run(s, 'c', { type: 'FAKE', text: 'كذبة ج' });
    const truth = s.options.find((o) => o.truth)!;
    const fakeA = s.options.find((o) => o.authors.includes('a'))!;
    expect(game.transition(s, 'a', { type: 'VOTE', option: fakeA.id }, ctx())).toEqual({ error: 'OWN_FAKE' });
    s = run(s, 'a', { type: 'VOTE', option: truth.id });
    s = run(s, 'b', { type: 'VOTE', option: fakeA.id });
    s = run(s, 'c', { type: 'VOTE', option: fakeA.id });
    expect(s.phase).toBe('reveal');
    expect(s.players.find((p) => p.id === 'a')!.score).toBe(4); // 2 for truth + 2 fooled
    expect(s.players.find((p) => p.id === 'b')!.score).toBe(0);
    s = run(s, 'a', { type: 'NEXT' });
    expect(s.round).toBe(2);
    expect(s.phase).toBe('write');
  });

  it('a writing timer moves on to voting with whoever wrote', () => {
    let s = game.setup({ rounds: 1, writeSeconds: 30, voteSeconds: 0 }, seats, content, ctx());
    s = run(s, 'a', { type: 'FAKE', text: 'كذبة' });
    s = game.tick!(s, ctx(30_000));
    expect(s.phase).toBe('vote');
    expect(s.options).toHaveLength(2);
  });
});
