import crypto from "crypto";
import bcrypt from "bcryptjs";

/**
 * Generates a temporary password for a newly-created user, shown once to
 * the admin who created them (same "shown once, never stored raw" pattern
 * as API keys). The account is flagged mustChangePassword, so the person is
 * taken to the change-password screen on first sign-in.
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

const COMMON = new Set(["password", "password1", "password123", "123456789", "1234567890", "qwerty123", "letmein123", "welcome123", "admin12345", "cx360demo", "demo1234"]);

/** Returns a plain-English problem with the password, or null if it's acceptable. */
export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Include at least one letter and one number.";
  if (COMMON.has(pw.toLowerCase())) return "That password is too common — pick something less guessable.";
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) return "Don't use your email name inside the password.";
  return null;
}
