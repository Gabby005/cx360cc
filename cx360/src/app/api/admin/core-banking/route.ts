import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { checkGatewayUrl, findPastedSecret } from "@/lib/delivery/config";
import { coreSecretStatus, endpoints, parseCoreSettings, type CoreBankingSettings } from "@/lib/core-banking/config";

export const dynamic = "force-dynamic";

const header = z.object({ name: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/, "Header names use letters, numbers and dashes only"), value: z.string().max(500) });
const ep = {
  url: z.string().trim().min(1, "Enter the address").max(500),
  method: z.enum(["GET", "POST"]),
  headers: z.array(header).max(10),
  contentType: z.enum(["json", "form", "xml"]),
  body: z.string().max(6000),
};
const p = z.string().max(120);
const schema = z.object({
  enabled: z.boolean(),
  lookupKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, "Customer-number field: letters, numbers, underscore"),
  profile: z.object({ ...ep, fields: z.record(p) }).nullable(),
  accounts: z.object({ ...ep, listPath: p, map: z.object({ productName: p, accountRef: p, status: p, balance: p, currency: p }), defaultCurrency: z.string().max(3) }).nullable(),
  transactions: z.object({ ...ep, listPath: p, map: z.object({ type: p, amount: p, currency: p, description: p, date: p }), creditValues: z.string().max(100) }).nullable(),
});

const hostOf = (u?: string) => { try { return new URL((u ?? "").replace(/\{\{[^}]*\}\}/g, "x")).host; } catch { return ""; } };
const summary = (s: CoreBankingSettings) => ({ enabled: s.enabled, profile: s.profile ? hostOf(s.profile.url) : "off", accounts: s.accounts ? hostOf(s.accounts.url) : "off", transactions: s.transactions ? hostOf(s.transactions.url) : "off" });

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { coreBankingSettings: true } });
    const settings = parseCoreSettings(t?.coreBankingSettings);
    return NextResponse.json({ settings, secrets: coreSecretStatus(settings) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const next = parseCoreSettings(schema.parse(await req.json()));

    for (const [name, e] of [["Customer details", next.profile], ["Accounts", next.accounts], ["Transactions", next.transactions]] as const) {
      if (!e) continue;
      const bad = checkGatewayUrl(e.url) ?? findPastedSecret(e);
      if (bad) throw new ApiError(400, `${name}: ${bad}`);
      if (e.method === "POST" && !e.body.trim()) throw new ApiError(400, `${name}: describe the request body the system expects.`);
    }
    if (next.enabled && !next.accounts) throw new ApiError(400, "Set up the Accounts lookup before switching live data on.");
    if (next.accounts && !next.accounts.listPath && !next.accounts.map.balance) throw new ApiError(400, "Accounts: say where the list and the balance are in the reply.");
    if (next.accounts && !next.accounts.map.accountRef) throw new ApiError(400, "Accounts: say which reply field holds the account number (it's needed to load transactions).");
    if (next.transactions && (!next.transactions.map.amount || !next.transactions.map.date)) throw new ApiError(400, "Transactions: say which reply fields hold the amount and the date.");
    if (endpoints(next).length === 0 && next.enabled) throw new ApiError(400, "Nothing is set up to look up.");

    const before = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { coreBankingSettings: true } });
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { coreBankingSettings: next as unknown as Prisma.InputJsonValue } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "core_banking_settings_updated", entity: "CoreBanking", entityId: ctx.tenantId, before: summary(parseCoreSettings(before?.coreBankingSettings)), after: summary(next) });
    return NextResponse.json({ settings: next, secrets: coreSecretStatus(next) });
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
