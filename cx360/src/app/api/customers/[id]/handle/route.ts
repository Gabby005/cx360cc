import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const KEYS = ["instagramHandle", "xHandle", "facebookName", "whatsappNumber"] as const;
const schema = z.object({ key: z.enum(KEYS), value: z.string().trim().max(120) });

/** Agent types the customer's handle/name once (social platforms often only give an id); it then shows on every conversation and ticket. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "AGENT");
    const b = schema.parse(await req.json());
    const c = await prisma.customer.findFirst({ where: { id: params.id, tenantId: ctx.tenantId }, select: { customFields: true } });
    if (!c) throw new ApiError(404, "Customer not found");
    const cf = { ...((c.customFields ?? {}) as Record<string, unknown>) };
    if (b.value) cf[b.key] = b.value; else delete cf[b.key];
    await prisma.customer.update({ where: { id: params.id }, data: { customFields: cf as any } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
