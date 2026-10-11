import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { parseDeliverySettings } from "@/lib/delivery/config";
import { checkFile, MAX_FILE_BYTES } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/** Uploads one file for an email the agent is writing. It is tied to the email when the email is sent. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "AGENT");

    const t = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { deliverySettings: true } });
    if (parseDeliverySettings(t?.deliverySettings).email.provider !== "graph") {
      throw new ApiError(400, "Attachments need the Microsoft 365 email connection (Admin → Notifications → Delivery).");
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "No file received.");
    const bad = checkFile(file.name, file.size);
    if (bad) throw new ApiError(400, bad);
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) throw new ApiError(400, "That file is too large.");

    // Stop a runaway: no more than 20 un-sent uploads per person-day is plenty for real use.
    const pending = await prisma.mailAttachment.count({ where: { tenantId: ctx.tenantId, notificationId: null, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (pending > 200) throw new ApiError(429, "Too many unsent uploads — try again later.");

    const row = await prisma.mailAttachment.create({
      data: { tenantId: ctx.tenantId, filename: file.name.slice(0, 200), contentType: (file.type || "application/octet-stream").slice(0, 100), size: buf.length, data: buf },
      select: { id: true, filename: true, size: true },
    });
    return NextResponse.json({ attachment: row }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not upload the file" }, { status: 500 });
  }
}
