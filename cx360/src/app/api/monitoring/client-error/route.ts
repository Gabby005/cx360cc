import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { recordError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

/** Screens that crash in someone's browser report here (signed-in users only, small payloads). */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const text = await req.text();
    if (text.length > 8000) return NextResponse.json({ ok: false }, { status: 413 });
    const b = JSON.parse(text) as { message?: string; stack?: string; path?: string };
    const err = new Error(String(b.message ?? "Client error").slice(0, 500));
    err.stack = String(b.stack ?? "").slice(0, 3000);
    await recordError("client", err, { path: String(b.path ?? "").slice(0, 200), userId: ctx.userId, tenantId: ctx.tenantId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
