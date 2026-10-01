import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES } from "@/lib/case-status";
import type { SessionContext } from "@/lib/tenant";

/**
 * Which tickets a person is looking at. One definition shared by the Cases
 * page and the Excel export, so what you see is exactly what you download.
 *
 *   mine      logged by me OR assigned to me   (default for everyone but supervisors/admins)
 *   logged    logged by me
 *   assigned  assigned to me
 *   unit      my team & department: tickets escalated to my department, plus
 *             everything logged by or assigned to anyone in my department / team.
 *             (So an agent's own tickets also roll up into their department's view.)
 *   all       every ticket in the bank — supervisors and super admins only
 *
 * Old "team" links keep working and mean the same as "unit".
 */
export type CaseScope = "mine" | "logged" | "assigned" | "unit" | "all";
export const SCOPES: CaseScope[] = ["mine", "logged", "assigned", "unit", "all"];

export const PAGE_SIZE = 25;
export const MAX_PAGE = 200; // beyond this, narrow the filters instead of paging deeper
export const EXPORT_MAX_ROWS = 10_000;

export type Filters = {
  scope?: string;
  status?: string; // "open" (default) | "all" | a specific CaseStatus
  q?: string;
  from?: string;
  to?: string;
  group?: string; // supervisors/admins: "u:<departmentId>" or "t:<teamId>"
};

export type Me = { teamId: string | null; unitId: string | null };

export async function getMe(ctx: SessionContext): Promise<Me> {
  const m = await prisma.membership.findFirst({
    where: { userId: ctx.userId, tenantId: ctx.tenantId },
    select: { teamId: true, unitId: true },
  });
  return { teamId: m?.teamId ?? null, unitId: m?.unitId ?? null };
}

export const isSupervisor = (ctx: SessionContext) => ctx.role === "SUPERVISOR" || ctx.role === "ADMIN";

export function defaultScope(ctx: SessionContext): CaseScope {
  return isSupervisor(ctx) ? "all" : "mine";
}

export function parseScope(raw: string | undefined, ctx: SessionContext): CaseScope {
  const s = raw === "team" ? "unit" : raw;
  if (!SCOPES.includes(s as CaseScope)) return defaultScope(ctx);
  if (s === "all" && !isSupervisor(ctx)) return defaultScope(ctx); // agents see their own + their department's, not the whole bank
  return s as CaseScope;
}

type Group = { kind: "unit" | "team"; id: string };

/** The department / team actually in play: the person's own, or (supervisors/admins only) one they picked. */
export function resolveGroups(f: Filters, ctx: SessionContext, me: Me): Group[] {
  if (isSupervisor(ctx) && f.group) {
    const m = /^([ut]):(.+)$/.exec(f.group);
    if (m) return [{ kind: m[1] === "u" ? "unit" : "team", id: m[2] }];
  }
  const g: Group[] = [];
  if (me.unitId) g.push({ kind: "unit", id: me.unitId });
  if (me.teamId) g.push({ kind: "team", id: me.teamId });
  return g;
}

const dayStart = (s: string) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Builds the Prisma filter. Returns `null` when the scope can't show anything
 * yet (e.g. "my department" but the person isn't in one) so callers can show a
 * helpful message instead of an empty or — worse — an unscoped list.
 */
export async function buildCaseWhere(
  ctx: SessionContext,
  me: Me,
  f: Filters,
  range?: { start: Date; end: Date }
): Promise<Prisma.CaseWhereInput | null> {
  const scope = parseScope(f.scope, ctx);
  const and: Prisma.CaseWhereInput[] = [{ tenantId: ctx.tenantId }];

  if (scope === "mine") and.push({ OR: [{ createdById: ctx.userId }, { assignedToId: ctx.userId }] });
  else if (scope === "logged") and.push({ createdById: ctx.userId });
  else if (scope === "assigned") and.push({ assignedToId: ctx.userId });
  else if (scope === "unit") {
    const groups = resolveGroups(f, ctx, me);
    if (groups.length === 0) return null;

    const members = await prisma.membership.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: groups.map((g) => (g.kind === "unit" ? { unitId: g.id } : { teamId: g.id })),
      },
      select: { userId: true },
    });
    const ids = [...new Set(members.map((m) => m.userId))];
    const unitIds = groups.filter((g) => g.kind === "unit").map((g) => g.id);

    const or: Prisma.CaseWhereInput[] = [];
    if (unitIds.length) or.push({ escalatedUnitId: { in: unitIds } });
    if (ids.length) or.push({ createdById: { in: ids } }, { assignedToId: { in: ids } });
    if (or.length === 0) return null;
    and.push({ OR: or });
  }
  // scope === "all": tenant only

  const status = f.status ?? "open";
  if (status === "open") and.push({ status: { in: [...OPEN_STATUSES] } });
  else if (status !== "all") and.push({ status: status as Prisma.CaseWhereInput["status"] });

  if (range) {
    and.push({ createdAt: { gte: range.start, lt: range.end } });
  } else {
    const from = f.from ? dayStart(f.from) : null;
    const to = f.to ? dayStart(f.to) : null;
    if (from || to) {
      and.push({
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lt: new Date(to.getTime() + 86_400_000) } : {}),
        },
      });
    }
  }

  const q = f.q?.trim();
  if (q && q.length >= 3) {
    and.push({
      OR: [
        { caseNumber: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
        { customer: { OR: [{ lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }] } },
      ],
    });
  }

  return { AND: and };
}
