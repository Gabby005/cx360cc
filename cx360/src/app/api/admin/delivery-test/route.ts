import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { deliver, parseDeliverySettings } from "@/lib/delivery";

export const dynamic = "force-dynamic";

/**
 * Sends a real test straight through the saved gateway (not via the queue) so
 * the admin sees the gateway's answer immediately. Recorded in the Delivery log.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const { channel, to } = z.object({ channel: z.enum(["email", "sms"]), to: z.string().trim().min(3).max(200) }).parse(await req.json());
    if (channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new ApiError(400, "Enter a valid email address.");
    if (channel === "sms" && !/^\+?[\d\s()-]{7,20}$/.test(to)) throw new ApiError(400, "Enter a valid phone number, e.g. 08031234567.");

    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, deliverySettings: true } });
    const settings = parseDeliverySettings(t?.deliverySettings);
    const subject = channel === "email" ? `[TEST] ${t?.name ?? "CX360"} delivery check` : undefined;
    const message = `This is a test message from ${t?.name ?? "CX360"}. If you can read this, delivery is working.`;

    const res = await deliver(settings, { channel, to, subject, message });
    await prisma.notificationLog.create({
      data: { tenantId: ctx.tenantId, channel, to, subject, message, kind: "test.delivery", status: res.ok ? "sent" : "failed", attempts: 1, sentAt: res.ok ? new Date() : null, lastError: res.ok ? null : (res.error ?? "").slice(0, 500) },
    });
    return NextResponse.json({ ok: res.ok, error: res.error });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
