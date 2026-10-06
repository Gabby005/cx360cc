import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { parseChannelSettings } from "@/lib/channels/config";
import { registerXWebhook, xAppToken } from "@/lib/channels/x";
import { getXAccessToken } from "@/lib/channels/token-store";
import { loadXStatus, siteBase } from "@/lib/channels/x-status";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

/** "Activate incoming messages": register our address with X and subscribe the connected account's DMs. */
export async function POST() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const clientId = process.env.CX360_X_CLIENT_ID, secret = process.env.CX360_X_CLIENT_SECRET, base = siteBase();
    if (!clientId || !secret) throw new ApiError(400, "Set CX360_X_CLIENT_ID and CX360_X_CLIENT_SECRET in Netlify first.");
    if (!base.startsWith("https://")) throw new ApiError(400, "NEXTAUTH_URL must be the live https address of the site.");
    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true, channelSettings: true } });
    const cur = parseChannelSettings(t?.channelSettings);
    if (!cur.x.userId) throw new ApiError(400, "Connect the X account first.");
    const user = await getXAccessToken(ctx.tenantId);
    if (!user.ok) throw new ApiError(400, user.error);
    const app = await xAppToken(clientId, secret);
    if (!app.ok) throw new ApiError(502, app.error);
    const r = await registerXWebhook({ appToken: app.token, userToken: user.token, userId: cur.x.userId, url: `${base}/api/channels/x?tenant=${encodeURIComponent(t?.slug ?? "")}` });
    if (!r.ok) throw new ApiError(502, r.error);
    const next = { ...cur, x: { ...cur.x, enabled: true, webhookId: r.webhookId } };
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { channelSettings: next as unknown as Prisma.InputJsonValue } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "x_webhook_registered", entity: "Channels", entityId: ctx.tenantId, after: { webhookId: r.webhookId } });
    return NextResponse.json({ x: await loadXStatus(ctx.tenantId) });
  } catch (err) {
    return handle(err);
  }
}

/** Disconnect: forget the saved sign-in and stop accepting X messages. Existing conversations stay. */
export async function DELETE() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { channelSettings: true } });
    const cur = parseChannelSettings(t?.channelSettings);
    await prisma.channelToken.deleteMany({ where: { tenantId: ctx.tenantId, provider: "x" } });
    const next = { ...cur, x: { enabled: false, userId: "", username: "", webhookId: "" } };
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { channelSettings: next as unknown as Prisma.InputJsonValue } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "x_disconnected", entity: "Channels", entityId: ctx.tenantId, before: { username: cur.x.username } });
    return NextResponse.json({ x: await loadXStatus(ctx.tenantId) });
  } catch (err) {
    return handle(err);
  }
}

function handle(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
