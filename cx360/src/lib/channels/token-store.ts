import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptJson, encryptJson } from "./crypto";
import { refreshXToken, type XTokens } from "./x";

/** Stored X sign-in tokens (encrypted). Refreshes the short-lived access token when needed. */

export async function saveXTokens(tenantId: string, t: XTokens) {
  const data = encryptJson(t);
  await prisma.channelToken.upsert({
    where: { tenantId_provider: { tenantId, provider: "x" } },
    create: { tenantId, provider: "x", data, expiresAt: new Date(t.expiresAt) },
    update: { data, expiresAt: new Date(t.expiresAt) },
  });
}

export async function getXAccessToken(tenantId: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const clientId = process.env.CX360_X_CLIENT_ID, clientSecret = process.env.CX360_X_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false, error: "The server variables CX360_X_CLIENT_ID and CX360_X_CLIENT_SECRET aren't set." };
  try {
    return await prisma.$transaction(async (tx) => {
      // Lock the row so two overlapping jobs never use the same refresh token twice (X rotates them).
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "ChannelToken" WHERE "tenantId" = ${tenantId} AND provider = 'x' FOR UPDATE`);
      const row = await tx.channelToken.findUnique({ where: { tenantId_provider: { tenantId, provider: "x" } } });
      if (!row) return { ok: false as const, error: "X isn't connected yet (Admin → Channels → Connect X account)." };
      const t = decryptJson<XTokens>(row.data);
      if (t.expiresAt - Date.now() > 120_000) return { ok: true as const, token: t.accessToken };
      if (!t.refreshToken) return { ok: false as const, error: "The X connection expired — reconnect it in Admin → Channels." };
      const r = await refreshXToken(clientId, clientSecret, t.refreshToken);
      if (!r.ok) return { ok: false as const, error: `${r.error}. If this keeps happening, reconnect X in Admin → Channels.` };
      const next: XTokens = { accessToken: r.tokens.accessToken, refreshToken: r.tokens.refreshToken ?? t.refreshToken, expiresAt: r.tokens.expiresAt };
      await tx.channelToken.update({ where: { id: row.id }, data: { data: encryptJson(next), expiresAt: new Date(next.expiresAt) } });
      return { ok: true as const, token: next.accessToken };
    }, { timeout: 20_000 });
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? "Could not read the X connection." };
  }
}
