import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";
import { WorkflowsClient } from "@/components/workflows/workflows-client";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const ctx = await requireSession();
  if (ctx.role !== "SUPERVISOR" && ctx.role !== "ADMIN") redirect("/dashboard");

  const rules = await prisma.workflowRule.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return (
    <WorkflowsClient
      rules={JSON.parse(JSON.stringify(rules))}
      canEdit={ctx.role === "ADMIN" || ctx.role === "SUPERVISOR"}
    />
  );
}
