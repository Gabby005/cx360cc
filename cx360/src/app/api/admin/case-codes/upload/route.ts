import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

const TYPES = ["SERVICE_REQUEST", "COMPLAINT", "INQUIRY", "INCIDENT"];

/**
 * Bulk-imports approved case codes from a CSV for one interaction type.
 * Expected columns (header row optional): code,category,subcategory
 * (subcategory may be blank). Uses the browser's native multipart
 * FormData — no extra CSV-parsing dependency needed for a format this
 * simple, and no third-party upload library required either.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");

    const formData = await req.formData();
    const type = formData.get("type");
    const file = formData.get("file");

    if (typeof type !== "string" || !TYPES.includes(type)) {
      return NextResponse.json({ error: "A valid case type is required." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A CSV file is required." }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows found in that file." }, { status: 400 });
    }

    const result = await prisma.caseCode.createMany({
      data: rows.map((r) => ({
        tenantId: ctx.tenantId,
        type: type as any,
        code: r.code,
        category: r.category,
        subcategory: r.subcategory || null,
      })),
      skipDuplicates: true, // codes must be unique per tenant — re-uploading the same file is safe
    });

    return NextResponse.json({ parsed: rows.length, created: result.count, skipped: rows.length - result.count });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function parseCsv(text: string): { code: string; category: string; subcategory: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: { code: string; category: string; subcategory: string }[] = [];

  for (const line of lines) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    const [code, category, subcategory = ""] = cols;
    if (!code || !category) continue;
    if (code.toLowerCase() === "code" && category.toLowerCase() === "category") continue; // skip header row
    rows.push({ code, category, subcategory });
  }

  return rows;
}
