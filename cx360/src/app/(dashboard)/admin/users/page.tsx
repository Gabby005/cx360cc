import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { UsersClient } from "@/components/admin/users-client";

export default async function AdminUsersPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const memberships = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId },
    include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const [teams, units] = await Promise.all([
    prisma.team.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← Admin centre
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Users &amp; roles</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Create agents and supervisors, change roles, and place each person in a team and a department. Role changes
        take effect the next time that person signs in. Team and department changes apply straight away — they decide
        what people see under "My team" and "My department" on the Cases page.
      </p>

      <UsersClient
        currentUserId={ctx.userId}
        initialMembers={JSON.parse(JSON.stringify(memberships))}
        initialTeams={teams}
        units={units}
      />
    </div>
  );
}
