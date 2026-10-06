import crypto from "crypto";

/**
 * Encrypts small JSON secrets (sign-in tokens saved in the database) with
 * AES-256-GCM. The key comes from the server variable CX360_TOKEN_KEY, so a
 * copy of the database alone is not enough to read them.
 */
function keyFrom(env: Record<string, string | undefined>): Buffer {
  const raw = env.CX360_TOKEN_KEY;
  if (!raw || raw.length < 16) throw new Error("The server variable CX360_TOKEN_KEY isn't set (use a long random value).");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptJson(value: unknown, env: Record<string, string | undefined> = process.env): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyFrom(env), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

export function decryptJson<T = unknown>(blob: string, env: Record<string, string | undefined> = process.env): T {
  const b = Buffer.from(blob, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", keyFrom(env), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8")) as T;
}
