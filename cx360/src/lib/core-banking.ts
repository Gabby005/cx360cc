import { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Core banking read layer — this is the seam where a real connection to
 * Flexcube, T24, or another core banking platform would plug in.
 *
 * How a real integration typically works (no credentials for one exist
 * in this environment, so this file returns simulated data instead):
 *
 *   1. Core banking platforms expose either a SOAP or REST API (Flexcube's
 *      is usually SOAP via its "FCUBS" gateway; newer T24 deployments
 *      often expose REST). You'd authenticate with a service account /
 *      API key issued by the bank's core banking team, then call
 *      operations like "account inquiry" or "mini statement" per account
 *      number.
 *   2. Two integration shapes are common:
 *        a. PULL — CX360 calls the core banking API on demand (e.g. when
 *           an agent opens a Customer 360 page) and caches the result
 *           briefly. Simple, but adds latency to page loads and puts load
 *           on the core banking system per view.
 *        b. PUSH/SYNC — a scheduled job (same pattern as
 *           netlify/functions/sla-check.ts) pulls balances/transactions
 *           into CX360's own tables (CustomerProduct.balance,
 *           AccountTransaction) on a schedule (e.g. every 15 minutes),
 *           and pages read CX360's own database — faster, but data can be
 *           briefly stale.
 *      This app is built for shape (b): CustomerProduct.balance and
 *      AccountTransaction already exist as normal CX360 tables — a real
 *      integration replaces the *seeding* of those tables (currently
 *      done by prisma/seed.ts with fake data) with a scheduled sync job
 *      that calls the bank's actual core banking API and writes into the
 *      same tables. No other code in the app needs to change.
 *   3. Customer identity matching (bank account number ↔ CX360 Customer
 *      row) needs a shared key — typically the account number or a
 *      customer ID the core banking system already uses, stored on
 *      CustomerProduct.accountRef (already exists here).
 *
 * The two functions below read from CX360's own tables — exactly what a
 * real sync job would populate. Swapping in a real Flexcube/T24
 * connection means writing that sync job; nothing that calls these two
 * functions needs to change.
 */

export async function getAccountsForCustomer(tx: Tx, customerId: string) {
  return tx.customerProduct.findMany({
    where: { customerId },
    orderBy: { openedAt: "desc" },
  });
}

export async function getRecentTransactions(tx: Tx, customerProductId: string, limit = 10) {
  return tx.accountTransaction.findMany({
    where: { customerProductId },
    orderBy: { transactionDate: "desc" },
    take: limit,
  });
}
