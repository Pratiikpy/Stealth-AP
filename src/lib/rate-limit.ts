/**
 * In-memory sliding-window rate limiter.
 *
 * Keyed on any string (typically IP address). Per-Vercel-container so it's
 * not a strong DDoS shield, but it's plenty for defense-in-depth against
 * brute-force token guessing on endpoints like /api/approvals/email —
 * any single attacker hammering a single edge container trips it.
 *
 * For true cross-region, cross-container rate limiting, swap this out for
 * Upstash Redis or Vercel KV (both expose the same key/window semantics).
 */
interface WindowEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();

/**
 * Returns true if `key` is allowed to proceed, false if over the limit.
 * `max` requests per `windowMs` milliseconds.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistically evict stale entries so the Map doesn't grow unbounded
    // under a long-lived serverless instance.
    if (buckets.size > 1000) {
      for (const [k, v] of buckets) {
        if (now >= v.resetAt) buckets.delete(k);
      }
    }
    return true;
  }

  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

/**
 * Best-effort client IP extraction from a Next.js request. Reads the
 * standard proxy/forwarded headers Vercel populates.
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
