// Browser side of a room, ported from passnames' room-client.js: one WebSocket per room,
// heartbeat, exponential reconnect, and request/ack promises for every action.
import type { AssetRef } from '../../games/types';
import { normalizeCode, validCode, type RoomView } from './core';

const SEAT_PREFIX = 'majlis-seat:';

export function newSessionToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** Accepts a bare code, a code with dashes, or a pasted invite link. Arabic-Indic digits too. */
export function parseRoomCode(input: string) {
  let text = String(input ?? '').trim();
  try {
    const url = new URL(text);
    text = url.pathname.match(/\/(?:r|tv)\/([^/]+)/)?.[1] ?? url.searchParams.get('room') ?? text;
  } catch {
    // Not a URL.
  }
  text = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return normalizeCode(text);
}

export const formatCode = (code: string) => code.replace(/(.{3})(?=.)/g, '$1-');

export function readSeat(code: string): { token: string } | null {
  try {
    const data = JSON.parse(localStorage.getItem(SEAT_PREFIX + code) ?? 'null');
    return typeof data?.token === 'string' && /^[a-f0-9]{64}$/.test(data.token) ? data : null;
  } catch {
    return null;
  }
}

export function saveSeat(code: string, token: string) {
  try {
    localStorage.setItem(SEAT_PREFIX + code, JSON.stringify({ token }));
    return true;
  } catch {
    return false;
  }
}

export function forgetSeat(code: string) {
  try {
    localStorage.removeItem(SEAT_PREFIX + code);
  } catch {
    // Nothing stored.
  }
}

export type Identity = { name: string; rosterId?: string | null; portrait?: AssetRef | null };

export async function enterRoom(opts: { identity: Identity; code?: string; gameId?: string }) {
  const create = !opts.code;
  const code = create ? '' : parseRoomCode(opts.code!);
  if (!create && !validCode(code)) throw new Error('CODE_INVALID');
  const token = (!create && readSeat(code)?.token) || newSessionToken();
  // Known code: save before POST so a lost response can be retried without a duplicate seat.
  if (!create) saveSeat(code, token);
  const response = await fetch(create ? '/api/rooms' : `/api/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...opts.identity, gameId: opts.gameId, token }),
    signal: AbortSignal.timeout(15_000),
  });
  let data: { ok?: boolean; error?: string; code?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error('SERVER_ERROR');
  }
  if (!response.ok || !data.ok) throw new Error(data.error ?? 'SERVER_ERROR');
  saveSeat(data.code!, token);
  return { code: data.code!, token };
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';
export type ClientRoom = RoomView & { clockOffset: number };

type Options = {
  code: string;
  /** Omit for a TV screen: it joins read-only with no seat. */
  token?: string;
  onRoom(room: ClientRoom): void;
  onStatus(status: ConnectionStatus): void;
  onError(code: string): void;
  onRemoved(reason: string): void;
};

type Pending = { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };

export class RoomConnection {
  private socket: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private attempts = 0;
  private connected = false;
  private sequence = 0;
  private lastSeen = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private authTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;

  constructor(private opts: Options) {}

  open() {
    if (this.closed) return;
    clearTimeout(this.retry);
    clearTimeout(this.connectTimer);
    clearTimeout(this.authTimer);
    this.connected = false;
    this.opts.onStatus(this.attempts ? 'reconnecting' : 'connecting');
    const url = new URL(location.href);
    url.pathname = `/parties/rooms/${this.opts.code}`;
    url.search = '';
    url.hash = '';
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url.href);
    this.socket = socket;
    this.lastSeen = Date.now();
    this.connectTimer = setTimeout(() => this.restart(socket), 12_000);

    socket.onopen = () => {
      if (this.closed || this.socket !== socket) return;
      clearTimeout(this.connectTimer);
      socket.send(JSON.stringify(this.opts.token ? { type: 'AUTH', token: this.opts.token } : { type: 'SCREEN' }));
      this.authTimer = setTimeout(() => {
        if (!this.connected) this.restart(socket);
      }, 12_000);
    };
    socket.onmessage = (event) => {
      if (this.closed || this.socket !== socket) return;
      this.lastSeen = Date.now();
      if (event.data === 'pong') return;
      let data: { type: string; room?: RoomView; serverNow?: number; requestId?: string; error?: string; reason?: string };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === 'snapshot' && data.room) {
        clearTimeout(this.authTimer);
        this.connected = true;
        this.attempts = 0;
        this.opts.onStatus('connected');
        this.opts.onRoom({ ...data.room, clockOffset: typeof data.serverNow === 'number' ? data.serverNow - Date.now() : 0 });
      } else if (data.type === 'ack' || data.type === 'error') {
        const pending = data.requestId ? this.pending.get(data.requestId) : undefined;
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(data.requestId!);
          if (data.type === 'ack') pending.resolve();
          else pending.reject(new Error(data.error));
        } else if (data.type === 'error') this.opts.onError(data.error ?? 'SERVER_ERROR');
        if (data.error === 'SESSION_INVALID' || data.error === 'ROOM_NOT_FOUND') this.removed(data.error);
      } else if (data.type === 'removed') this.removed(data.reason ?? 'REMOVED');
    };
    socket.onerror = () => {}; // Browsers report the failure through onclose.
    socket.onclose = (event) => {
      if (this.closed || this.socket !== socket) return;
      this.connected = false;
      clearTimeout(this.connectTimer);
      clearTimeout(this.authTimer);
      clearInterval(this.heartbeat);
      this.failPending('DISCONNECTED');
      if (event.code === 4429) this.opts.onError('TOO_MANY_CONNECTIONS');
      if ([4401, 4403, 4404].includes(event.code)) return this.removed(event.reason || 'SESSION_INVALID');
      this.scheduleRetry();
    };
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastSeen > 65_000) return socket.close();
      socket.send(JSON.stringify({ type: 'HEARTBEAT' }));
    }, 20_000);
  }

  private scheduleRetry() {
    this.opts.onStatus('reconnecting');
    this.attempts++;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.open(), Math.min(15_000, 1000 * 2 ** Math.min(4, this.attempts - 1)));
  }

  private restart(socket: WebSocket | null = this.socket) {
    if (this.closed || this.socket !== socket) return;
    // Detach first: CONNECTING sockets need not deliver onclose promptly.
    this.socket = null;
    clearTimeout(this.connectTimer);
    clearTimeout(this.authTimer);
    clearInterval(this.heartbeat);
    this.connected = false;
    this.failPending('DISCONNECTED');
    try {
      socket?.close();
    } catch {
      // Already closed.
    }
    this.scheduleRetry();
  }

  /** Call when the tab becomes visible again: phones freeze sockets in the background. */
  wake() {
    if (this.closed) return;
    if (!this.socket || this.socket.readyState > WebSocket.OPEN || Date.now() - this.lastSeen > 65_000) this.restart();
  }

  send(action: Record<string, unknown>): Promise<void> {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('DISCONNECTED'));
    const requestId = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('ACK_TIMEOUT'));
      }, 10_000);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.socket!.send(JSON.stringify({ ...action, requestId }));
      } catch {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new Error('DISCONNECTED'));
      }
    });
  }

  private failPending(code: string) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(code));
    }
    this.pending.clear();
  }

  private removed(reason: string) {
    if (this.closed) return;
    this.stop();
    this.opts.onRemoved(reason);
  }

  stop() {
    this.closed = true;
    this.connected = false;
    clearTimeout(this.retry);
    clearTimeout(this.connectTimer);
    clearTimeout(this.authTimer);
    clearInterval(this.heartbeat);
    this.failPending('DISCONNECTED');
    this.socket?.close();
  }
}
