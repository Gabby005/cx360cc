import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { IntegrationsClient } from "@/components/admin/integrations-client";

export default async function IntegrationsPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const [keys, webhooks] = await Promise.all([
    prisma.apiKey.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true, revokedAt: true },
    }),
    prisma.webhookSubscription.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <IntegrationsClient
      initialKeys={JSON.parse(JSON.stringify(keys))}
      initialWebhooks={JSON.parse(
        JSON.stringify(webhooks.map((w) => ({ ...w, secret: `${w.secret.slice(0, 6)}${"•".repeat(10)}` })))
      )}
    />
  );
}
