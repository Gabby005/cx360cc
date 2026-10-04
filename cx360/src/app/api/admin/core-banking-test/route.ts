import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { parseCoreSettings } from "@/lib/core-banking/config";
import { callEndpoint } from "@/lib/core-banking/client";
import { mapAccounts, mapProfile, mapTransactions } from "@/lib/core-banking/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

// Customer data in a test reply is shown with long digit runs (account numbers, BVN…) partly hidden.
const maskRaw = (t?: string) => t?.replace(/\d{9,}/g, (d) => `${"•".repeat(d.length - 2)}${d.slice(-2)}`);

/**
 * Runs each configured lookup once with the details the admin types in, and shows
 * what CX360 understood next to the start of the raw reply, so wrong field names
 * are obvious. Nothing is stored. Admin only.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const b = z.object({ lookup: z.string().max(80).default(""), phone: z.string().max(30).default(""), email: z.string().max(120).default(""), accountRef: z.string().max(40).default("") }).parse(await req.json());
    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { coreBankingSettings: true } });
    const s = parseCoreSettings(t?.coreBankingSettings);
    const steps: { name: string; ok: boolean; error?: string; understood?: unknown; rawStart?: string }[] = [];

    const vars = { customerId: "TEST", lookup: b.lookup, phone: b.phone, email: b.email, accountRef: b.accountRef };
    let acctRef = b.accountRef;

    if (s.accounts) {
      const r = await callEndpoint(s.accounts, vars);
      if (r.ok) {
        const m = mapAccounts(r.reply, s.accounts);
        if (!acctRef) acctRef = m.find((a) => a.accountRef)?.accountRef ?? "";
        steps.push({ name: "Accounts", ok: m.length > 0, error: m.length ? undefined : "The call worked but no accounts were found at the list path you set.", understood: m.slice(0, 3), rawStart: maskRaw(r.raw.slice(0, 600)) });
      } else steps.push({ name: "Accounts", ok: false, error: r.error, rawStart: maskRaw(r.raw) });
    }
    if (s.transactions) {
      const r = await callEndpoint(s.transactions, { ...vars, accountRef: acctRef, limit: 5 });
      if (r.ok) {
        const m = mapTransactions(r.reply, s.transactions, s.accounts?.defaultCurrency ?? "NGN", 5);
        steps.push({ name: "Transactions", ok: m.length > 0, error: m.length ? undefined : "The call worked but no readable transactions were found (check the list path, amount and date fields).", understood: m, rawStart: maskRaw(r.raw.slice(0, 600)) });
      } else steps.push({ name: "Transactions", ok: false, error: r.error, rawStart: maskRaw(r.raw) });
    }
    if (s.profile) {
      const r = await callEndpoint(s.profile, vars);
      if (r.ok) {
        const m = mapProfile(r.reply, s.profile.fields);
        steps.push({ name: "Customer details", ok: Object.keys(m).length > 0, error: Object.keys(m).length ? undefined : "The call worked but none of the mapped fields were found.", understood: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.length > 4 ? `${v.slice(0, 2)}••••${v.slice(-2)}` : "••••"])), rawStart: maskRaw(r.raw.slice(0, 600)) });
      } else steps.push({ name: "Customer details", ok: false, error: r.error, rawStart: maskRaw(r.raw) });
    }
    if (steps.length === 0) throw new ApiError(400, "Save at least one lookup first.");
    return NextResponse.json({ steps });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
