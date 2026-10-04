import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/monitoring";
import { runNamedJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

// Called by the Netlify scheduled function (netlify/functions/dispatch-webhooks.ts) with the CRON_SECRET.
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("x-cron-secret"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runNamedJob("dispatch-webhooks");
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
