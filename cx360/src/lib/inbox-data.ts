import { prisma } from "@/lib/prisma";

/**
 * The messages the Inbox screen works with: everything still open (new or in progress),
 * plus anything from the last `days` days (so closed and linked messages stay visible and can be re-opened).
 */
export async function loadInbox(tenantId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  return prisma.interaction.findMany({
    where: {
      tenantId,
      direction: "inbound",
      OR: [{ status: { in: ["NEW", "IN_PROGRESS"] } }, { createdAt: { gte: since } }],
    },
    orderBy: { createdAt: "desc" },
    take: 400,
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, segment: true, sentimentAvg: true, email: true, phone: true } },
      agent: { select: { id: true, name: true } },
    },
  });
}
