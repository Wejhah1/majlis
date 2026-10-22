// One Durable Object per room. Ported from passnames' room-server.js: every request, message
// and alarm runs through one queue, state lives under one storage key, and each socket gets
// its own filtered snapshot. Added: TV screen sockets, game modules, D1 content at match start.
import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { serverGames } from '../src/games/server';
import {
  EMPTY_ROOM_TTL,
  RoomError,

  createRoom,
  joinRoom,
  lobbyAction,
  memberForHash,
  recoverRoom,
  roomView,
  ADMIN_GRACE,
  type Identity,
  type Room,
} from '../src/platform/room/core';
import { endMatch, matchCommand, matchDeadline, secureRandom, startMatch, tickMatch } from '../src/platform/room/match';
import { loadContent } from './db';
import { errorResponse, noStore, readJSON, sessionHash } from './http';
import type { AssetRef } from '../src/games/types';

export const AUTH_DEADLINE = 10_000;
export const PRESENCE_TTL = 65_000;
export const HEARTBEAT_INTERVAL = 10_000;
const MAX_UNAUTHENTICATED = 8;
const MAX_AUTHENTICATED = 40;
const MAX_SCREENS = 4;
const MAX_MESSAGE = 8192;

type SocketState = {
  memberId?: string;
  screen?: boolean;
  authDeadline?: number;
  expired?: boolean;
  seenAt?: number;
  heartbeatAt?: number;
  windowAt?: number;
  count?: number;
};

type Socket = Connection<SocketState>;

export class RoomsServer extends Server<Env> {
  static options = { hibernate: true };

