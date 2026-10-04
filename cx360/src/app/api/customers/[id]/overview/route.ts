import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";
import { getAccountsForCustomer, getRecentTransactions } from "@/lib/core-banking";
import { parseSummaryFields } from "@/lib/customer-summary";
import { parseCoreSettings } from "@/lib/core-banking/config";
import { liveAccounts, liveProfile, liveTransactions, type Vars } from "@/lib/core-banking/client";
import { recordAudit } from "@/lib/audit";

// Reads the signed-in session, so it must never be pre-rendered at build time.
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/**
 * Everything an agent needs at a glance when logging a case: who the customer
 * is, their accounts + balances, the last 5 transactions per account (for KYC
 * checks), and their recent case history. Read-only.
 *
 * Account data comes through src/lib/core-banking.ts — when a real core
 * banking sync is connected, this route shows live data with no changes.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();

    const customer = await prisma.customer.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        segment: true,
        sentimentAvg: true,
        createdAt: true,
        customFields: true,
      },
    });
    if (!customer) throw new ApiError(404, "Customer not found");

    const now = new Date();
    const open = { notIn: ["RESOLVED", "CLOSED"] as ("RESOLVED" | "CLOSED")[] };

    const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { customerSummaryFields: true, coreBankingSettings: true } });
    const [accounts, recentCases, openCount, overdueCount, last30Count, lastInteraction] = await Promise.all([
      getAccountsForCustomer(prisma, customer.id),
      prisma.case.findMany({
        where: { tenantId: ctx.tenantId, customerId: customer.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, caseNumber: true, subject: true, status: true, type: true, createdAt: true },
      }),
      prisma.case.count({ where: { tenantId: ctx.tenantId, customerId: customer.id, status: open } }),
      prisma.case.count({
        where: { tenantId: ctx.tenantId, customerId: customer.id, status: open, resolutionDueAt: { lt: now } },
      }),
      prisma.case.count({
        where: { tenantId: ctx.tenantId, customerId: customer.id, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
      }),
      prisma.interaction.findFirst({
        where: { tenantId: ctx.tenantId, customerId: customer.id },
        orderBy: { createdAt: "desc" },
        select: { channel: true, direction: true, createdAt: true },
      }),
    ]);

    // Live core banking (Admin → Core banking). Falls back to the locally stored data if it's off or failing.
    const core = parseCoreSettings(tenant?.coreBankingSettings);
    const custom0 = (customer.customFields && typeof customer.customFields === "object" && !Array.isArray(customer.customFields) ? (customer.customFields as Record<string, unknown>) : {}) as Record<string, unknown>;
    const lookupHit = Object.keys(custom0).find((x) => x.toLowerCase() === core.lookupKey.toLowerCase());
    const vars: Vars = { customerId: customer.id, lookup: lookupHit ? String(custom0[lookupHit] ?? "") : "", phone: customer.phone ?? "", email: customer.email ?? "", accountRef: accounts.find((a) => a.accountRef)?.accountRef ?? "" };

    let source: "live" | "local" = "local";
    let note: string | null = null;
    let liveProfileValues: Record<string, string> = {};
    type OutAccount = { id: string; productName: string; accountRef: string | null; status: string; currency: string; balance: number | null; openedAt: string | null; transactions: { id: string; type: string; amount: number; currency: string; description: string; transactionDate: string | Date }[] | null };
    let outAccounts: OutAccount[] = [];
    let accountCount = accounts.length;

    if (core.enabled && core.accounts) {
      const [la, lp] = await Promise.all([liveAccounts(ctx.tenantId, core, vars), liveProfile(ctx.tenantId, core, vars)]);
      if (la.ok) {
        source = "live";
        if (lp.ok) liveProfileValues = lp.data;
        accountCount = la.data.length;
        const shown = la.data.slice(0, 8);
        const firstTx = shown[0]?.accountRef ? await liveTransactions(ctx.tenantId, core, { ...vars, accountRef: shown[0].accountRef }, shown[0].currency) : null;
        outAccounts = shown.map((a, i) => ({
          id: `live:${a.accountRef ?? i}`,
          productName: a.productName, accountRef: a.accountRef, status: a.status, currency: a.currency, balance: a.balance, openedAt: null,
          transactions: i === 0 && firstTx ? (firstTx.ok ? firstTx.data.map((t, n) => ({ ...t, id: `t${n}` })) : []) : a.accountRef ? null : [],
        }));
        if (firstTx && !firstTx.ok) note = "Transactions couldn't be loaded from the core banking system just now.";
        recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "customer_core_viewed", entity: "Customer", entityId: customer.id }).catch(() => {});
      } else {
        note = `Live core banking unavailable (${la.error}) — showing the last stored data.`;
      }
    }
    if (source === "local") {
      const shownAccounts = accounts.slice(0, 8);
      const txs = await Promise.all(shownAccounts.map((a) => getRecentTransactions(prisma, a.id, 5)));
      outAccounts = shownAccounts.map((a, i) => ({
        id: a.id, productName: a.productName, accountRef: a.accountRef, status: a.status, currency: a.currency,
        balance: a.balance === null ? null : Number(a.balance), openedAt: a.openedAt.toISOString(),
        transactions: txs[i].map((t) => ({ id: t.id, type: t.type, amount: Number(t.amount), currency: t.currency, description: t.description, transactionDate: t.transactionDate })),
      }));
    }

    // Admin-chosen extra fields (BVN, DOB, address…), read from the customer's core-banking profile.
    const custom = (customer.customFields && typeof customer.customFields === "object" && !Array.isArray(customer.customFields)
      ? (customer.customFields as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const lookup = (key: string) => {
      const k = key.toLowerCase();
      const hit = Object.keys(custom).find((x) => x.toLowerCase() === k);
      const v = hit ? custom[hit] : undefined;
      return v === undefined || v === null || v === "" ? null : String(v);
    };
    const lookupLive = (key: string) => {
      const k = key.toLowerCase();
      const hit = Object.keys(liveProfileValues).find((x) => x.toLowerCase() === k);
      return hit ? liveProfileValues[hit] : null;
    };
    const profile = parseSummaryFields(tenant?.customerSummaryFields).map((f) => ({ ...f, value: lookupLive(f.key) ?? lookup(f.key) }));

    const { customFields: _omit, ...customerPublic } = customer;
    return NextResponse.json({
      customer: customerPublic,
      profile,
      accounts: outAccounts,
      accountCount,
      source,
      note,
      cases: { open: openCount, overdue: overdueCount, last30Days: last30Count, recent: recentCases },
      lastInteraction,
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
