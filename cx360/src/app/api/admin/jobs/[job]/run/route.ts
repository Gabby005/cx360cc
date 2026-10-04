import { NextResponse } from "next/server";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { isJobName, runNamedJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

/** "Run now" button on the System health page. */
export async function POST(_req: Request, { params }: { params: { job: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    if (!isJobName(params.job)) throw new ApiError(404, "Unknown job");
    const r = await runNamedJob(params.job);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
