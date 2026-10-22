// Authoritative membership rules, ported from passnames' room-core.js and made game-neutral.
// Pure functions: the Durable Object owns storage and sockets; everything here is testable in Node.
import type { AssetRef, GameMeta, GameModule, LobbyConfig, Seat } from '../../games/types';
import { isGameError } from '../../games/types';

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const EMPTY_ROOM_TTL = 60 * 60 * 1000;
export const ADMIN_GRACE = 60 * 1000;
export const MAX_MEMBERS = 24;
export const MAX_PENDING = 10;

export class RoomError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

const need = (ok: unknown, code: string, status = 400): void => {
  if (!ok) throw new RoomError(code, status);
};

export type Member = {
  id: string;
  name: string;
  tokenHash: string;
  status: 'admitted' | 'pending';
  team: string | null;
  role: string | null;
  portrait: AssetRef | null;
  rosterId: string | null;
  joinedAt: number;
};

export type MatchRecord = { id: string; version: number; state: unknown; seatIds: string[]; startedAt: number };

export type Room = {
  schema: 1;
  code: string;
  gameId: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  emptySince: number | null;
  adminId: string | null;
  adminAway: { id: string; since: number } | null;
  locked: boolean;
  members: Member[];
  blockedHashes: string[];
  settings: Record<string, unknown>;
  phase: 'lobby' | 'playing';
  match: MatchRecord | null;
};

export type Identity = { name: string; rosterId?: string | null; portrait?: AssetRef | null };

export const normalizeCode = (value: unknown) => String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
export const validCode = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 9 && [...value].every((c) => ROOM_ALPHABET.includes(c));

export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map((n) => ROOM_ALPHABET[n % 32]).join('');
}

export function cleanName(value: unknown) {
  need(typeof value === 'string', 'NAME_REQUIRED');
  const name = (value as string).normalize('NFKC').trim().replace(/\s+/g, ' ');
  need(name.length >= 1 && name.length <= 24 && !/[\p{Cc}\p{Cf}]/u.test(name), 'NAME_INVALID');
  return name;
}

const checkHash = (hash: string) => need(/^[0-9a-f]{64}$/.test(hash), 'SESSION_INVALID', 401);

export const admitted = (room: Room) => room.members.filter((m) => m.status === 'admitted');
export const memberForHash = (room: Room | null, hash: string) => room?.members.find((m) => m.tokenHash === hash) ?? null;

function roleConfig(lobby: LobbyConfig, roleId: string | null) {
  return lobby.roles?.find((r) => r.id === roleId);
}

/** New arrivals get the default role and the smaller team, so lobbies mostly sort themselves. */
function defaultSeat(room: Room, lobby: LobbyConfig, exceptId?: string) {
  const role = lobby.defaultRole ?? null;
  let team: string | null = null;
  if (lobby.teams?.length) {
    const counts = lobby.teams.map((t) => ({
      id: t.id,
      n: room.members.filter((m) => m.id !== exceptId && m.status === 'admitted' && m.team === t.id).length,
    }));
    team = counts.reduce((a, b) => (b.n < a.n ? b : a)).id;
  }
  return { team, role };
}

function newMember(room: Room | null, identity: Identity, hash: string, status: Member['status'], now: number): Member {
  return {
    id: crypto.randomUUID(),
    name: cleanName(identity.name),
    tokenHash: hash,
    status,
    team: null,
    role: null,
    portrait: identity.portrait ?? null,
    rosterId: identity.rosterId ?? null,
    joinedAt: now,
  };
}

export function createRoom(code: string, game: GameModule, identity: Identity, hash: string, now: number): Room {
  need(validCode(code), 'CODE_INVALID');
  checkHash(hash);
  const room: Room = {
    schema: 1,
    code,
    gameId: game.meta.id,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    emptySince: now,
    adminId: null,
    adminAway: null,
    locked: false,
    members: [],
    blockedHashes: [],
    settings: { ...game.defaultSettings },
    phase: 'lobby',
    match: null,
  };
  const owner = newMember(room, identity, hash, 'admitted', now);
  Object.assign(owner, defaultSeat(room, game.meta.lobby));
  room.members.push(owner);
  room.adminId = owner.id;
  return room;
}

export function joinRoom(room: Room | null, game: GameModule, identity: Identity, hash: string, now: number) {
  need(room?.adminId, 'ROOM_NOT_FOUND', 404);
  const r = room!;
  checkHash(hash);
  need(!r.blockedHashes.includes(hash), 'REMOVED', 403);
  const known = memberForHash(r, hash);
  if (known) return { room: r, member: known };
  const name = cleanName(identity.name);
  need(!r.members.some((m) => m.name.toLocaleLowerCase() === name.toLocaleLowerCase()), 'NAME_TAKEN', 409);
  need(admitted(r).length < MAX_MEMBERS, 'ROOM_FULL', 409);
  need(r.members.filter((m) => m.status === 'pending').length < MAX_PENDING, 'WAITING_FULL', 429);
  const next = structuredClone(r);
  const member = newMember(next, { ...identity, name }, hash, next.locked ? 'pending' : 'admitted', now);
  Object.assign(member, defaultSeat(next, game.meta.lobby));
  next.members.push(member);
  touch(next, now);
  return { room: next, member };
}

