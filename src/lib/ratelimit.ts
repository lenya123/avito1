/**
 * Простой in-memory rate-limiter.
 * Для production-окружения с несколькими инстансами заменить на @upstash/ratelimit.
 *
 * Использование:
 *   const result = checkRateLimit(`login:${ip}`, { limit: 5, windowMs: 60_000 });
 *   if (!result.allowed) return 429;
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Периодический cleanup чтобы Map не рос бесконечно
let lastCleanup = Date.now();
function maybeCleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt < now) buckets.delete(key);
  });
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  maybeCleanup(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    const fresh: Bucket = { count: 1, resetAt: now + opts.windowMs };
    buckets.set(key, fresh);
    return { allowed: true, remaining: opts.limit - 1, resetAt: fresh.resetAt };
  }

  if (bucket.count >= opts.limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: opts.limit - bucket.count, resetAt: bucket.resetAt };
}

/** Извлекает IP клиента из заголовков (Vercel/Cloudflare-friendly). */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff;
  const xri = headers.get("x-real-ip");
  if (xri) return xri;
  // Fallback: хеш user-agent чтобы клиенты без заголовков не делили один бакет.
  const ua = headers.get("user-agent") ?? "";
  if (ua) {
    let hash = 0;
    for (let i = 0; i < ua.length; i++) hash = ((hash << 5) - hash + ua.charCodeAt(i)) | 0;
    return `ua-${(hash >>> 0).toString(36)}`;
  }
  return "unknown";
}
