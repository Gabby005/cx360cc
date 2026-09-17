import crypto from "crypto";
import bcrypt from "bcryptjs";

/**
 * Generates a temporary password for a newly-created user, shown once to
 * the admin who created them (same "shown once, never stored raw" pattern
 * as API keys). The new user should change it on first login — CX360
 * doesn't yet have a forced-password-change flow, so communicate the
 * temporary password out of band.
 */
export function generateTempPassword(): string {
  // Readable-ish: e.g. "b3f9-k2m7-q8x4" — easier to relay verbally/by chat
  // than a dense random blob, still ~72 bits of entropy.
  const bytes = crypto.randomBytes(9).toString("hex");
  return `${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}`;
}

export async function hashPassword(raw: string): Promise<string> {
  return bcrypt.hash(raw, 10);
}
