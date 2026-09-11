import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requirePermission, ApiError } from "@/lib/tenant";

/**
 * Bulk-imports department units from a CSV. Expected columns (header row
 * optional): name,email. Same native-FormData approach as the CaseCode
 * upload — no extra CSV-parsing dependency for a format this simple.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "ADMIN");

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A CSV file is required." }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows found in that file." }, { status: 400 });
    }

    const result = await prisma.unit.createMany({
      data: rows.map((r) => ({ tenantId: ctx.tenantId, name: r.name, email: r.email })),
      skipDuplicates: true, // units are unique per (tenant, email) — safe to re-upload the same file
    });

    return NextResponse.json({ parsed: rows.length, created: result.count, skipped: rows.length - result.count });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function parseCsv(text: string): { name: string; email: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: { name: string; email: string }[] = [];

  for (const line of lines) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    const [name, email] = cols;
    if (!name || !email) continue;
    if (name.toLowerCase() === "name" && email.toLowerCase() === "email") continue; // skip header row
    rows.push({ name, email });
  }

  return rows;
}
