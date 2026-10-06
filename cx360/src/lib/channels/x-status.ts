import { prisma } from "@/lib/prisma";
import { parseChannelSettings } from "./config";

export type XStatus = { connected: boolean; username: string; userId: string; webhookId: string };

/** What the Channels screen shows for X: is an account connected, and are incoming messages switched on. */
export async function loadXStatus(tenantId: string): Promise<XStatus> {
  const [t, tok] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { channelSettings: true } }),
    prisma.channelToken.findUnique({ where: { tenantId_provider: { tenantId, provider: "x" } }, select: { id: true } }),
  ]);
  const x = parseChannelSettings(t?.channelSettings).x;
  return { connected: !!tok, username: x.username, userId: x.userId, webhookId: x.webhookId };
}

export const siteBase = () => (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
