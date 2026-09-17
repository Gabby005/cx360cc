import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { InboxClient } from "@/components/inbox/inbox-client";

export default async function InboxPage() {
  const ctx = await requireSession();

  const [interactions, customers] = await Promise.all([
    prisma.interaction.findMany({
      where: { tenantId: ctx.tenantId, direction: "inbound", status: { in: ["NEW", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, segment: true, sentimentAvg: true } },
        agent: { select: { id: true, name: true } },
      },
    }),
    prisma.customer.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
      take: 100,
    }),
  ]);

  return <InboxClient initialItems={JSON.parse(JSON.stringify(interactions))} customers={customers} />;
}
