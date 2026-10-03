import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { DAY_KEYS, parseBusinessHours, toMinutes } from "@/lib/business-hours";

// Reads the signed-in session, so it must never be pre-rendered at build time.
export const dynamic = "force-dynamic";

const openTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, e.g. 08:00");
const closeTime = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, "Use HH:MM, e.g. 17:00");

const day = z
  .object({ open: openTime, close: closeTime })
  .nullable()
  .refine((d) => !d || toMinutes(d.open) < toMinutes(d.close), { message: "Opening time must be earlier than closing time." });

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const schema = z
  .object({
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone"),
    days: z.object({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day }),
    holidays: z
      .array(
        z.object({
          date: z.string().refine(isRealDate, "Holiday dates must be real dates"),
          name: z.string().trim().min(1, "Give each holiday a name").max(60),
        })
      )
      .max(400, "That's a lot of holidays — keep it under 400"),
  })
  .refine((b) => DAY_KEYS.some((k) => b.days[k]), { message: "At least one day must be open, otherwise SLA clocks could never finish." })
  .refine((b) => new Set(b.holidays.map((h) => h.date)).size === b.holidays.length, { message: "The same date is listed twice in the holidays." });

export async function GET() {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { businessHours: true } });
    return NextResponse.json({ businessHours: parseBusinessHours(t?.businessHours) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = schema.parse(await req.json());

    const holidays = [...body.holidays].sort((a, b) => a.date.localeCompare(b.date));
    const next = { timezone: body.timezone, days: body.days, holidays };

    const before = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { businessHours: true } });
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { businessHours: next as unknown as Prisma.InputJsonValue } });

    const summary = (bh: ReturnType<typeof parseBusinessHours>) =>
      bh
        ? {
            timezone: bh.timezone,
            openDays: DAY_KEYS.filter((k) => bh.days[k]).join(","),
            hours: DAY_KEYS.filter((k) => bh.days[k]).map((k) => `${k} ${bh.days[k]!.open}-${bh.days[k]!.close}`).join(" | "),
            holidays: bh.holidays.length,
          }
        : null;
    await recordAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "business_hours_updated",
      entity: "BusinessHours",
      entityId: ctx.tenantId,
      before: summary(parseBusinessHours(before?.businessHours)),
      after: summary(parseBusinessHours(next)),
    });

    return NextResponse.json({ businessHours: next });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
