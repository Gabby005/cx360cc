import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";
import { isValidHexColor } from "@/lib/theme";

// Base64 data URI, capped generously — this is stored directly in the
// Tenant row since no object storage (S3/Cloudinary/etc.) is configured
// in this environment. ~700KB of base64 text is fine in Postgres but
// isn't how you'd want to serve a logo at real scale — swap this for an
// upload-to-object-storage-then-store-the-URL flow when that's available.
const MAX_LOGO_LENGTH = 700_000;

const patchSchema = z.object({
  caseNumberPrefix: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Use uppercase letters/numbers only, e.g. PTB")
    .optional(),
  brandColor: z.string().refine(isValidHexColor, "Must be a hex color like #5B5FEF").optional(),
  logoDataUrl: z
    .string()
    .max(MAX_LOGO_LENGTH, "Logo file is too large — please use an image under ~500KB")
    .startsWith("data:image/", "Must be an image file")
    .nullable()
    .optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");
    const body = patchSchema.parse(await req.json());

    const tenant = await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: body,
    });

    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
