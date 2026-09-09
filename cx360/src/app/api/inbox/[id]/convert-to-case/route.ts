import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";
import { createCase } from "@/lib/case-service";

const schema = z.object({
  subject: z.string().min(1),
  type: z.enum(["SERVICE_REQUEST", "COMPLAINT", "INQUIRY", "INCIDENT"]).default("SERVICE_REQUEST"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  category: z.string().optional(),
  caseCodeId: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const body = schema.parse(await req.json());

    const interaction = await prisma.interaction.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!interaction) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (interaction.caseId) {
      return NextResponse.json({ error: "This message is already linked to a case" }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const newCase = await createCase(tx, {
        tenantId: ctx.tenantId,
        customerId: interaction.customerId,
        type: body.type,
        priority: body.priority,
        subject: body.subject,
        description: interaction.transcript ?? interaction.summary ?? undefined,
        category: body.category,
        caseCodeId: body.caseCodeId,
        actorId: ctx.userId,
      });

      await tx.interaction.update({
        where: { id: interaction.id },
        data: { caseId: newCase.id, status: "LINKED", agentId: ctx.userId },
      });

      return newCase;
    });

    return NextResponse.json({ case: result }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
