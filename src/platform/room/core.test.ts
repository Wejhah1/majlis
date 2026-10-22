import { describe, expect, it } from 'vitest';
import { serverGames } from '../../games/server';
import { createRoom, joinRoom, lobbyAction, readiness, recoverRoom, roomView, ADMIN_GRACE, type Room } from './core';
import { endMatch, matchCommand, startMatch } from './match';
import type { GameContent } from '../../games/types';
import words from '../../games/passnames/words.json';

const hash = (n: number) => n.toString(16).padStart(64, '0');
const passnames = serverGames.passnames!;
const content: GameContent = { words, pictures: [], questions: [], puzzles: [], roleArt: {}, cardBack: null };
let seed = 1;
const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function lobbyOf(n: number): Room {
  let room = createRoom('ABCDEFGHJ', passnames, { name: 'Majd' }, hash(1), 0);
  for (let i = 2; i <= n; i++) room = joinRoom(room, passnames, { name: `P${i}` }, hash(i), i).room;
  return room;
}

describe('room membership', () => {
  it('balances arrivals across teams with the default role', () => {
    const room = lobbyOf(4);
    const teams = room.members.map((m) => m.team);
    expect(teams.filter((t) => t === 'blue')).toHaveLength(2);
    expect(teams.filter((t) => t === 'red')).toHaveLength(2);
    expect(room.members.every((m) => m.role === 'agent')).toBe(true);
  });

  it('rejoining with the same token returns the same seat', () => {
    const room = lobbyOf(2);
    const again = joinRoom(room, passnames, { name: 'whatever' }, hash(2), 99);
    expect(again.member.name).toBe('P2');
    expect(again.room.members).toHaveLength(2);
  });

  it('rejects duplicate names and kicked tokens', () => {
    const room = lobbyOf(2);
    expect(() => joinRoom(room, passnames, { name: 'majd' }, hash(9), 5)).toThrow('NAME_TAKEN');
    const kicked = lobbyAction(room, room.adminId!, { type: 'KICK', targetId: room.members[1]!.id }, serverGames, 6);
    expect(() => joinRoom(kicked, passnames, { name: 'P2' }, hash(2), 7)).toThrow('REMOVED');
  });

  it('locks: newcomers wait until approved', () => {
    const base = lobbyOf(1);
    const room = lobbyAction(base, base.adminId!, { type: 'LOCK', locked: true }, serverGames, 1);
    const { room: r2, member } = joinRoom(room, passnames, { name: 'Late' }, hash(5), 2);
    expect(member.status).toBe('pending');
    expect(roomView(r2, member.id, [], passnames, 3).phase).toBe('waiting');
    const r3 = lobbyAction(r2, r2.adminId!, { type: 'APPROVE', targetId: member.id }, serverGames, 4);
    expect(r3.members.find((m) => m.id === member.id)!.status).toBe('admitted');
  });

  it('only one spymaster per team', () => {
    let room = lobbyOf(4);
    const blue = room.members.filter((m) => m.team === 'blue');
    room = lobbyAction(room, blue[0]!.id, { type: 'SEAT', targetId: blue[0]!.id, team: 'blue', role: 'spy' }, serverGames, 5);
    expect(() => lobbyAction(room, blue[1]!.id, { type: 'SEAT', targetId: blue[1]!.id, team: 'blue', role: 'spy' }, serverGames, 6)).toThrow('ROLE_TAKEN');
  });

  it('non-admins cannot change settings or kick', () => {
    const room = lobbyOf(3);
    const p = room.members[1]!.id;
    expect(() => lobbyAction(room, p, { type: 'SETTINGS', settings: { mode: 'expanded' } }, serverGames, 1)).toThrow('ADMIN_ONLY');
    expect(() => lobbyAction(room, p, { type: 'KICK', targetId: room.members[2]!.id }, serverGames, 1)).toThrow('ADMIN_ONLY');
  });

  it('switching games reseats everyone for the new game', () => {
    const room = lobbyOf(4);
    const next = lobbyAction(room, room.adminId!, { type: 'SWITCH_GAME', gameId: 'kalak' }, serverGames, 9);
    expect(next.gameId).toBe('kalak');
    expect(next.members.every((m) => m.team === null && m.role === null)).toBe(true);
  });

  it('hands admin to an online member after the grace period', () => {
    const room = lobbyOf(3);
    const others = room.members.slice(1).map((m) => m.id);
    const away = recoverRoom(room, others, 1000);
    expect(away.adminId).toBe(room.adminId);
    const moved = recoverRoom(away, others, 1000 + ADMIN_GRACE);
    expect(moved.adminId).toBe(others[0]);
  });
});

describe('matches', () => {
  function ready() {
    let room = lobbyOf(4);
    for (const team of ['blue', 'red']) {
      const m = room.members.find((x) => x.team === team)!;
      room = lobbyAction(room, m.id, { type: 'SEAT', targetId: m.id, team, role: 'spy' }, serverGames, 10);
    }
    return room;
  }

  it('needs a spymaster on each team before starting', () => {
    expect(readiness(lobbyOf(4), passnames)).toEqual({ ready: false, error: 'SPY_REQUIRED_BLUE' });
    expect(readiness(ready(), passnames)).toEqual({ ready: true });
  });

  it('starts, rejects stale versions, and ends back to the lobby', () => {
    const room = startMatch(...((r) => [r, r.adminId!] as const)(ready()), passnames, content, 20, rng);
    expect(room.phase).toBe('playing');
    const agent = room.members.find((m) => m.role === 'agent')!;
    expect(() => matchCommand(room, agent.id, { matchId: room.match!.id, version: 0, action: { type: 'END' } }, passnames, 21)).toThrow('STALE_ACTION');
    const back = endMatch(room, room.adminId!, 30);
    expect(back.phase).toBe('lobby');
    expect(back.match).toBeNull();
  });

  it('TV screens and spectators never see the key card', () => {
    const room = startMatch(...((r) => [r, r.adminId!] as const)(ready()), passnames, content, 20, rng);
    const screen = roomView(room, null, [], passnames, 21).match!.view as { board: { color: unknown }[] };
    expect(screen.board.every((c) => c.color === null)).toBe(true);
    const spy = room.members.find((m) => m.role === 'spy')!;
    const spyView = roomView(room, spy.id, [], passnames, 21).match!.view as { board: { color: unknown }[] };
    expect(spyView.board.every((c) => c.color !== null)).toBe(true);
  });
});