  room: Room | null = null;
  work: Promise<unknown> = Promise.resolve();
  scheduledAlarm: number | null = null;
  botTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Test bots are on while the Worker has BOTS = "on" (wrangler.jsonc vars). */
  botsEnabled() {
    return (this.env as { BOTS?: string }).BOTS === 'on';
  }

  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const operation = this.work.then(fn);
    this.work = operation.catch(() => {});
    return operation;
  }

  async onStart() {
    this.room = (await this.ctx.storage.get<Room>('room')) ?? null;
    this.scheduledAlarm = (await this.ctx.storage.getAlarm()) ?? null;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  game() {
    return this.room ? serverGames[this.room.gameId] : undefined;
  }

  sockets(): Socket[] {
    return [...this.getConnections<SocketState>()];
  }

  online(now = Date.now()) {
    const ids = new Set<string>();
    for (const c of this.sockets()) {
      const s = c.state;
      if (!s?.memberId || s.expired) continue;
      if (s.seenAt != null && now - s.seenAt >= PRESENCE_TTL) continue;
      if (this.room?.members.some((m) => m.id === s.memberId)) ids.add(s.memberId);
    }
    return [...ids];
  }

  expireConnections(now: number) {
    let changed = false;
    for (const c of this.sockets()) {
      const s = c.state ?? {};
      if (s.expired) continue;
      if (!s.memberId && !s.screen) {
        if (s.authDeadline == null) c.setState({ ...s, authDeadline: now + AUTH_DEADLINE });
        else if (now >= s.authDeadline) {
          c.setState({ ...s, expired: true });
          c.close(4401, 'AUTH_TIMEOUT');
          changed = true;
        }
        continue;
      }
      if (s.seenAt == null) {
        c.setState({ ...s, seenAt: now });
        changed = true;
      } else if (now - s.seenAt >= PRESENCE_TTL) {
        c.setState({ ...s, expired: true });
        c.close(4000, 'PRESENCE_EXPIRED');
        changed = true;
      }
    }
    return changed;
  }

  send(c: Socket, value: unknown) {
    try {
      c.send(JSON.stringify(value));
    } catch {
      // Close handling republishes presence.
    }
  }

  async persist(next: Room | null) {
    if (!next?.adminId) {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      this.room = null;
      this.scheduledAlarm = null;
      return;
    }
    await this.ctx.storage.put('room', next);
    this.room = next;
  }

  async schedule() {
    const room = this.room;
    const game = this.game();
    if (!room || !game) return;
    const now = Date.now();
    const present = this.online(now).length > 0;
    if (present && room.emptySince !== null) await this.persist({ ...room, emptySince: null });
    if (!present && room.emptySince === null) await this.persist({ ...room, emptySince: now });
    const deadlines: number[] = [];
    for (const c of this.sockets()) {
      const s = c.state;
      if (!s || s.expired) continue;
      if (!s.memberId && !s.screen && s.authDeadline != null) deadlines.push(s.authDeadline);
      if ((s.memberId || s.screen) && s.seenAt != null) deadlines.push(s.seenAt + PRESENCE_TTL);
    }
    const r = this.room!;
    if (r.adminAway) deadlines.push(r.adminAway.since + ADMIN_GRACE);
    if (r.emptySince !== null) deadlines.push(r.emptySince + EMPTY_ROOM_TTL);
    const due = matchDeadline(r, game);
    if (due !== null) deadlines.push(due);
    const deadline = deadlines.length ? Math.max(Math.min(...deadlines), now + 50) : null;
    if (deadline !== this.scheduledAlarm) {
      if (deadline !== null) await this.ctx.storage.setAlarm(deadline);
      else await this.ctx.storage.deleteAlarm();
      this.scheduledAlarm = deadline;
    }
  }

  async advance() {
    const game = this.game();
    if (!this.room || !game) return;
    const now = Date.now();
    const expired = this.expireConnections(now);
    const next = recoverRoom(tickMatch(this.room, game, now), this.online(now), now);
    if (next !== this.room) {
      await this.persist(next);
      await this.schedule();
      this.publish();
    } else if (expired) {
      await this.schedule();
      this.publish();
    }
  }

  async expireIfNeeded() {
    const r = this.room;
    if (r && r.emptySince !== null && Date.now() - r.emptySince >= EMPTY_ROOM_TTL && !this.online().length) {
      await this.persist(null);
      for (const c of this.sockets()) {
        this.send(c, { type: 'removed', reason: 'ROOM_NOT_FOUND' });
        c.close(4404, 'ROOM_NOT_FOUND');
      }
    }
  }

  publish() {
    const room = this.room;
    const game = this.game();
    const now = Date.now();
    // Bots are always "online" for display, but never keep an empty room alive.
    const online = [...this.online(now), ...(room?.members.filter((m) => m.bot).map((m) => m.id) ?? [])];
    for (const c of this.sockets()) {
      const s = c.state;
      if (!s || s.expired || (!s.memberId && !s.screen)) continue;
      if (!room || !game) {
        this.send(c, { type: 'removed', reason: 'ROOM_NOT_FOUND' });
        c.close(4404, 'ROOM_NOT_FOUND');
        continue;
      }
      if (s.memberId && !room.members.some((m) => m.id === s.memberId)) {
        this.send(c, { type: 'removed', reason: 'REMOVED' });
        c.close(4403, 'REMOVED');
        continue;
      }
      this.send(c, { type: 'snapshot', serverNow: now, room: roomView(room, s.memberId ?? null, online, game, now, this.botsEnabled()) });
    }
    this.driveBots();
  }

  /** Give every bot seat that has something to do a short "thinking" delay, then act. */
  driveBots() {
    const room = this.room;
    const game = this.game();
    if (!room?.match || !game?.bot) return;
    const ctx = () => ({ now: Date.now(), adminId: this.room?.adminId ?? '' });
    for (const id of room.match.seatIds) {
      if (!room.members.find((m) => m.id === id)?.bot || this.botTimers.has(id)) continue;
      const view = game.view(room.match.state, { kind: 'player', seatId: id }, ctx());
      if (!game.bot(view, id, secureRandom)) continue;
      const delay = game.botDelay?.(view, secureRandom) ?? 900 + secureRandom() * 1500;
      const timer = setTimeout(
        () =>
          void this.exclusive(async () => {
            this.botTimers.delete(id);
            const r = this.room;
            if (!r?.match || !r.match.seatIds.includes(id)) return;
            // Decide again with the latest state: things may have moved on while it "thought".
            const action = game.bot!(game.view(r.match.state, { kind: 'player', seatId: id }, ctx()), id, secureRandom);
            if (action) {
              try {
                const next = matchCommand(r, id, { matchId: r.match.id, version: r.match.version, action }, game, Date.now());
                await this.persist(next);
                await this.advance();
                await this.schedule();
              } catch {
                // A rejected bot move just gets retried on the next publish.
              }
            }
            this.publish();
          }),
        delay,
      );
      this.botTimers.set(id, timer);
    }
  }

  async onRequest(request: Request) {
    return this.exclusive(async () => {
      try {
        const path = new URL(request.url).pathname;
        if (request.method === 'GET' && path.endsWith('/health')) return Response.json({ ok: true }, { headers: noStore });
        if (request.method !== 'POST') throw new RoomError('NOT_FOUND', 404);
        const isCreate = path.endsWith('/create');
        if (!isCreate && !path.endsWith('/join')) throw new RoomError('NOT_FOUND', 404);
        const data = await readJSON(request);
        await this.expireIfNeeded();
        await this.advance();
        const hash = await sessionHash(data.token);
        const identity = parseIdentity(data);
        const now = Date.now();
        let memberId: string;
        let status: string;
        if (isCreate) {
          if (this.room) throw new RoomError('ROOM_EXISTS', 409);
          const game = serverGames[String(data.gameId)];
          if (!game) throw new RoomError('GAME_NOT_FOUND', 404);
          const room = createRoom(this.name, game, identity, hash, now);
          await this.persist(room);
          memberId = room.members[0]!.id;
          status = 'admitted';
        } else {
          const game = this.game();
          if (!this.room || !game) throw new RoomError('ROOM_NOT_FOUND', 404);
          const result = joinRoom(this.room, game, identity, hash, now);
          await this.persist(result.room);
          memberId = result.member.id;
          status = result.member.status;
        }
        await this.schedule();
        this.publish();
        return Response.json(
          { ok: true, code: this.room!.code, memberId, status },
          { status: isCreate ? 201 : 200, headers: noStore },
        );
      } catch (error) {
        return errorResponse(error);
      }
    });
  }

  async onConnect(connection: Socket, _ctx: ConnectionContext) {
    return this.exclusive(async () => {
      if (!this.room) {
        connection.close(4404, 'ROOM_NOT_FOUND');
        return;
      }
      this.expireConnections(Date.now());
      const waiting = this.sockets().filter((c) => !c.state?.memberId && !c.state?.screen && !c.state?.expired);
      if (waiting.length > MAX_UNAUTHENTICATED) {
        connection.setState({ expired: true });
        connection.close(4429, 'TOO_MANY_CONNECTIONS');
        return;
      }
      connection.setState({ authDeadline: Date.now() + AUTH_DEADLINE });
      await this.schedule();
      this.send(connection, { type: 'hello' });
    });
  }

  async onMessage(connection: Socket, message: WSMessage) {
    return this.exclusive(async () => {
      let requestId: string | null = null;
      try {
        if (typeof message !== 'string' || message.length > MAX_MESSAGE) throw new RoomError('TOO_LARGE', 413);
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(message);
        } catch {
          throw new RoomError('BAD_JSON');
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RoomError('BAD_JSON');
        requestId = typeof data.requestId === 'string' ? data.requestId.slice(0, 80) : null;
        const state = connection.state ?? {};
        if (state.expired) throw new RoomError('SESSION_INVALID', 401);
        const now = Date.now();
        const authed = state.memberId || state.screen;
        if (!authed && state.authDeadline != null && now >= state.authDeadline) throw new RoomError('SESSION_INVALID', 401);
        // Ignore redundant heartbeats before advancing timers or touching storage.
        if (data.type === 'HEARTBEAT' && authed && state.heartbeatAt != null && now - state.heartbeatAt < HEARTBEAT_INTERVAL) return;

        await this.expireIfNeeded();
        await this.advance();
        if (!this.room) throw new RoomError('ROOM_NOT_FOUND', 404);

        if (data.type === 'AUTH' || data.type === 'SCREEN') {
          if (authed) throw new RoomError('BAD_ACTION');
          if (data.type === 'SCREEN') {
            if (this.sockets().filter((c) => c.state?.screen && !c.state.expired).length >= MAX_SCREENS)
              throw new RoomError('TOO_MANY_CONNECTIONS', 429);
            connection.setState({ screen: true, seenAt: now });
          } else {
            const member = memberForHash(this.room, await sessionHash(data.token));
            if (!member) throw new RoomError('SESSION_INVALID', 401);
            const live = this.sockets().filter((c) => c.state?.memberId && !c.state.expired);
            if (live.length >= MAX_AUTHENTICATED) throw new RoomError('TOO_MANY_CONNECTIONS', 429);
            if (live.filter((c) => c.state?.memberId === member.id).length >= 4) throw new RoomError('TOO_MANY_CONNECTIONS', 429);
            connection.setState({ memberId: member.id, windowAt: now, count: 0, seenAt: now });
          }
          await this.advance();
          await this.schedule();
          this.publish();
          return;
        }

        if (!authed) throw new RoomError('SESSION_INVALID', 401);
        if (data.type === 'HEARTBEAT') {
          connection.setState({ ...state, seenAt: now, heartbeatAt: now });
          await this.schedule();
          this.send(connection, { type: 'heartbeat' });
          return;
        }
        if (state.screen) throw new RoomError('SCREEN_READ_ONLY', 403);
        const memberId = state.memberId!;
        if (!this.room.members.some((m) => m.id === memberId)) throw new RoomError('SESSION_INVALID', 401);

        const windowAt = now - (state.windowAt ?? 0) > 10_000 ? now : state.windowAt!;
        const count = windowAt === state.windowAt ? (state.count ?? 0) + 1 : 1;
        connection.setState({ ...state, windowAt, count, seenAt: now });
        if (count > 45) throw new RoomError('RATE_LIMIT', 429);

        const game = this.game()!;
        let next: Room;
        if (data.type === 'START') next = startMatch(this.room, memberId, game, await loadContent(this.env, game.meta.id), now);
        else if (data.type === 'END_MATCH') next = endMatch(this.room, memberId, now);
        else if (data.type === 'GAME') next = matchCommand(this.room, memberId, data, game, now);
        else {
          next = lobbyAction(this.room, memberId, data, serverGames, now, { bots: this.botsEnabled() });
          if (next.adminId === null) next = { ...next, members: [] };
        }
        await this.persist(next);
        await this.advance();
        await this.schedule();
        this.send(connection, { type: 'ack', requestId });
        this.publish();
      } catch (error) {
        const code = error instanceof RoomError ? error.code : 'SERVER_ERROR';
        if (!(error instanceof RoomError)) console.error(error);
        this.send(connection, { type: 'error', requestId, error: code });
        if (['SESSION_INVALID', 'ROOM_NOT_FOUND'].includes(code)) connection.close(4401, code);
      }
    });
  }

  async onClose() {
    return this.exclusive(async () => {
      await this.advance();
      await this.schedule();
      this.publish();
    });
  }

  async onError() {
    return this.onClose();
  }

  async onAlarm() {
    return this.exclusive(async () => {
      this.scheduledAlarm = null;
      await this.expireIfNeeded();
      await this.advance();
      if (this.room) {
        await this.schedule();
        this.publish();
      }
    });
  }
}

function parseIdentity(data: Record<string, unknown>): Identity {
  const portrait = data.portrait as AssetRef | null | undefined;
  const validPortrait =
    portrait &&
    typeof portrait === 'object' &&
    typeof portrait.key === 'string' &&
    /^[a-f0-9]{16,64}$/.test(portrait.key) &&
    Array.isArray(portrait.widths) &&
    portrait.widths.every((w) => Number.isInteger(w) && w > 0 && w <= 2048) &&
    typeof portrait.thumb === 'string' &&
    portrait.thumb.length < 200 &&
    typeof portrait.aspect === 'number';
  return {
    name: String(data.name ?? ''),
    rosterId: typeof data.rosterId === 'string' ? data.rosterId.slice(0, 64) : null,
    portrait: validPortrait ? { key: portrait.key, widths: portrait.widths, thumb: portrait.thumb, aspect: portrait.aspect } : null,
  };
}


