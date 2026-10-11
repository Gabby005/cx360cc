import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { parseMessaging } from "@/lib/messaging";
import { MessagingClient } from "@/components/admin/messaging-client";

export const dynamic = "force-dynamic";

export default async function MessagingPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");
  const [t, me] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { messagingSettings: true } }),
    prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
  ]);
  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-4xl">
      <Link href="/admin" className="text-xs text-brand hover:underline">← Admin centre</Link>
      <h1 className="text-lg font-semibold mt-1">Messages &amp; signature</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">The sign-off on every agent email, and the automatic replies customers get when they write to you.</p>
      <MessagingClient initial={parseMessaging(t?.messagingSettings)} agentName={me?.name ?? "Agent name"} />
    </div>
  );
}
