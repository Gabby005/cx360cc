import { prisma } from "@/lib/prisma";
import { connected, parseDeliverySettings } from "@/lib/delivery/config";

/** Is an email / SMS gateway connected for this organisation? (Admin → Notification centre → Delivery) */
export async function getDeliveryStatus(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { deliverySettings: true } });
  const s = parseDeliverySettings(t?.deliverySettings);
  return { email: connected(s.email), sms: connected(s.sms) };
}
