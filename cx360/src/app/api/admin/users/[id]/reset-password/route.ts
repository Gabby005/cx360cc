import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { generateTempPassword, hashPassword } from "@/lib/password";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Admin sets a new temporary password for someone (also unlocks the account). params.id is the Membership id. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const m = await prisma.membership.findFirst({ where: { id: params.id, tenantId: ctx.tenantId }, select: { userId: true, user: { select: { email: true } } } });
    if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (m.userId === ctx.userId) return NextResponse.json({ error: "Use \"Change password\" in your own menu instead." }, { status: 400 });

    const tempPassword = generateTempPassword();
    await prisma.user.update({
      where: { id: m.userId },
      data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null },
    });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "password_reset", entity: "User", entityId: m.userId, after: { email: m.user.email } });
    // Shown once, never stored in the clear.
    return NextResponse.json({ tempPassword });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
