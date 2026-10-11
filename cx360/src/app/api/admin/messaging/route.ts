import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { AUTO_CHANNELS, isHttpUrl, parseMessaging } from "@/lib/messaging";

export const dynamic = "force-dynamic";

const chan = z.object({ enabled: z.boolean(), text: z.string().trim().min(1, "Auto-reply wording can't be empty").max(600) });
const schema = z.object({
  signature: z.object({ enabled: z.boolean(), bankName: z.string().trim().min(1, "Enter the bank name").max(80), surveyUrl: z.string().trim().max(500) }),
  autoReply: z.object({ cooldownHours: z.number().int().min(1).max(72), channels: z.record(z.enum(AUTO_CHANNELS), chan) }),
});

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { messagingSettings: true } });
    return NextResponse.json({ settings: parseMessaging(t?.messagingSettings) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = schema.parse(await req.json());
    if (body.signature.surveyUrl && !isHttpUrl(body.signature.surveyUrl)) throw new ApiError(400, "The survey link must start with https://");
    const next = parseMessaging(body);
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { messagingSettings: next as unknown as Prisma.InputJsonValue } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "messaging_settings_updated", entity: "MessagingSettings", entityId: ctx.tenantId, after: { signature: next.signature.enabled, autoReplies: AUTO_CHANNELS.filter((c) => next.autoReply.channels[c].enabled).join(",") } });
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
