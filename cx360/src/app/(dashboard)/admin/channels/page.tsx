import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { CHANNEL_SECRETS, parseChannelSettings, secretSet } from "@/lib/channels/config";
import { ChannelsClient } from "@/components/admin/channels-client";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");
  const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true, channelSettings: true } });
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  const q = `?tenant=${encodeURIComponent(t?.slug ?? "")}`;
  const secrets: Record<string, boolean> = {};
  for (const names of Object.values(CHANNEL_SECRETS)) for (const n of names) secrets[n] = secretSet(n);
  return (
    <div className="h-full overflow-y-auto p-6 w-full max-w-[1000px]">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">← Admin centre</Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Channels</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 max-w-2xl">Where customers reach you: email, SMS replies, WhatsApp, Instagram, Messenger and the phone system. Everything arrives in the Inbox.</p>
      <div className="mt-4">
        <ChannelsClient
          initial={parseChannelSettings(t?.channelSettings)}
          secrets={secrets}
          urls={{ email: `${base}/api/channels/email${q}`, sms: `${base}/api/channels/sms${q}`, voice: `${base}/api/channels/voice${q}`, meta: `${base}/api/channels/meta${q}`, screenpop: `${base}/screenpop?ani=` }}
        />
      </div>
    </div>
  );
}
