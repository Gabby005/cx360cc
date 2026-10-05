import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { CHANNEL_SECRETS, parseChannelSettings, secretSet, type ChannelSettings } from "@/lib/channels/config";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.object({ pollMailbox: z.boolean(), mailbox: z.string().trim().max(200).refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Mailbox must be an email address") }),
  whatsapp: z.object({ phoneNumberId: z.string().trim().refine((v) => v === "" || /^\d{5,25}$/.test(v), "Phone number ID is digits only (from the Meta dashboard)") }),
  meta: z.object({ pageId: z.string().trim().refine((v) => v === "" || /^\d{5,25}$/.test(v), "Page ID is digits only"), instagram: z.boolean(), messenger: z.boolean() }),
});

function status() {
  const out: Record<string, boolean> = {};
  for (const names of Object.values(CHANNEL_SECRETS)) for (const n of names) out[n] = secretSet(n);
  return out;
}

async function load(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, channelSettings: true } });
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  const q = `?tenant=${encodeURIComponent(t?.slug ?? "")}`;
  return {
    settings: parseChannelSettings(t?.channelSettings),
    secrets: status(),
    urls: { email: `${base}/api/channels/email${q}`, sms: `${base}/api/channels/sms${q}`, voice: `${base}/api/channels/voice${q}`, meta: `${base}/api/channels/meta${q}`, screenpop: `${base}/screenpop?ani=` },
  };
}

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    return NextResponse.json(await load(ctx.tenantId));
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const next: ChannelSettings = parseChannelSettings(schema.parse(await req.json()));
    const before = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { channelSettings: true } });
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { channelSettings: next as unknown as Prisma.InputJsonValue } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "channel_settings_updated", entity: "Channels", entityId: ctx.tenantId, before: parseChannelSettings(before?.channelSettings), after: next });
    return NextResponse.json(await load(ctx.tenantId));
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
