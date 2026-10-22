// Match commands run only inside the room's serialized queue (see worker/room-server.ts).
import type { GameContent, GameModule, Rng } from '../../games/types';
import { isGameError } from '../../games/types';
import { RoomError, readiness, seatsOf, type Room } from './core';

const need = (ok: unknown, code: string, status = 409): void => {
  if (!ok) throw new RoomError(code, status);
};

export const secureRandom: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;

/** Game rule violations travel to the client as GAME:<code> so they translate per game. */
export class GameRuleError extends RoomError {
  constructor(code: string) {
    super(code, 409);
  }
}

export function startMatch(room: Room, actorId: string, game: GameModule, content: GameContent, now: number, rng: Rng = secureRandom): Room {
  need(actorId === room.adminId, 'ADMIN_ONLY', 403);
  need(room.phase === 'lobby' && !room.match, 'LOBBY_ONLY');
  const check = readiness(room, game);
  if (!check.ready) throw new GameRuleError(check.error);
  const seats = seatsOf(room);
  const state = game.setup(room.settings as never, seats, content, { rng, now, adminId: room.adminId! });
  return {
    ...room,
    phase: 'playing',
    match: { id: crypto.randomUUID(), version: 1, state, seatIds: seats.map((s) => s.id), startedAt: now },
    revision: room.revision + 1,
    updatedAt: now,
  };
}

export function endMatch(room: Room, actorId: string, now: number): Room {
  need(actorId === room.adminId, 'ADMIN_ONLY', 403);
  need(room.match, 'NO_MATCH');
  return { ...room, phase: 'lobby', match: null, revision: room.revision + 1, updatedAt: now };
}

export function matchCommand(
  room: Room,
  actorId: string,
  data: Record<string, unknown>,
  game: GameModule,
  now: number,
  rng: Rng = secureRandom,
): Room {
  const m = room.match;
  need(m && room.phase === 'playing', 'NO_MATCH');
  need(data.matchId === m!.id, 'STALE_MATCH');
  need(m!.seatIds.includes(actorId), 'SPECTATOR_ONLY', 403);
  const action = data.action;
  if (!game.raceSafe?.(action)) need(data.version === m!.version, 'STALE_ACTION');
  const result = game.transition(m!.state, actorId, action, { rng, now, adminId: room.adminId! });
  if (isGameError(result)) throw new GameRuleError(result.error);
  return {
    ...room,
    match: { ...m!, state: result, version: m!.version + 1 },
    revision: room.revision + 1,
    updatedAt: now,
  };
}

/** Runs the game's timers. Returns the same object when nothing was due. */
export function tickMatch(room: Room, game: GameModule, now: number, rng: Rng = secureRandom): Room {
  const m = room.match;
  if (!m || !game.tick || !game.nextDeadline) return room;
  const due = game.nextDeadline(m.state);
  if (due === null || now < due) return room;
  const state = game.tick(m.state, { rng, now, adminId: room.adminId ?? '' });
  if (state === m.state) return room;
  return { ...room, match: { ...m, state, version: m.version + 1 }, revision: room.revision + 1, updatedAt: now };
}

export function matchDeadline(room: Room, game: GameModule): number | null {
  return room.match && game.nextDeadline ? game.nextDeadline(room.match.state) : null;
}
