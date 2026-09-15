import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, ApiError } from "@/lib/tenant";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  try {
    const ctx = await requireSession();

    const attachment = await prisma.caseAttachment.findFirst({
      where: { id: params.attachmentId, caseId: params.id, tenantId: ctx.tenantId },
    });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // The uploader can remove their own attachment; supervisors/admins can
    // remove anyone's — same boundary as most other cleanup actions here.
    if (attachment.uploadedById !== ctx.userId && ctx.role === "AGENT") {
      throw new ApiError(403, "Only the uploader, a supervisor, or an admin can remove this attachment.");
    }

    await prisma.caseAttachment.delete({ where: { id: attachment.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
