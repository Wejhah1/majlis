// Admin auth + dashboard API. A fresh deploy is "unclaimed": the first visitor to /admin sets
// the password (or set ADMIN_PASSWORD as a Worker secret to skip that). Sessions are an
// HMAC-signed, HttpOnly cookie.
import { RoomError } from '../src/platform/room/core';
import { db, getGroup, getRoster, getSetting, listContent, setSetting, type GroupSettings } from './db';
import { errorResponse, noStore, readJSON } from './http';
import { putMedia } from './media';
import { rateLimit } from './rate-guard';

const COOKIE = 'majlis_admin';
const SESSION_DAYS = 30;
const ITERATIONS = 100_000;
const enc = new TextEncoder();

type StoredPassword = { salt: string; hash: string; iterations: number };

const hex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))].map((n) => n.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sessionKey(env: Env) {
  let secret = await getSetting<string>(env, 'sessionKey');
  if (!secret) {
    secret = hex(crypto.getRandomValues(new Uint8Array(32)));
    await setSetting(env, 'sessionKey', secret);
  }
  return crypto.subtle.importKey('raw', unhex(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(env: Env, payload: string) {
  return hex(await crypto.subtle.sign('HMAC', await sessionKey(env), enc.encode(payload)));
}

async function issueCookie(env: Env, request: Request) {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  const value = `${expires}.${await sign(env, String(expires))}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export async function isAdmin(request: Request, env: Env) {
  const cookie = request.headers.get('Cookie') ?? '';
  const value = cookie
    .split(/;\s*/)
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!value) return false;
  const [expires, mac] = value.split('.');
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return timingSafeEqual(mac, await sign(env, expires));
}

async function claimed(env: Env) {
  return Boolean(env.ADMIN_PASSWORD) || Boolean(await getSetting<StoredPassword>(env, 'admin'));
}

async function checkPassword(env: Env, password: string) {
  if (env.ADMIN_PASSWORD) return timingSafeEqual(password, env.ADMIN_PASSWORD);
  const stored = await getSetting<StoredPassword>(env, 'admin');
  if (!stored) return false;
  return timingSafeEqual(await derive(password, unhex(stored.salt), stored.iterations), stored.hash);
}

function validPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) throw new RoomError('PASSWORD_WEAK');
  return value;
}

const ok = (data: object = {}, headers: HeadersInit = {}) => Response.json({ ok: true, ...data }, { headers: { ...noStore, ...headers } });

const ID = /^[a-z0-9-]{1,64}$/;
const KEY = /^[a-f0-9]{16,64}$/;

function assetRef(value: unknown) {
  const a = value as { key?: unknown; widths?: unknown; thumb?: unknown; aspect?: unknown };
  if (
    !a ||
    typeof a.key !== 'string' ||
    !KEY.test(a.key) ||
    !Array.isArray(a.widths) ||
    !a.widths.every((w) => Number.isInteger(w) && w > 0 && w <= 2048) ||
    typeof a.thumb !== 'string' ||
    a.thumb.length > 200 ||
    typeof a.aspect !== 'number'
  )
    throw new RoomError('ASSET_INVALID');
  return { key: a.key, widths: a.widths as number[], thumb: a.thumb, aspect: a.aspect };
}

const text = (v: unknown, max: number, code = 'TEXT_INVALID') => {
  if (typeof v !== 'string') throw new RoomError(code);
  const t = v.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!t || t.length > max) throw new RoomError(code);
  return t;
};

const CONTENT_KINDS: Record<string, (data: Record<string, unknown>) => unknown> = {
  words: (d) => {
    if (!Array.isArray(d.words) || d.words.length > 2000) throw new RoomError('WORDS_INVALID');
    return { words: [...new Set(d.words.map((w) => text(w, 40, 'WORDS_INVALID')))] };
  },
  picture: (d) => ({ asset: assetRef(d.asset) }),
  agentPhoto: (d) => ({ asset: assetRef(d.asset) }),
  cardBack: (d) => ({ asset: assetRef(d.asset) }),
  roleArt: (d) => ({ role: text(d.role, 30), asset: assetRef(d.asset) }),
  question: (d) => ({
    prompt: text(d.prompt, 300),
    answer: text(d.answer, 60),
    category: text(d.category ?? 'منوعات', 30),
    image: d.image ? assetRef(d.image) : null,
  }),
  puzzle: (d) => {
    if (!Array.isArray(d.tiles) || d.tiles.length < 1 || d.tiles.length > 6) throw new RoomError('PUZZLE_INVALID');
    const tiles = d.tiles.map((t: { kind?: string; text?: unknown; asset?: unknown }) =>
      t?.kind === 'image' ? { kind: 'image', asset: assetRef(t.asset) } : { kind: 'text', text: text(t?.text, 20) },
    );
    return { tiles, answer: text(d.answer, 60), hint: d.hint ? text(d.hint, 40) : undefined };
  },
};

/** Single-instance kinds replace the previous row instead of adding another. */
const SINGLE = new Set(['words', 'cardBack']);

export async function handleAdmin(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const method = request.method;
    if (path === '/api/admin/status' && method === 'GET') {
      return ok({ claimed: await claimed(env), authed: await isAdmin(request, env), envPassword: Boolean(env.ADMIN_PASSWORD) });
    }
    if (method !== 'GET' && request.headers.get('Origin') && request.headers.get('Origin') !== new URL(request.url).origin)
      throw new RoomError('ORIGIN_DENIED', 403);

    if (path === '/api/admin/claim' && method === 'POST') {
      if (await claimed(env)) throw new RoomError('ALREADY_CLAIMED', 409);
      const { password } = await readJSON(request);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      await setSetting(env, 'admin', { salt: hex(salt), hash: await derive(validPassword(password), salt, ITERATIONS), iterations: ITERATIONS });
      return ok({}, { 'Set-Cookie': await issueCookie(env, request) });
    }
    if (path === '/api/admin/login' && method === 'POST') {
      const limited = await rateLimit(request, env, 'admin-login');
      if (limited) return limited;
      const { password } = await readJSON(request);
      if (typeof password !== 'string' || !(await checkPassword(env, password))) throw new RoomError('WRONG_PASSWORD', 401);
      return ok({}, { 'Set-Cookie': await issueCookie(env, request) });
    }
    if (path === '/api/admin/logout' && method === 'POST') {
      return ok({}, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
    }

    if (!(await isAdmin(request, env))) throw new RoomError('ADMIN_REQUIRED', 401);
    const d = await db(env);

    if (path === '/api/admin/data' && method === 'GET') {
      const defaults: Record<string, boolean> = {};
      for (const game of ['passnames', 'kalak', 'picture-puzzle'])
        defaults[game] = ((await getSetting<{ include: boolean }>(env, `defaults:${game}`)) ?? { include: true }).include;
      return ok({ group: await getGroup(env), members: await getRoster(env), content: await listContent(env), defaults });
    }
    if (path === '/api/admin/password' && method === 'POST') {
      if (env.ADMIN_PASSWORD) throw new RoomError('ENV_PASSWORD', 409);
      const { password } = await readJSON(request);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      await setSetting(env, 'admin', { salt: hex(salt), hash: await derive(validPassword(password), salt, ITERATIONS), iterations: ITERATIONS });
      await setSetting(env, 'sessionKey', hex(crypto.getRandomValues(new Uint8Array(32))));
      return ok({}, { 'Set-Cookie': await issueCookie(env, request) });
    }
    if (path === '/api/admin/group' && method === 'POST') {
      const data = await readJSON(request);
      const accent = data.accent === null || data.accent === '' ? null : text(data.accent, 40);
      if (accent && !/^#[0-9a-f]{6}$/i.test(accent)) throw new RoomError('ACCENT_INVALID');
      const group: GroupSettings = { name: text(data.name, 40), accent, tagline: data.tagline ? text(data.tagline, 80) : '' };
      await setSetting(env, 'group', group);
      return ok({ group });
    }
    if (path === '/api/admin/defaults' && method === 'POST') {
      const data = await readJSON(request);
      const game = text(data.game, 40);
      await setSetting(env, `defaults:${game}`, { include: data.include !== false });
      return ok();
    }
    if (path === '/api/admin/members' && method === 'POST') {
      const data = await readJSON(request);
      const id = data.id ? text(data.id, 64) : crypto.randomUUID();
      if (!ID.test(id)) throw new RoomError('ID_INVALID');
      const portrait = data.portrait ? JSON.stringify(assetRef(data.portrait)) : null;
      await d
        .prepare(
          `INSERT INTO members (id, name, portrait, sort, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET name = excluded.name, portrait = excluded.portrait`,
        )
        .bind(id, text(data.name, 24, 'NAME_INVALID'), portrait, Number(data.sort) || 0, Date.now())
        .run();
      return ok({ members: await getRoster(env) });
    }
    const memberMatch = path.match(/^\/api\/admin\/members\/([a-z0-9-]{1,64})$/);
    if (memberMatch && method === 'DELETE') {
      await d.prepare('DELETE FROM members WHERE id = ?').bind(memberMatch[1]!).run();
      return ok({ members: await getRoster(env) });
    }
    if (path === '/api/admin/upload' && method === 'PUT') {
      const url = new URL(request.url);
      const key = url.searchParams.get('key') ?? '';
      const width = Number(url.searchParams.get('w'));
      const type = request.headers.get('Content-Type') ?? '';
      if (!KEY.test(key) || !Number.isInteger(width) || width < 16 || width > 2048) throw new RoomError('UPLOAD_INVALID');
      if (!['image/webp', 'image/jpeg'].includes(type)) throw new RoomError('UPLOAD_TYPE', 415);
      const body = await request.arrayBuffer();
      if (body.byteLength > 800_000) throw new RoomError('TOO_LARGE', 413);
      await putMedia(env, `${key}-${width}`, body, type);
      return ok({ bytes: body.byteLength });
    }
    if (path === '/api/admin/content' && method === 'POST') {
      const data = await readJSON(request, 32_768);
      const game = text(data.game, 40);
      const kind = text(data.kind, 20);
      const parse = CONTENT_KINDS[kind];
      if (!parse) throw new RoomError('KIND_INVALID');
      const row = parse((data.data ?? {}) as Record<string, unknown>);
      if (SINGLE.has(kind)) await d.prepare('DELETE FROM content WHERE game = ? AND kind = ?').bind(game, kind).run();
      const id = crypto.randomUUID();
      await d
        .prepare('INSERT INTO content (id, game, kind, data, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, game, kind, JSON.stringify(row), Date.now())
        .run();
      return ok({ id });
    }
    const contentMatch = path.match(/^\/api\/admin\/content\/([a-f0-9-]{36})$/);
    if (contentMatch && method === 'DELETE') {
      await d.prepare('DELETE FROM content WHERE id = ?').bind(contentMatch[1]!).run();
      return ok();
    }
    throw new RoomError('NOT_FOUND', 404);
  } catch (error) {
    return errorResponse(error);
  }
}
