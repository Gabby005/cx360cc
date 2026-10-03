import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { TEMPLATE_BY_KEY, isTemplateKey, unknownVariables } from "@/lib/notification-templates";

// Reads the signed-in session, so it must never be pre-rendered at build time.
export const dynamic = "force-dynamic";

const schema = z.object({
  enabled: z.boolean(),
  subject: z.string().trim().max(200, "Subject is too long").optional(),
  body: z.string().trim().min(1, "The message can't be empty").max(5000, "Message is too long"),
});

export async function PUT(req: NextRequest, { params }: { params: { key: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    if (!isTemplateKey(params.key)) throw new ApiError(404, "Unknown template");
    const def = TEMPLATE_BY_KEY.get(params.key)!;
    const body = schema.parse(await req.json());

    if (def.channel === "email" && !body.subject) throw new ApiError(400, "Emails need a subject line.");
    if (def.channel === "sms" && body.body.length > 640) throw new ApiError(400, "SMS messages are limited to 640 characters (about 4 texts).");

    const bad = unknownVariables(`${body.subject ?? ""}\n${body.body}`);
    if (bad.length) throw new ApiError(400, `Unknown placeholder${bad.length > 1 ? "s" : ""}: ${bad.map((b) => `{{${b}}}`).join(", ")}. Use the buttons to insert valid ones.`);

    const before = await prisma.notificationTemplate.findUnique({ where: { tenantId_key: { tenantId: ctx.tenantId, key: params.key } }, select: { enabled: true, subject: true } });
    const data = { enabled: def.alwaysOn ? true : body.enabled, subject: def.channel === "email" ? body.subject : null, body: body.body, updatedById: ctx.userId };
    await prisma.notificationTemplate.upsert({
      where: { tenantId_key: { tenantId: ctx.tenantId, key: params.key } },
      create: { tenantId: ctx.tenantId, key: params.key, ...data },
      update: data,
    });

    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "notification_template_updated",
      entity: "NotificationTemplate",
      entityId: params.key,
      before: before ?? { enabled: true, subject: def.subject ?? null },
      after: { enabled: data.enabled, subject: data.subject, wording: "edited" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

/** Reset to the built-in wording. */
export async function DELETE(_req: NextRequest, { params }: { params: { key: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    if (!isTemplateKey(params.key)) throw new ApiError(404, "Unknown template");
    await prisma.notificationTemplate.deleteMany({ where: { tenantId: ctx.tenantId, key: params.key } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "notification_template_reset", entity: "NotificationTemplate", entityId: params.key });
    return NextResponse.json({ ok: true });
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
