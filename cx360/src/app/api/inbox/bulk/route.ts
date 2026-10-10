import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { FLAGS, COLOR_TAGS } from "@/lib/inbox-ui";

export const dynamic = "force-dynamic";

/** Apply one action to several Inbox messages at once. */
const schema = z.discriminatedUnion("action", [
  z.object({ ids: z.array(z.string()).min(1).max(200), action: z.literal("read") }),
  z.object({ ids: z.array(z.string()).min(1).max(200), action: z.literal("unread") }),
  z.object({ ids: z.array(z.string()).min(1).max(200), action: z.literal("flag"), value: z.enum(FLAGS).nullable() }),
  z.object({ ids: z.array(z.string()).min(1).max(200), action: z.literal("color"), value: z.enum(COLOR_TAGS).nullable() }),
  z.object({ ids: z.array(z.string()).min(1).max(200), action: z.literal("close") }),
  z.object({ ids: z.array(z.string()).min(1).max(200), action: z.literal("assign") }),
]);

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "AGENT");
    const body = schema.parse(await req.json());
    const scope = { id: { in: body.ids }, tenantId: ctx.tenantId, direction: "inbound" };
    let count = 0;

    switch (body.action) {
      case "read":
        count = (await prisma.interaction.updateMany({ where: { ...scope, readAt: null }, data: { readAt: new Date() } })).count;
        break;
      case "unread": {
        // A closed message marked unread comes back to the open queue.
        const a = await prisma.interaction.updateMany({ where: { ...scope, status: "CLOSED" }, data: { readAt: null, status: "NEW" } });
        const b = await prisma.interaction.updateMany({ where: { ...scope, status: { not: "CLOSED" } }, data: { readAt: null } });
        count = a.count + b.count;
        break;
      }
      case "flag":
        count = (await prisma.interaction.updateMany({ where: scope, data: { flag: body.value } })).count;
        break;
      case "color":
        count = (await prisma.interaction.updateMany({ where: scope, data: { colorTag: body.value } })).count;
        break;
      case "close":
        // Only messages that are still open and not linked to a case can be closed without one.
        count = (await prisma.interaction.updateMany({ where: { ...scope, caseId: null, status: { in: ["NEW", "IN_PROGRESS"] } }, data: { status: "CLOSED", readAt: new Date() } })).count;
        break;
      case "assign":
        count = (await prisma.interaction.updateMany({ where: scope, data: { agentId: ctx.userId } })).count;
        break;
    }
    return NextResponse.json({ updated: count });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
