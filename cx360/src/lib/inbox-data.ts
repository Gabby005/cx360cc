import { prisma } from "@/lib/prisma";
import { COLOR_INFO, resolveTags, type ColorTag } from "@/lib/inbox-ui";

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

/** The team codes for this organisation (Team A, B, ... unless changed). */
export async function loadTags(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { inboxTags: true } });
  return resolveTags(t?.inboxTags);
}

/** True when `key` is one of this organisation's team codes (or an older colour). */
export async function isKnownTagKey(tenantId: string, key: string) {
  if (COLOR_INFO[key as ColorTag]) return true;
  return (await loadTags(tenantId)).some((t) => t.key === key);
}
