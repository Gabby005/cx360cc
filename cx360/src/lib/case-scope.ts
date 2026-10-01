import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES } from "@/lib/case-status";
import type { SessionContext } from "@/lib/tenant";

/**
 * Which tickets a person is looking at. One definition shared by the Cases
 * page and the Excel export, so what you see is exactly what you download.
 *
 *   mine      logged by me OR assigned to me   (default for agents)
 *   logged    logged by me
 *   assigned  assigned to me
 *   team      logged by / assigned to anyone on my team
 *   unit      escalated to my department (unit)
 *   all       every ticket in the bank          (default for supervisors/admins)
 */
export type CaseScope = "mine" | "logged" | "assigned" | "team" | "unit" | "all";
export const SCOPES: CaseScope[] = ["mine", "logged", "assigned", "team", "unit", "all"];

export const PAGE_SIZE = 25;
export const MAX_PAGE = 200; // beyond this, narrow the filters instead of paging deeper
export const EXPORT_MAX_ROWS = 10_000;

export type Filters = {
  scope?: string;
  status?: string; // "open" (default) | "all" | a specific CaseStatus
  q?: string;
  from?: string;
  to?: string;
  teamId?: string; // supervisors/admins may look at any team
  unitId?: string; // supervisors/admins may look at any department
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
  return ctx.role === "AGENT" ? "mine" : "all";
}

export function parseScope(raw: string | undefined, ctx: SessionContext): CaseScope {
  return SCOPES.includes(raw as CaseScope) ? (raw as CaseScope) : defaultScope(ctx);
}

/** The team / department actually in play for this view (own, or chosen by a supervisor). */
export function effectiveTeamId(f: Filters, ctx: SessionContext, me: Me) {
  return (isSupervisor(ctx) && f.teamId) || me.teamId || null;
}
export function effectiveUnitId(f: Filters, ctx: SessionContext, me: Me) {
  return (isSupervisor(ctx) && f.unitId) || me.unitId || null;
}

const dayStart = (s: string) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Builds the Prisma filter. Returns `null` when the scope can't show anything
 * yet (e.g. "my team" but the person isn't on a team) so callers can show a
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
  else if (scope === "team") {
    const teamId = effectiveTeamId(f, ctx, me);
    if (!teamId) return null;
    const members = await prisma.membership.findMany({
      where: { tenantId: ctx.tenantId, teamId },
      select: { userId: true },
    });
    const ids = members.map((m) => m.userId);
    if (ids.length === 0) return null;
    and.push({ OR: [{ createdById: { in: ids } }, { assignedToId: { in: ids } }] });
  } else if (scope === "unit") {
    const unitId = effectiveUnitId(f, ctx, me);
    if (!unitId) return null;
    and.push({ escalatedUnitId: unitId });
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
