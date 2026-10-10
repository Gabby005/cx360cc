import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { loadTags } from "@/lib/inbox-data";
import { MAX_TAGS, TAG_COLOR_RE, TAG_KEY_RE } from "@/lib/inbox-ui";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireSession();
    return NextResponse.json({ tags: await loadTags(ctx.tenantId) });
  } catch (err) {
    return fail(err);
  }
}

const schema = z.object({
  tags: z
    .array(
      z.object({
        key: z.string().regex(TAG_KEY_RE).optional(),
        name: z.string().trim().min(1, "Every team needs a name").max(24, "Team names can be up to 24 characters"),
        color: z.string().regex(TAG_COLOR_RE, "Pick a colour"),
      })
    )
    .min(1, "Keep at least one team")
    .max(MAX_TAGS, `You can have up to ${MAX_TAGS} teams`),
});

/** Supervisors and admins edit the list of team codes (add, rename, recolour, remove). */
export async function PUT(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "SUPERVISOR");
    const body = schema.parse(await req.json());

    const names = new Set<string>();
    for (const t of body.tags) {
      const n = t.name.toLowerCase();
      if (names.has(n)) throw new ApiError(400, `There are two teams called "${t.name}".`);
      names.add(n);
    }
    const used = new Set<string>();
    const tags = body.tags.map((t) => {
      let key = t.key;
      while (!key || used.has(key)) key = `t${Math.random().toString(36).slice(2, 8)}`;
      used.add(key);
      return { key, name: t.name, color: t.color.toUpperCase() };
    });

    const before = await loadTags(ctx.tenantId);
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { inboxTags: tags as unknown as Prisma.InputJsonValue } });
    await recordAudit({ tenantId: ctx.tenantId, actorId: ctx.userId, action: "inbox_teams_updated", entity: "Tenant", entityId: ctx.tenantId, before: { teams: before.map((t) => t.name) }, after: { teams: tags.map((t) => t.name) } });
    return NextResponse.json({ tags });
  } catch (err) {
    return fail(err);
  }
}

function fail(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
