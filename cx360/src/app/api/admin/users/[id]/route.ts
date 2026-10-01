import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

const patchSchema = z
  .object({
    role: z.enum(["ADMIN", "SUPERVISOR", "AGENT", "READ_ONLY"]).optional(),
    teamId: z.string().nullable().optional(), // null = remove from team
    unitId: z.string().nullable().optional(), // null = remove from department
  })
  .refine((b) => b.role !== undefined || b.teamId !== undefined || b.unitId !== undefined, { message: "Nothing to update." });

// params.id is the Membership id (a user can belong to multiple tenants
// with different roles in each — role lives on the membership, not the user).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.membership.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.role !== undefined && existing.userId === ctx.userId && body.role !== "ADMIN") {
      return NextResponse.json({ error: "You can't demote yourself." }, { status: 400 });
    }

    // Team / department must belong to this tenant.
    if (body.teamId) {
      const team = await prisma.team.findFirst({ where: { id: body.teamId, tenantId: ctx.tenantId }, select: { id: true } });
      if (!team) return NextResponse.json({ error: "Team not found." }, { status: 400 });
    }
    if (body.unitId) {
      const unit = await prisma.unit.findFirst({ where: { id: body.unitId, tenantId: ctx.tenantId }, select: { id: true } });
      if (!unit) return NextResponse.json({ error: "Department not found." }, { status: 400 });
    }

    const membership = await prisma.membership.update({
      where: { id: existing.id },
      data: {
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.teamId !== undefined ? { teamId: body.teamId } : {}),
        ...(body.unitId !== undefined ? { unitId: body.unitId } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
    });

    return NextResponse.json({ member: membership });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
