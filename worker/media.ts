// Card images live in R2 when a bucket is bound, otherwise in D1. R2 needs a payment method
// on file even on the free tier, so D1 keeps "fork and deploy" card-free. Either way the
// files are immutable (content-hashed keys) and cached at Cloudflare's edge after first read.
import { db } from './db';

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export async function putMedia(env: Env, key: string, body: ArrayBuffer, type: string) {
  if (env.MEDIA) {
    await env.MEDIA.put(key, body, { httpMetadata: { contentType: type, cacheControl: CACHE_CONTROL } });
    return;
  }
  await (await db(env))
    .prepare('INSERT INTO media (key, type, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO NOTHING')
    .bind(key, type, body, Date.now())
    .run();
}

async function readMedia(env: Env, key: string): Promise<{ body: BodyInit; type: string } | null> {
  if (env.MEDIA) {
    const object = await env.MEDIA.get(key);
    return object ? { body: object.body, type: object.httpMetadata?.contentType ?? 'image/webp' } : null;
  }
  const row = await (await db(env)).prepare('SELECT type, data FROM media WHERE key = ?').bind(key).first<{ type: string; data: ArrayBuffer | number[] }>();
  if (!row) return null;
  return { body: row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data), type: row.type };
}

export async function serveMedia(request: Request, env: Env, ctx: ExecutionContext, path: string): Promise<Response> {
  const key = path.slice('/media/'.length).replace(/\.(webp|jpg)$/, '');
  if (!/^[a-f0-9]{16,64}-\d{2,4}$/.test(key)) return new Response('Not found', { status: 404 });
  const cache = caches.default;
  const cacheKey = new Request(new URL(`/media/${key}`, request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const found = await readMedia(env, key);
  if (!found) return new Response('Not found', { status: 404 });
  const response = new Response(found.body, {
    headers: { 'Content-Type': found.type, 'Cache-Control': CACHE_CONTROL, ETag: `"${key}"` },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
