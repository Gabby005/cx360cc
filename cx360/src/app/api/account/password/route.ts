import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";
import { hashPassword, passwordProblem } from "@/lib/password";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const schema = z.object({ current: z.string().min(1, "Enter your current password"), next: z.string().min(1, "Enter a new password") });

/** Signed-in person changes their own password. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const b = schema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
    if (!user) throw new ApiError(401, "Not authenticated");
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new ApiError(429, "Too many wrong attempts. Try again in a few minutes.");

    if (!(await bcrypt.compare(b.current, user.passwordHash))) {
      const fails = user.failedLogins + 1;
      await prisma.user.update({ where: { id: user.id }, data: fails >= 5 ? { failedLogins: 0, lockedUntil: new Date(Date.now() + 15 * 60_000) } : { failedLogins: fails } });
      throw new ApiError(400, "Your current password is not right.");
    }
    const problem = passwordProblem(b.next, user.email);
    if (problem) throw new ApiError(400, problem);
    if (b.next === b.current) throw new ApiError(400, "Pick a new password, different from the current one.");

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(b.next), mustChangePassword: false, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null },
    });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "password_changed", entity: "User", entityId: user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
