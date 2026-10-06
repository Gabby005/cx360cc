import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { exchangeXCode, xMe } from "@/lib/channels/x";
import { saveXTokens } from "@/lib/channels/token-store";
import { parseChannelSettings } from "@/lib/channels/config";
import { siteBase } from "@/lib/channels/x-status";

export const dynamic = "force-dynamic";

/** X sends the admin back here with a one-time code; swap it for tokens, save them encrypted, and remember who is connected. */
export async function GET(req: NextRequest) {
  const base = siteBase();
  const back = (q: string) => NextResponse.redirect(`${base}/admin/channels?${q}`);
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    if (req.nextUrl.searchParams.get("error") || !code || !state) return back("x=denied");

    let saved: { v?: string; s?: string } = {};
    try { saved = JSON.parse(req.cookies.get("cx360_x_oauth")?.value ?? "{}"); } catch { /* ignore */ }
    if (!saved.v || saved.s !== state) return back("x=expired");

    const clientId = process.env.CX360_X_CLIENT_ID, secret = process.env.CX360_X_CLIENT_SECRET;
    if (!clientId || !secret) return back("x=missing");
    const tok = await exchangeXCode(clientId, secret, code, `${base}/api/channels/x/callback`, saved.v);
    if (!tok.ok) return back(`x=error&msg=${encodeURIComponent(tok.error)}`);
    const me = await xMe(tok.tokens.accessToken);
    if (!me.ok) return back(`x=error&msg=${encodeURIComponent(me.error)}`);

    await saveXTokens(ctx.tenantId, tok.tokens);
    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { channelSettings: true } });
    const cur = parseChannelSettings(t?.channelSettings);
    const next = { ...cur, x: { ...cur.x, enabled: true, userId: me.id, username: me.username, webhookId: cur.x.userId === me.id ? cur.x.webhookId : "" } };
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { channelSettings: next as unknown as Prisma.InputJsonValue } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "x_connected", entity: "Channels", entityId: ctx.tenantId, after: { username: me.username } });
    const res = back("x=connected");
    res.cookies.set("cx360_x_oauth", "", { maxAge: 0, path: "/api/channels/x" });
    return res;
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return back(`x=error&msg=${encodeURIComponent("Something went wrong connecting X.")}`);
  }
}
