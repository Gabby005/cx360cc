import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { checkGatewayUrl, findPastedSecret, parseDeliverySettings, secretStatus, type DeliverySettings } from "@/lib/delivery/config";

export const dynamic = "force-dynamic";

const header = z.object({ name: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/, "Header names use letters, numbers and dashes only"), value: z.string().max(500) });
const httpBase = {
  url: z.string().trim().min(1, "Enter the gateway address").max(500),
  headers: z.array(header).max(10),
  contentType: z.enum(["json", "form"]),
  body: z.string().max(4000),
  successContains: z.string().max(100),
};
const schema = z.object({
  email: z.discriminatedUnion("provider", [
    z.object({ provider: z.literal("none") }),
    z.object({ provider: z.literal("http"), ...httpBase, sender: z.string().trim().max(200), fromName: z.string().trim().max(100) }),
    z.object({ provider: z.literal("graph"), azureTenantId: z.string().trim(), clientId: z.string().trim(), sender: z.string().trim().email("Enter the sending mailbox"), fromName: z.string().trim().max(100) }),
  ]),
  sms: z.discriminatedUnion("provider", [
    z.object({ provider: z.literal("none") }),
    z.object({ provider: z.literal("http"), ...httpBase, method: z.enum(["POST", "GET"]), senderId: z.string().trim().max(20), phoneFormat: z.enum(["digits", "plus", "asis"]), countryCode: z.string().regex(/^\d{1,4}$/, "Country code is digits only, e.g. 234") }),
  ]),
});

function summary(s: DeliverySettings) {
  const host = (u: string) => { try { return new URL(u.replace(/\{\{[^}]*\}\}/g, "x")).host; } catch { return ""; } };
  return {
    email: s.email.provider === "none" ? "off" : s.email.provider === "graph" ? `Microsoft 365 (${s.email.sender})` : `gateway ${host(s.email.url)}`,
    sms: s.sms.provider === "none" ? "off" : `gateway ${host(s.sms.url)}`,
  };
}

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { deliverySettings: true } });
    const settings = parseDeliverySettings(t?.deliverySettings);
    return NextResponse.json({ settings, secrets: secretStatus(settings) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const next = parseDeliverySettings(schema.parse(await req.json()));

    for (const [name, c] of [["Email", next.email], ["SMS", next.sms]] as const) {
      if (c.provider !== "http") continue;
      const bad = checkGatewayUrl(c.url) ?? findPastedSecret(c);
      if (bad) throw new ApiError(400, `${name}: ${bad}`);
      const isGet = "method" in c && c.method === "GET";
      if (!isGet && !c.body.trim()) throw new ApiError(400, `${name}: describe the message body the gateway expects.`);
      if (!/\{\{\s*to\s*\}\}|\{\{\s*to_json\s*\}\}/.test(c.url + c.body)) throw new ApiError(400, `${name}: the request must include {{to}} (the recipient) somewhere in the address or body.`);
      if (!/\{\{\s*message\s*\}\}/.test(c.url + c.body)) throw new ApiError(400, `${name}: the request must include {{message}} somewhere in the address or body.`);
    }
    if (next.email.provider === "graph" && (!/^[0-9a-f-]{36}$/i.test(next.email.azureTenantId) || !/^[0-9a-f-]{36}$/i.test(next.email.clientId))) {
      throw new ApiError(400, "Email: the Microsoft tenant ID and client ID are the 36-character IDs shown in Entra ID.");
    }

    const before = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { deliverySettings: true } });
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { deliverySettings: next as unknown as Prisma.InputJsonValue } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "delivery_settings_updated", entity: "DeliverySettings", entityId: ctx.tenantId, before: summary(parseDeliverySettings(before?.deliverySettings)), after: summary(next) });
    return NextResponse.json({ settings: next, secrets: secretStatus(next) });
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
