import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { hashApiKey } from "./api-key";
import { ApiError } from "./tenant";

export type ApiKeyContext = { tenantId: string; apiKeyId: string };

/**
 * Authenticates an external API request via `X-API-Key` header (or
 * `Authorization: Bearer <key>`). This is the auth path for the
 * "API-first" surface at /api/v1/** — distinct from `requireSession()`,
 * which authenticates the browser app via cookies. Both ultimately resolve
 * to a tenantId so downstream Prisma calls are identical either way.
 */
export async function requireApiKey(req: NextRequest): Promise<ApiKeyContext> {
  const header = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!header) {
    throw new ApiError(401, "Missing API key. Send it as 'X-API-Key' or 'Authorization: Bearer <key>'.");
  }

  const hash = hashApiKey(header.trim());
  const key = await prisma.apiKey.findFirst({ where: { keyHash: hash } });

  if (!key || key.revokedAt) {
    throw new ApiError(401, "Invalid or revoked API key.");
  }

  // Fire-and-forget last-used stamp — not awaited so it never adds latency
  // to the request it's authenticating.
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { tenantId: key.tenantId, apiKeyId: key.id };
}
