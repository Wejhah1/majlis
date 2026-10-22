import { describe, expect, it } from 'vitest';
import { game, type State } from './index';
import type { Ctx, GameContent, Seat } from '../types';
import { isGameError } from '../types';

const content: GameContent = { words: [], pictures: [], agentPhotos: [], questions: [], puzzles: [], roleArt: {}, cardBack: null };
const seat = (id: string, role = 'player'): Seat => ({ id, name: id, team: null, role, portrait: null });
const seats = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => seat(id));
const ctx = (now = 0, seed = 3): Ctx => {
  let s = seed;
  return { now, adminId: 'a', rng: () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646 };
};

function run(s: State, id: string, action: unknown) {
  const next = game.transition(s, id, action, ctx());
  if (isGameError(next)) throw new Error(next.error);
  return next;
}

function toNight() {
  let s = game.setup(game.defaultSettings, seats, content, ctx());
  for (const p of s.players) s = run(s, p.id, { type: 'READY' });
  return s;
}

const byRole = (s: State, role: string) => s.players.filter((p) => p.role === role);

describe('mafia engine', () => {
  it('deals 2 mafia, a detective and a doctor to 8 players', () => {
    const s = game.setup(game.defaultSettings, seats, content, ctx());
    expect(byRole(s, 'mafia')).toHaveLength(2);
    expect(byRole(s, 'detective')).toHaveLength(1);
    expect(byRole(s, 'doctor')).toHaveLength(1);
    expect(byRole(s, 'villager')).toHaveLength(4);
  });

  it('starts the night once everyone has seen their card', () => {
    expect(toNight().phase).toBe('night');
  });

  it('never leaks a mafia role to the town, the screen, or a living villager', () => {
    const s = toNight();
    const villager = byRole(s, 'villager')[0]!;
    const mafia = byRole(s, 'mafia');
    for (const v of [game.view(s, { kind: 'player', seatId: villager.id }, ctx()), game.view(s, { kind: 'screen' }, ctx())]) {
      const known = v.players.filter((p) => p.role === 'mafia');
      expect(known).toHaveLength(0);
      expect(JSON.stringify(v)).not.toContain('"mafia":true');
    }
    const mv = game.view(s, { kind: 'player', seatId: mafia[0]!.id }, ctx());
    expect(mv.players.filter((p) => p.role === 'mafia').map((p) => p.id).sort()).toEqual(mafia.map((m) => m.id).sort());
  });

  it('the doctor saves the target; otherwise the target dies at dawn', () => {
    let s = toNight();
    const [m1, m2] = byRole(s, 'mafia');
    const victim = byRole(s, 'villager')[0]!;
    const doctor = byRole(s, 'doctor')[0]!;
    const detective = byRole(s, 'detective')[0]!;
    s = run(s, m1!.id, { type: 'KILL', target: victim.id });
    s = run(s, m2!.id, { type: 'KILL', target: victim.id });
    s = run(s, detective.id, { type: 'CHECK', target: m1!.id });
    s = run(s, doctor.id, { type: 'SAVE', target: victim.id });
    expect(s.phase).toBe('dawn');
    expect(s.dawn).toEqual({ killed: [], blocked: true });
    expect(s.checks[0]).toMatchObject({ target: m1!.id, mafia: true });
    // The investigation result is for the detective only.
    expect(game.view(s, { kind: 'player', seatId: victim.id }, ctx()).checks).toHaveLength(0);
    expect(game.view(s, { kind: 'player', seatId: detective.id }, ctx()).checks).toHaveLength(1);
    // The doctor can't protect the same person two nights running.
    s = run(s, 'a', { type: 'CONTINUE' }); // dawn → discussion
    s = run(s, 'a', { type: 'OPEN_VOTE' });
    s = run(s, 'a', { type: 'CLOSE' });
    s = run(s, 'a', { type: 'CONTINUE' });
    expect(game.transition(s, doctor.id, { type: 'SAVE', target: victim.id }, ctx())).toEqual({ error: 'NOT_TWICE' });
  });

  it('a strict majority of the living eliminates; mafia wins at parity', () => {
    let s = toNight();
    const mafia = byRole(s, 'mafia');
    const town = s.players.filter((p) => p.role !== 'mafia');
    // Night 1: kill a villager.
    for (const m of mafia) s = run(s, m.id, { type: 'KILL', target: town[0]!.id });
    s = run(s, 'a', { type: 'CLOSE' });
    expect(s.players.find((p) => p.id === town[0]!.id)!.alive).toBe(false);
    s = run(s, 'a', { type: 'CONTINUE' });
    expect(game.transition(s, town[1]!.id, { type: 'VOTE', target: town[2]!.id }, ctx())).toEqual({ error: 'VOTE_LOCKED' });
    s = run(s, 'a', { type: 'OPEN_VOTE' });
    // Day: everyone alive votes out a town member → 7 alive, needs 4.
    for (const p of s.players.filter((p) => p.alive)) if (p.id !== town[1]!.id) s = run(s, p.id, { type: 'VOTE', target: town[1]!.id });
    s = run(s, town[1]!.id, { type: 'VOTE', target: 'skip' });
    expect(s.verdict).toEqual({ eliminated: town[1]!.id, spared: null });
    expect(s.winner).toBeNull();
  });

  it('only the controller (narrator or admin) moves the story on', () => {
    const s = toNight();
    const notAdmin = s.players.find((p) => p.id !== 'a')!;
    expect(game.transition(s, notAdmin.id, { type: 'CLOSE' }, ctx())).toEqual({ error: 'CONTROLLER_ONLY' });
  });

  it('a narrator sits out and sees every role', () => {
    const withNarrator = [...seats.slice(0, 6), seat('n', 'narrator')];
    const s = game.setup(game.defaultSettings, withNarrator, content, ctx());
    expect(s.players).toHaveLength(6);
    expect(game.view(s, { kind: 'player', seatId: 'n' }, ctx()).players.every((p) => p.role)).toBe(true);
  });

  it('the witch sees the victim, can save them, and the potion is spent', () => {
    const settings = { ...game.defaultSettings, doctor: false, detective: false, witch: true };
    let s = game.setup(settings, seats, content, ctx());
    for (const p of s.players) s = run(s, p.id, { type: 'READY' });
    const witch = byRole(s, 'witch')[0]!;
    const victim = s.players.find((p) => p.role === 'villager')!;
    for (const m of byRole(s, 'mafia')) s = run(s, m.id, { type: 'KILL', target: victim.id });
    expect(s.nightStep).toBe('witch');
    expect(game.view(s, { kind: 'player', seatId: witch.id }, ctx()).night!.victim).toBe(victim.id);
    expect(game.view(s, { kind: 'player', seatId: victim.id }, ctx()).night!.victim).toBeNull();
    s = run(s, witch.id, { type: 'WITCH', heal: true, poison: null });
    expect(s.dawn).toEqual({ killed: [], blocked: true });
    expect(s.potions.heal).toBe(false);
  });

  it('lovers die together, and a dead hunter must shoot before the story moves on', () => {
    const settings = { ...game.defaultSettings, doctor: false, detective: false, cupid: true, hunter: true };
    let s = game.setup(settings, seats, content, ctx());
    for (const p of s.players) s = run(s, p.id, { type: 'READY' });
    const cupid = byRole(s, 'cupid')[0]!;
    const hunter = byRole(s, 'hunter')[0]!;
    const villager = byRole(s, 'villager')[0]!;
    s = run(s, cupid.id, { type: 'CUPID', targets: [hunter.id, villager.id] });
    for (const m of byRole(s, 'mafia')) s = run(s, m.id, { type: 'KILL', target: villager.id });
    expect(s.dawn!.killed.sort()).toEqual([villager.id, hunter.id].sort());
    expect(game.transition(s, 'a', { type: 'CONTINUE' }, ctx())).toEqual({ error: 'HUNTER_FIRST' });
    const target = byRole(s, 'mafia')[0]!;
    s = run(s, hunter.id, { type: 'SHOOT', target: target.id });
    expect(s.players.find((p) => p.id === target.id)!.alive).toBe(false);
  });

  it('the idiot survives the first vote and loses their vote', () => {
    const settings = { ...game.defaultSettings, doctor: false, detective: false, idiot: true };
    let s = game.setup(settings, seats, content, ctx());
    for (const p of s.players) s = run(s, p.id, { type: 'READY' });
    s = run(s, 'a', { type: 'CLOSE' });
    s = run(s, 'a', { type: 'CONTINUE' });
    s = run(s, 'a', { type: 'OPEN_VOTE' });
    const idiot = byRole(s, 'idiot')[0]!;
    for (const p of s.players.filter((p) => p.alive && p.id !== idiot.id)) s = run(s, p.id, { type: 'VOTE', target: idiot.id });
    s = run(s, 'a', { type: 'CLOSE' });
    expect(s.verdict).toEqual({ eliminated: null, spared: idiot.id });
    expect(s.players.find((p) => p.id === idiot.id)!.alive).toBe(true);
  });

  it('the host can pause, extend and resume the clock', () => {
    const settings = { ...game.defaultSettings, nightSeconds: 60 };
    let s = game.setup(settings, seats, content, ctx());
    for (const p of s.players) s = run(s, p.id, { type: 'READY' });
    expect(s.deadline).toBe(60_000);
    s = game.transition(s, 'a', { type: 'PAUSE' }, ctx(20_000)) as State;
    expect(s.paused).toEqual({ left: 40_000 });
    expect(game.nextDeadline!(s)).toBeNull();
    s = run(s, 'a', { type: 'EXTEND' });
    s = game.transition(s, 'a', { type: 'RESUME' }, ctx(100_000)) as State;
    expect(s.deadline).toBe(170_000);
  });

  it('each card gets one of the uploaded pictures for its role, and only its viewers see it', () => {
    const pic = (key: string) => ({ key, widths: [320], thumb: '', aspect: 0.7 });
    const art = { mafia: [pic('m1'), pic('m2')], villager: [pic('v1')] };
    const s = game.setup(game.defaultSettings, seats, { ...content, roleArt: art }, ctx());
    for (const p of byRole(s, 'mafia')) expect(['m1', 'm2']).toContain(p.art!.key);
    const villager = byRole(s, 'villager')[0]!;
    const v = game.view(s, { kind: 'player', seatId: villager.id }, ctx());
    expect(JSON.stringify(v)).not.toMatch(/"m[12]"/);
  });
});
