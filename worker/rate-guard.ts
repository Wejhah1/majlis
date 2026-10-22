// One durable coordinator bounds sensitive actions across Worker instances (ported from
// passnames' room-limits.js). Rolling timestamps avoid boundary bursts; rejections don't write.
import { Server } from 'partyserver';
import { sha256Hex } from './http';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const LIMITS = {
  'room-create': { keyHour: 12, allHour: 60, allDay: 300 },
  'admin-login': { keyHour: 10, allHour: 40, allDay: 200 },
} as const;

export type Bucket = keyof typeof LIMITS;
type Entry = { key: string; at: number };

export function consume(previous: Entry[] | undefined, bucket: Bucket, key: string, now: number) {
  const limits = LIMITS[bucket];
  const recent = (previous ?? []).filter((item) => now - item.at < DAY);
  const checks: [Entry[], number, number][] = [
    [recent.filter((item) => item.key === key && now - item.at < HOUR), limits.keyHour, HOUR],
    [recent.filter((item) => now - item.at < HOUR), limits.allHour, HOUR],
    [recent, limits.allDay, DAY],
  ];
  const waits = checks
    .filter(([items, limit]) => items.length >= limit)
    .map(([items, limit, period]) => items[items.length - limit]!.at + period - now);
  const wait = Math.max(0, ...waits);
  if (wait) return { ok: false as const, retryAfter: Math.max(1, Math.ceil(wait / 1000)) };
  return { ok: true as const, state: [...recent, { key, at: now }] };
}

export class RateGuardServer extends Server<Env> {
  work: Promise<unknown> = Promise.resolve();

  onRequest(request: Request): Promise<Response> {
    const operation = this.work.then(async () => {
      const { bucket, key } = (await request.json()) as { bucket: Bucket; key: string };
      if (!(bucket in LIMITS) || !/^[a-f0-9]{64}$/.test(key)) return new Response('Bad request', { status: 400 });
      const result = consume(await this.ctx.storage.get<Entry[]>(bucket), bucket, key, Date.now());
      if (!result.ok)
        return Response.json(
          { ok: false, error: 'RATE_LIMIT' },
          { status: 429, headers: { 'Retry-After': String(result.retryAfter), 'Cache-Control': 'no-store' } },
        );
      await this.ctx.storage.put(bucket, result.state);
      return Response.json({ ok: true });
    });
    this.work = operation.catch(() => {});
    return operation;
  }
}

/** Returns a 429 Response when over the limit, or null when the action may proceed. */
export async function rateLimit(request: Request, env: Env, bucket: Bucket): Promise<Response | null> {
  // Cloudflare supplies CF-Connecting-IP; never trust caller-controlled forwarded headers.
  const key = await sha256Hex(request.headers.get('CF-Connecting-IP') ?? 'local');
  const stub = env.RateGuard.get(env.RateGuard.idFromName('rate-guard-v1'));
  const response = await stub.fetch(
    new Request('https://guard.internal/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-partykit-room': 'rate-guard-v1' },
      body: JSON.stringify({ bucket, key }),
    }),
  );
  return response.ok ? null : response;
}
