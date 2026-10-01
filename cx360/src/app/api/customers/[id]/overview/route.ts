import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";
import { getAccountsForCustomer, getRecentTransactions } from "@/lib/core-banking";

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
      },
    });
    if (!customer) throw new ApiError(404, "Customer not found");

    const now = new Date();
    const open = { notIn: ["RESOLVED", "CLOSED"] as ("RESOLVED" | "CLOSED")[] };

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

    const shownAccounts = accounts.slice(0, 8);
    const txs = await Promise.all(shownAccounts.map((a) => getRecentTransactions(prisma, a.id, 5)));

    return NextResponse.json({
      customer,
      accounts: shownAccounts.map((a, i) => ({
        id: a.id,
        productName: a.productName,
        accountRef: a.accountRef,
        status: a.status,
        currency: a.currency,
        balance: a.balance === null ? null : Number(a.balance),
        openedAt: a.openedAt,
        transactions: txs[i].map((t) => ({
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          currency: t.currency,
          description: t.description,
          transactionDate: t.transactionDate,
        })),
      })),
      accountCount: accounts.length,
      cases: { open: openCount, overdue: overdueCount, last30Days: last30Count, recent: recentCases },
      lastInteraction,
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
