import { RoomError } from '../src/platform/room/core';

export const MAX_BODY = 8192;

export function errorResponse(error: unknown) {
  const known = error instanceof RoomError;
  if (!known) console.error(error);
  return Response.json(
    { ok: false, error: known ? error.code : 'SERVER_ERROR' },
    { status: known ? error.status : 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function readJSON(request: Request, limit = MAX_BODY): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.includes('application/json')) throw new RoomError('JSON_REQUIRED', 415);
  if (Number(request.headers.get('Content-Length')) > limit) throw new RoomError('TOO_LARGE', 413);
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RoomError('TOO_LARGE', 413);
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new RoomError('BAD_JSON');
  }
}

export const sameOrigin = (request: Request) => {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
};

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export async function sessionHash(token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new RoomError('SESSION_INVALID', 401);
  return sha256Hex(token);
}

export const noStore = { 'Cache-Control': 'no-store' };
