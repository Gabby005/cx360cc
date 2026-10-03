import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";

// Reads the signed-in session, so it must never be pre-rendered at build time.
export const dynamic = "force-dynamic";

const MAX_RESPONSE = 30 * 24 * 60; // 30 days
const MAX_RESOLUTION = 90 * 24 * 60; // 90 days

const patchSchema = z
  .object({
    responseMinutes: z.number().int().min(1, "Response time must be at least 1 minute").max(MAX_RESPONSE, "Response time can't be more than 30 days"),
    resolutionMinutes: z.number().int().min(1, "Resolution time must be at least 1 minute").max(MAX_RESOLUTION, "Resolution time can't be more than 90 days"),
    warningThresholdPct: z.number().int().min(1).max(99),
    escalationThresholdPct: z.number().int().min(1).max(100),
    businessHoursOnly: z.boolean(),
  })
  .refine((b) => b.resolutionMinutes >= b.responseMinutes, { message: "Resolution time can't be shorter than the response time." })
  .refine((b) => b.warningThresholdPct < b.escalationThresholdPct, { message: "The warning point must come before the escalation point." });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.slaPolicy.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const policy = await prisma.slaPolicy.update({ where: { id: existing.id }, data: body });

    const pick = (p: typeof existing) => ({
      priority: p.priority,
      responseMinutes: p.responseMinutes,
      resolutionMinutes: p.resolutionMinutes,
      warningThresholdPct: p.warningThresholdPct,
      escalationThresholdPct: p.escalationThresholdPct,
      businessHoursOnly: p.businessHoursOnly,
    });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "sla_policy_updated", entity: "SlaPolicy", entityId: existing.id, before: pick(existing), after: pick(policy) });

    return NextResponse.json({ policy });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
