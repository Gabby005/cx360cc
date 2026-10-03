import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { loadTemplates } from "@/lib/notify";
import { sendNotification } from "@/lib/notifications";
import { SAMPLE_VARS, isTemplateKey, renderTemplate } from "@/lib/notification-templates";

// Reads the signed-in session, so it must never be pre-rendered at build time.
export const dynamic = "force-dynamic";

/**
 * "Send me a test": renders an email template with sample ticket details and
 * sends it to the signed-in Super Admin through the normal notification layer
 * (so it shows in the Delivery log, and will really arrive once an email
 * provider is connected).
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const { key } = z.object({ key: z.string() }).parse(await req.json());
    if (!isTemplateKey(key)) throw new ApiError(404, "Unknown template");

    const [templates, me, tenant] = await Promise.all([
      loadTemplates(prisma, ctx.tenantId),
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { email: true } }),
      prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } }),
    ]);
    const t = templates.get(key)!;
    if (t.channel !== "email") throw new ApiError(400, "Test sends are for email templates. Use the live preview to check an SMS.");
    if (!me?.email) throw new ApiError(400, "Your account has no email address.");

    const vars = { ...SAMPLE_VARS, bankName: tenant?.name ?? SAMPLE_VARS.bankName };
    await sendNotification(prisma, {
      tenantId: ctx.tenantId,
      channel: "email",
      to: me.email,
      subject: `[TEST] ${renderTemplate(t.subject ?? "", vars)}`,
      message: renderTemplate(t.body, vars),
      kind: `test.${key}`,
    });
    return NextResponse.json({ ok: true, to: me.email });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
