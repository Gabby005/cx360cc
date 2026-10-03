import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { EMAIL_RE, PRIORITIES, ladderActive, parseNotificationSettings, type NotificationSettings } from "@/lib/notification-settings";

// Reads the signed-in session, so it must never be pre-rendered at build time.
export const dynamic = "force-dynamic";

const emailList = z.array(z.string().trim().toLowerCase().regex(EMAIL_RE, "That doesn't look like an email address")).max(10, "Up to 10 addresses per box");

const schema = z.object({
  sla: z.object({
    trigger: z.enum(["resolution", "any"]),
    priorities: z.array(z.enum(PRIORITIES)).min(1, "Pick at least one priority"),
    level1: z.object({ enabled: z.boolean(), to: emailList, cc: emailList, ccOwner: z.boolean() }),
    level2: z.object({
      enabled: z.boolean(),
      afterHours: z.number().int().min(1, "Level 2 must wait at least 1 hour").max(720, "Level 2 can wait at most 30 days"),
      to: emailList,
      cc: emailList,
      ccOwner: z.boolean(),
      ccLevel1: z.boolean(),
    }),
  }),
});

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { notificationSettings: true } });
    return NextResponse.json({ settings: parseNotificationSettings(t?.notificationSettings) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = schema.parse(await req.json());

    if (body.sla.level1.enabled && body.sla.level1.to.length === 0) throw new ApiError(400, "Level 1 is on, but there's no manager one email address yet.");
    if (body.sla.level2.enabled && body.sla.level2.to.length === 0) throw new ApiError(400, "Level 2 is on, but there's no manager two email address yet.");

    const row = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { notificationSettings: true } });
    const prev = parseNotificationSettings(row?.notificationSettings);

    // "Enabled since" starts the moment the ladder is first switched on (and restarts if it was fully off in between),
    // so tickets that were already overdue are never escalated retroactively.
    const next: NotificationSettings = { sla: { ...body.sla, enabledSince: null } };
    const wasOn = ladderActive(prev);
    const isOn = ladderActive(next);
    next.sla.enabledSince = isOn ? (wasOn && prev.sla.enabledSince ? prev.sla.enabledSince : new Date().toISOString()) : null;

    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { notificationSettings: next as unknown as Prisma.InputJsonValue } });

    const summary = (s: NotificationSettings) => ({
      level1: s.sla.level1.enabled ? `on → ${s.sla.level1.to.join(", ")}` : "off",
      level2: s.sla.level2.enabled ? `on after ${s.sla.level2.afterHours}h → ${s.sla.level2.to.join(", ")}` : "off",
      trigger: s.sla.trigger,
      priorities: s.sla.priorities.join(","),
    });
    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "notification_settings_updated",
      entity: "NotificationSettings",
      entityId: ctx.tenantId,
      before: summary(prev),
      after: summary(next),
    });

    return NextResponse.json({ settings: next });
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
