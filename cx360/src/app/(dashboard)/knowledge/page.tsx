import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenant";

export default async function KnowledgePage() {
  const ctx = await requireSession();
  const articles = await prisma.knowledgeArticle.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">Knowledge base</h1>
      <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
        Search results feed agent-workspace suggestions. Authoring, approvals and versioning UI ship in Phase 2.
      </p>
      <ul className="divide-y divide-line-light dark:divide-line-dark card">
        {articles.map((a) => (
          <li key={a.id} className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{a.title}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-line-light dark:bg-ink-800">{a.status}</span>
            </div>
            <p className="text-xs text-ink-950/50 dark:text-surface/50 mt-1">{a.category ?? "Uncategorized"} · v{a.version}</p>
          </li>
        ))}
        {articles.length === 0 && (
          <li className="p-8 text-center text-sm text-ink-950/50 dark:text-surface/50">
            No articles yet. Seed data adds a few — run <code className="kbd">npm run db:seed</code>.
          </li>
        )}
      </ul>
    </div>
  );
}
