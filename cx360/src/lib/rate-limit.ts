import { ApiError } from "@/lib/tenant";

/**
 * Simple per-person limit for actions that send things out or store files (uploads, new emails, replies).
 * Kept in the server's memory: right for the single bank server; on a multi-instance host it limits each instance separately.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    throw new ApiError(429, "You're doing that very quickly — please wait a minute and try again.");
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}