export function seatsOf(room: Room): Seat[] {
  return admitted(room).map(({ id, name, team, role, portrait }) => ({ id, name, team, role, portrait }));
}

export type Readiness = { ready: true } | { ready: false; error: string };

export function readiness(room: Room, game: GameModule): Readiness {
  if (game.meta.status !== 'ready') return { ready: false, error: 'GAME_NOT_READY' };
  const lobby = game.meta.lobby;
  const seats = seatsOf(room);
  for (const s of seats) {
    const role = roleConfig(lobby, s.role);
    if (lobby.teams?.length && !role?.teamless && !s.team) return { ready: false, error: 'ASSIGN_EVERYONE' };
  }
  const result = game.seatRules(seats, room.settings);
  return isGameError(result) ? { ready: false, error: result.error } : { ready: true };
}

function touch(room: Room, now: number) {
  room.updatedAt = now;
  room.revision++;
}

export type LobbyAction =
  | { type: 'LOCK'; locked: boolean }
  | { type: 'APPROVE' | 'REJECT' | 'KICK' | 'PROMOTE'; targetId: string }
  | { type: 'SEAT'; targetId: string; team: string | null; role: string | null }
  | { type: 'RENAME'; name: string }
  | { type: 'SETTINGS'; settings: unknown }
  | { type: 'SWITCH_GAME'; gameId: string }
  | { type: 'LEAVE' };

const ADMIN_ONLY = new Set(['LOCK', 'APPROVE', 'REJECT', 'KICK', 'PROMOTE', 'SETTINGS', 'SWITCH_GAME']);

export function lobbyAction(
  room: Room,
  actorId: string,
  action: Record<string, unknown>,
  games: Record<string, GameModule>,
  now: number,
): Room {
  const s = structuredClone(room);
  const actor = s.members.find((m) => m.id === actorId);
  need(actor, 'SESSION_INVALID', 401);
  const isAdmin = actor!.id === s.adminId;
  const game = games[s.gameId]!;

  if (action.type === 'LEAVE') {
    s.members = s.members.filter((m) => m.id !== actorId);
    if (isAdmin) s.adminId = admitted(s)[0]?.id ?? null;
    // Closing the last admitted seat removes pending members too; nobody can claim admin later.
    if (!s.adminId) s.members = [];
    touch(s, now);
    return s;
  }

  need(actor!.status === 'admitted', 'APPROVAL_REQUIRED', 403);
  if (ADMIN_ONLY.has(String(action.type))) need(isAdmin, 'ADMIN_ONLY', 403);

  switch (action.type) {
    case 'LOCK':
      need(typeof action.locked === 'boolean', 'BAD_ACTION');
      s.locked = action.locked as boolean;
      break;
    case 'APPROVE': {
      const target = s.members.find((m) => m.id === action.targetId && m.status === 'pending');
      need(target, 'PLAYER_NOT_FOUND', 404);
      need(admitted(s).length < MAX_MEMBERS, 'ROOM_FULL', 409);
      target!.status = 'admitted';
      Object.assign(target!, defaultSeat(s, game.meta.lobby, target!.id));
      break;
    }
    case 'REJECT':
    case 'KICK': {
      need(action.targetId !== s.adminId, 'CANNOT_KICK_ADMIN');
      const target = s.members.find((m) => m.id === action.targetId);
      need(target, 'PLAYER_NOT_FOUND', 404);
      s.blockedHashes.push(target!.tokenHash);
      s.members = s.members.filter((m) => m.id !== target!.id);
      break;
    }
    case 'PROMOTE': {
      const target = admitted(s).find((m) => m.id === action.targetId);
      need(target, 'PLAYER_NOT_FOUND', 404);
      s.adminId = target!.id;
      s.adminAway = null;
      break;
    }
    case 'SEAT': {
      need(s.phase === 'lobby', 'LOBBY_ONLY', 409);
      need(isAdmin || action.targetId === actor!.id, 'SELF_ONLY', 403);
      const target = admitted(s).find((m) => m.id === action.targetId);
      need(target, 'PLAYER_NOT_FOUND', 404);
      const lobby = game.meta.lobby;
      const role = action.role === null || action.role === undefined ? null : String(action.role);
      const roleDef = roleConfig(lobby, role);
      if (lobby.roles?.length) need(roleDef, 'ROLE_INVALID');
      else need(role === null, 'ROLE_INVALID');
      let team = action.team === null || action.team === undefined ? null : String(action.team);
      if (roleDef?.teamless || !lobby.teams?.length) team = null;
      else need(team === null || lobby.teams.some((t) => t.id === team), 'TEAM_INVALID');
      if (roleDef?.max !== undefined) {
        const holders = admitted(s).filter((m) => m.id !== target!.id && m.role === role && (roleDef.teamless || m.team === team));
        need(holders.length < roleDef.max, 'ROLE_TAKEN', 409);
      }
      target!.team = team;
      target!.role = role;
      break;
    }
    case 'RENAME': {
      const name = cleanName(action.name);
      need(!s.members.some((m) => m.id !== actor!.id && m.name.toLocaleLowerCase() === name.toLocaleLowerCase()), 'NAME_TAKEN', 409);
      actor!.name = name;
      break;
    }
    case 'SETTINGS': {
      need(s.phase === 'lobby', 'LOBBY_ONLY', 409);
      const parsed = game.parseSettings(action.settings);
      need(!isGameError(parsed), isGameError(parsed) ? parsed.error : 'SETTINGS_INVALID');
      s.settings = parsed as Record<string, unknown>;
      break;
    }
    case 'SWITCH_GAME': {
      need(s.phase === 'lobby', 'LOBBY_ONLY', 409);
      const next = games[String(action.gameId)];
      need(next, 'GAME_NOT_FOUND', 404);
      s.gameId = next!.meta.id;
      s.settings = { ...next!.defaultSettings };
      // Reseat everyone for the new game's teams and roles, keeping teams balanced.
      for (const m of s.members) {
        m.team = null;
        m.role = null;
      }
      for (const m of admitted(s)) Object.assign(m, defaultSeat(s, next!.meta.lobby));
      break;
    }
    default:
      throw new RoomError('BAD_ACTION');
  }
  touch(s, now);
  return s;
}

