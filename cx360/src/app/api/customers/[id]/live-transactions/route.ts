import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";
import { parseCoreSettings } from "@/lib/core-banking/config";
import { liveAccounts, liveTransactions, type Vars } from "@/lib/core-banking/client";

export const dynamic = "force-dynamic";

/** Last 5 transactions for one of the customer's live accounts (loaded when the agent clicks the account). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const ref = req.nextUrl.searchParams.get("ref") ?? "";
    const [customer, tenant] = await Promise.all([
      prisma.customer.findFirst({ where: { id: params.id, tenantId: ctx.tenantId }, select: { id: true, phone: true, email: true, customFields: true } }),
      prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { coreBankingSettings: true } }),
    ]);
    if (!customer) throw new ApiError(404, "Customer not found");
    const core = parseCoreSettings(tenant?.coreBankingSettings);
    const custom = (customer.customFields && typeof customer.customFields === "object" && !Array.isArray(customer.customFields) ? customer.customFields : {}) as Record<string, unknown>;
    const hit = Object.keys(custom).find((x) => x.toLowerCase() === core.lookupKey.toLowerCase());
    const vars: Vars = { customerId: customer.id, lookup: hit ? String(custom[hit] ?? "") : "", phone: customer.phone ?? "", email: customer.email ?? "" };

    // Only accounts the core banking system itself lists for this customer can be queried.
    const accts = await liveAccounts(ctx.tenantId, core, vars);
    if (!accts.ok) throw new ApiError(502, accts.error);
    const acct = accts.data.find((a) => a.accountRef === ref);
    if (!acct) throw new ApiError(404, "Account not found for this customer");

    const tx = await liveTransactions(ctx.tenantId, core, { ...vars, accountRef: ref }, acct.currency);
    if (!tx.ok) throw new ApiError(502, tx.error);
    return NextResponse.json({ transactions: tx.data.map((t, i) => ({ ...t, id: `t${i}` })) });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
