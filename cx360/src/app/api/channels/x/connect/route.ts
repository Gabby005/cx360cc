import { NextResponse } from "next/server";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { newPkce, xAuthorizeUrl } from "@/lib/channels/x";
import { siteBase } from "@/lib/channels/x-status";

export const dynamic = "force-dynamic";

/** Admin clicks "Connect X account": send them to X to approve, remembering the PKCE secret for a few minutes. */
export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const clientId = process.env.CX360_X_CLIENT_ID;
    const base = siteBase();
    if (!clientId || !process.env.CX360_X_CLIENT_SECRET || !base) return NextResponse.redirect(`${base || ""}/admin/channels?x=missing`);
    const p = newPkce();
    const res = NextResponse.redirect(xAuthorizeUrl({ clientId, redirectUri: `${base}/api/channels/x/callback`, state: p.state, challenge: p.challenge }));
    res.cookies.set("cx360_x_oauth", JSON.stringify({ v: p.verifier, s: p.state }), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/channels/x" });
    return res;
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
