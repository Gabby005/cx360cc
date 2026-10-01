import { prisma } from "@/lib/prisma";

export const DRIVER_LIMIT = 30;
export type DriverType = "COMPLAINT" | "SERVICE_REQUEST" | "INQUIRY";
export type DriverRow = { category: string; subcategory: string | null; count: number };
export type DriverList = { total: number; rows: DriverRow[] };
export type Drivers = Record<DriverType, DriverList>;

/**
 * Top engagement drivers: the most common case category › subcategory per
 * interaction type (complaints / requests / enquiries) for cases created in
 * [start, end). Counted in the database (groupBy), so it is exact no matter
 * how many cases fall in the range. Only cases that carry a case code count.
 */
export async function getTopDrivers(tenantId: string, start: Date, end: Date, limit = DRIVER_LIMIT): Promise<Drivers> {
  const groups = await prisma.case.groupBy({
    by: ["type", "caseCodeId"],
    where: {
      tenantId,
      createdAt: { gte: start, lt: end },
      caseCodeId: { not: null },
      type: { in: ["COMPLAINT", "SERVICE_REQUEST", "INQUIRY"] },
    },
    _count: true,
  });

  const ids = [...new Set(groups.map((g) => g.caseCodeId).filter((x): x is string => !!x))];
  const codes = ids.length
    ? await prisma.caseCode.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, category: true, subcategory: true },
      })
    : [];
  const codeById = new Map(codes.map((c) => [c.id, c]));

  const maps: Record<DriverType, Map<string, DriverRow>> = {
    COMPLAINT: new Map(),
    SERVICE_REQUEST: new Map(),
    INQUIRY: new Map(),
  };
  for (const g of groups) {
    const code = g.caseCodeId ? codeById.get(g.caseCodeId) : undefined;
    if (!code) continue;
    const m = maps[g.type as DriverType];
    const key = `${code.category}||${code.subcategory ?? ""}`;
    const row = m.get(key) ?? { category: code.category, subcategory: code.subcategory, count: 0 };
    row.count += g._count;
    m.set(key, row);
  }

  const build = (m: Map<string, DriverRow>): DriverList => {
    const all = [...m.values()].sort(
      (a, b) => b.count - a.count || a.category.localeCompare(b.category) || (a.subcategory ?? "").localeCompare(b.subcategory ?? "")
    );
    return { total: all.reduce((n, r) => n + r.count, 0), rows: all.slice(0, limit) };
  };
  return { COMPLAINT: build(maps.COMPLAINT), SERVICE_REQUEST: build(maps.SERVICE_REQUEST), INQUIRY: build(maps.INQUIRY) };
}