/** Admin handoff: if the admin is gone for ADMIN_GRACE, the next online member takes over. */
export function recoverRoom(room: Room, online: string[], now: number): Room {
  if (!room.adminId) return room;
  const live = new Set(online);
  if (live.has(room.adminId)) {
    if (!room.adminAway) return room;
    const s = structuredClone(room);
    s.adminAway = null;
    return s;
  }
  const s = structuredClone(room);
  if (s.adminAway?.id !== s.adminId) s.adminAway = { id: s.adminId!, since: now };
  if (now - s.adminAway!.since >= ADMIN_GRACE) {
    const next = admitted(s).find((m) => live.has(m.id));
    if (next) {
      s.adminId = next.id;
      s.adminAway = null;
      touch(s, now);
    }
  }
  return JSON.stringify(s) === JSON.stringify(room) ? room : s;
}

export type PublicMember = {
  id: string;
  name: string;
  team: string | null;
  role: string | null;
  portrait: AssetRef | null;
  online: boolean;
  seated: boolean;
};

export type RoomView = {
  code: string;
  gameId: string;
  phase: 'waiting' | 'lobby' | 'playing';
  revision: number;
  locked: boolean;
  adminId: string | null;
  adminAwayUntil: number | null;
  me: PublicMember | null;
  members: PublicMember[];
  pending: PublicMember[];
  settings: Record<string, unknown>;
  readiness: Readiness;
  match: { id: string; version: number; view: unknown } | null;
};

export function roomView(
  room: Room,
  viewerId: string | null,
  online: string[],
  game: GameModule,
  now: number,
): RoomView {
  const live = new Set(online);
  const seated = new Set(room.match?.seatIds ?? []);
  const safe = (m: Member): PublicMember => ({
    id: m.id,
    name: m.name,
    team: m.team,
    role: m.role,
    portrait: m.portrait,
    online: live.has(m.id),
    seated: seated.has(m.id),
  });
  const me = viewerId ? room.members.find((m) => m.id === viewerId) ?? null : null;
  const base = {
    code: room.code,
    gameId: room.gameId,
    revision: room.revision,
    locked: room.locked,
    adminId: room.adminId,
    adminAwayUntil: room.adminAway ? room.adminAway.since + ADMIN_GRACE : null,
    me: me ? safe(me) : null,
  };
  if (me?.status === 'pending') {
    return { ...base, phase: 'waiting', members: [], pending: [], settings: {}, readiness: { ready: false, error: 'WAITING' }, match: null };
  }
  let match: RoomView['match'] = null;
  if (room.match) {
    const ctx = { now, adminId: room.adminId ?? '' };
    const viewer = me && seated.has(me.id) ? ({ kind: 'player', seatId: me.id } as const) : ({ kind: 'screen' } as const);
    match = { id: room.match.id, version: room.match.version, view: game.view(room.match.state, viewer, ctx) };
  }
  return {
    ...base,
    phase: room.phase,
    members: admitted(room).map(safe),
    pending: me && me.id === room.adminId ? room.members.filter((m) => m.status === 'pending').map(safe) : [],
    settings: { ...room.settings },
    readiness: readiness(room, game),
    match,
  };
}

export const metaOf = (games: Record<string, GameModule>, id: string): GameMeta | undefined => games[id]?.meta;
