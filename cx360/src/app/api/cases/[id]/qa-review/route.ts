import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const kase = await prisma.case.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });

    const reviews = await prisma.qaReview.findMany({
      where: { caseId: kase.id },
      orderBy: { createdAt: "desc" },
      include: {
        reviewer: { select: { name: true } },
        reviewedAgent: { select: { name: true } },
      },
    });

    return NextResponse.json({ reviews });
  } catch (err) {
    return handleError(err);
  }
}

const criterionSchema = z.object({
  criterion: z.string().min(1),
  score: z.number().min(1).max(5),
  maxScore: z.literal(5),
  comment: z.string().optional(),
});

const createSchema = z.object({
  reviewedAgentId: z.string(),
  scorecard: z.array(criterionSchema).min(1),
  coachingNotes: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "SUPERVISOR"); // QA reviews are a supervisor/admin capability

    const body = createSchema.parse(await req.json());
    const kase = await prisma.case.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });

    const overallScore =
      body.scorecard.reduce((sum, c) => sum + c.score, 0) / body.scorecard.length;

    const review = await prisma.qaReview.create({
      data: {
        caseId: kase.id,
        reviewerId: ctx.userId,
        reviewedAgentId: body.reviewedAgentId,
        scorecard: body.scorecard as unknown as Prisma.InputJsonValue,
        overallScore,
        coachingNotes: body.coachingNotes,
      },
    });

    return NextResponse.json({ review }, { status: 201 });
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
