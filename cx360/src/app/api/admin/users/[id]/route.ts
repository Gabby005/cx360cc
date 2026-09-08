import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

const patchSchema = z.object({ role: z.enum(["ADMIN", "SUPERVISOR", "AGENT", "READ_ONLY"]) });

// params.id is the Membership id (a user can belong to multiple tenants
// with different roles in each — role lives on the membership, not the user).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.membership.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (existing.userId === ctx.userId && body.role !== "ADMIN") {
      return NextResponse.json({ error: "You can't demote yourself." }, { status: 400 });
    }

    const membership = await prisma.membership.update({
      where: { id: existing.id },
      data: { role: body.role },
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
