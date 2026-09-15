import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";

// Base64 data URI, capped generously. No object storage (S3/Cloudinary/
// etc.) is configured in this environment, so files are stored directly
// on the row — fine for a handful of documents/images per case, not how
// you'd want to handle many large attachments at real scale. Swap for an
// upload-to-object-storage-then-store-the-URL flow when that's available;
// this endpoint's shape (fileName, mimeType, a reference) wouldn't change.
const MAX_DATA_URL_LENGTH = 4_500_000; // ~3.3MB raw file, after base64's ~33% overhead

const uploadSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  dataUrl: z.string().startsWith("data:").max(MAX_DATA_URL_LENGTH, "File is too large — please use one under ~3MB"),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    const body = uploadSchema.parse(await req.json());

    const kase = await prisma.case.findFirst({ where: { id: params.id, tenantId: ctx.tenantId } });
    if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });

    const attachment = await prisma.caseAttachment.create({
      data: {
        tenantId: ctx.tenantId,
        caseId: kase.id,
        fileName: body.fileName,
        mimeType: body.mimeType,
        dataUrl: body.dataUrl,
        sizeBytes: Math.round((body.dataUrl.length * 3) / 4), // approx decoded size from base64 length
        uploadedById: ctx.userId,
      },
      include: { uploadedBy: { select: { name: true } } },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
