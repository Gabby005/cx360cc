import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { BrandingClient } from "@/components/admin/branding-client";

export default async function BrandingPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true, brandColor: true, logoDataUrl: true },
  });

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← Admin centre
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Branding</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Your logo and brand color, applied across the sidebar, login page, and every button/badge in the app.
        Changes apply immediately for everyone — no rebuild needed.
      </p>

      <BrandingClient initialLogo={tenant?.logoDataUrl ?? null} initialColor={tenant?.brandColor ?? "#5B5FEF"} />
    </div>
  );
}
