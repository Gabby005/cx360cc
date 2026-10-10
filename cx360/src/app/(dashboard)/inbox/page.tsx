import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { loadInbox, loadTags } from "@/lib/inbox-data";
import { InboxClient } from "@/components/inbox/inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: { channel?: string } }) {
  const ctx = await requireSession();

  const [interactions, tags, customers] = await Promise.all([
    loadInbox(ctx.tenantId),
    loadTags(ctx.tenantId),
    prisma.customer.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
      take: 100,
    }),
  ]);

  return (
    <InboxClient
      initialItems={JSON.parse(JSON.stringify(interactions))}
      customers={customers}
      currentUserId={ctx.userId}
      canEdit={ctx.role !== "READ_ONLY"}
      canManageTeams={ctx.role === "ADMIN" || ctx.role === "SUPERVISOR"}
      initialTags={tags}
      initialChannel={searchParams.channel && /^[A-Z]+$/.test(searchParams.channel) ? searchParams.channel : "all"}
    />
  );
}
