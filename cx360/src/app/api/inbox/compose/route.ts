import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { sendNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { resolveAttachments } from "@/lib/attachment-db";
import { parseMessaging, withSignature } from "@/lib/messaging";

export const dynamic = "force-dynamic";

const schema = z.object({
  to: z.string().trim().toLowerCase().email("Enter a valid email address"),
  subject: z.string().trim().min(1, "Add a subject").max(300),
  message: z.string().trim().min(1, "Write a message").max(8000),
  customerId: z.string().optional(),
  attachmentIds: z.array(z.string()).max(3).optional(),
});

/** "New email": the agent starts a fresh mail to any address (an existing customer, or a new one that gets saved). */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "AGENT");
    rateLimit(`compose:${ctx.userId}`, 20, 60_000);
    const b = schema.parse(await req.json());

    const files = await resolveAttachments(ctx.tenantId, b.attachmentIds);
    let customerId = b.customerId;
    if (customerId) {
      const c = await prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId }, select: { id: true } });
      if (!c) throw new ApiError(404, "Customer not found");
    } else {
      const existing = await prisma.customer.findFirst({ where: { tenantId: ctx.tenantId, email: { equals: b.to, mode: "insensitive" } }, select: { id: true } });
      customerId = existing?.id ?? (await prisma.customer.create({
        data: { tenantId: ctx.tenantId, firstName: "Unknown", lastName: b.to, email: b.to, segment: "Unverified", customFields: { autoCreated: true, source: "email" } },
        select: { id: true },
      })).id;
    }

    const [t, me] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { messagingSettings: true } }),
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
    ]);
    const message = withSignature(b.message, me?.name ?? "Customer Service", parseMessaging(t?.messagingSettings));

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.interaction.create({
        data: { tenantId: ctx.tenantId, customerId: customerId!, agentId: ctx.userId, channel: "EMAIL", direction: "outbound", status: "IN_PROGRESS", summary: b.message + files.note, contact: b.to, subject: b.subject, readAt: new Date() },
      });
      await sendNotification(tx, { tenantId: ctx.tenantId, channel: "email", to: b.to, subject: b.subject, message, kind: "inbox.compose", attachmentIds: files.ids });
      return created;
    });
    return NextResponse.json({ interaction: row }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
