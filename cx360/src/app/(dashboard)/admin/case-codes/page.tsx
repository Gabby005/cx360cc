import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { CaseCodesClient } from "@/components/admin/case-codes-client";

export default async function CaseCodesPage() {
  const ctx = await requireSession();
  if (ctx.role !== "ADMIN") redirect("/dashboard");

  const codes = await prisma.caseCode.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ type: "asc" }, { category: "asc" }, { subcategory: "asc" }],
  });

  return (
    <div className="h-full overflow-y-auto p-6 max-w-4xl">
      <Link href="/admin" className="text-xs text-ink-950/50 dark:text-surface/50 hover:text-brand">
        ← Admin centre
      </Link>
      <h1 className="text-lg font-semibold mt-2 mb-1">Case codes</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        The approved category/subcategory taxonomy per interaction type. Each code becomes part of the case number
        — e.g. a Complaint using code <code className="kbd">E0006</code> becomes{" "}
        <code className="kbd">{"{PREFIX}"}/COM/E0006/000123</code>. Upload a CSV (columns:{" "}
        <code className="kbd">code,category,subcategory</code>) or add codes one at a time below.
      </p>

      <CaseCodesClient initialCodes={JSON.parse(JSON.stringify(codes))} />
    </div>
  );
}
