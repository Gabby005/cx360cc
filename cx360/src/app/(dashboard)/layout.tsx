import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildBrandStyleTag } from "@/lib/theme";
import { NavRail } from "@/components/layout/nav-rail";
import { TopBar } from "@/components/layout/top-bar";
import { ThemeInit } from "@/components/theme-init";
import { BusinessHoursProvider } from "@/components/providers/business-hours-provider";
import { parseBusinessHours } from "@/lib/business-hours";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Both lookups at once (one round trip to the database instead of two).
  const [account, tenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { mustChangePassword: true } }),
    prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true, brandColor: true, logoDataUrl: true, businessHours: true },
    }),
  ]);
  // New accounts and admin resets must pick their own password before anything else.
  if (account?.mustChangePassword) redirect("/change-password");

  return (
    <div className="h-screen flex bg-surface dark:bg-ink-950">
      <style dangerouslySetInnerHTML={{ __html: buildBrandStyleTag(tenant?.brandColor ?? "#5B5FEF") }} />
      <ThemeInit />
      <NavRail role={session.user.role} tenantName={tenant?.name} logoDataUrl={tenant?.logoDataUrl ?? null} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar user={session.user} />
        <main className="flex-1 min-h-0 overflow-hidden">
          <BusinessHoursProvider value={parseBusinessHours(tenant?.businessHours)}>{children}</BusinessHoursProvider>
        </main>
      </div>
    </div>
  );
}
