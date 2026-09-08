import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { generateTempPassword, hashPassword } from "@/lib/password";

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");

    const memberships = await prisma.membership.findMany({
      where: { tenantId: ctx.tenantId },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
      orderBy: { user: { name: "asc" } },
    });

    return NextResponse.json({ members: memberships });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMIN", "SUPERVISOR", "AGENT", "READ_ONLY"]),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");

    const body = createSchema.parse(await req.json());

    const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
    if (existingUser) {
      const existingMembership = await prisma.membership.findUnique({
        where: { userId_tenantId: { userId: existingUser.id, tenantId: ctx.tenantId } },
      });
      if (existingMembership) {
        return NextResponse.json({ error: "This person is already a member of your team." }, { status: 409 });
      }
      // User exists (e.g. from another tenant in a multi-tenant deployment)
      // but isn't on this team yet — add a membership rather than erroring,
      // no new password needed since they already have an account.
      const membership = await prisma.membership.create({
        data: { userId: existingUser.id, tenantId: ctx.tenantId, role: body.role },
        include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
      });
      return NextResponse.json({ member: membership }, { status: 201 });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: body.name, email: body.email, passwordHash } });
      const membership = await tx.membership.create({
        data: { userId: user.id, tenantId: ctx.tenantId, role: body.role },
        include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
      });
      return membership;
    });

    // Temporary password is returned exactly once, to the admin who
    // created this account, and never stored or logged in the clear —
    // same pattern as API key issuance.
    return NextResponse.json({ member: result, tempPassword }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
