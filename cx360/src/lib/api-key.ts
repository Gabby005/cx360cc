import crypto from "crypto";

const PREFIX = "cx360_";

/**
 * Generates a new API key. Only the SHA-256 hash is ever persisted — the
 * raw key is returned once, to the caller, at creation time and never
 * again, the same way Stripe/GitHub/etc. handle API key issuance. If a
 * customer loses the raw value, the only recovery path is revoking and
 * issuing a new one.
 */
export function generateApiKey(): { raw: string; hash: string } {
  const raw = PREFIX + crypto.randomBytes(24).toString("base64url");
  return { raw, hash: hashApiKey(raw) };
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Masks a raw key for display in lists, e.g. "cx360_a1b2••••••••wxyz". */
export function maskApiKey(raw: string): string {
  if (raw.length <= 10) return "••••••••";
  return `${raw.slice(0, 10)}${"•".repeat(8)}${raw.slice(-4)}`;
}
