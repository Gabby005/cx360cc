import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/cases/print-button";
import { STATUS_LABEL } from "@/lib/case-status";

/**
 * A standalone, session-authenticated printable view of a case — outside
 * the (dashboard) route group, so it renders with none of the app's
 * sidebar/top-bar chrome. "Download PDF" opens this in a new tab and the
 * person uses their browser's native Print → Save as PDF, rather than a
 * server-side PDF library. That's a deliberate choice: this app is
 * deployed as Netlify serverless functions, and PDF-generation libraries
 * (e.g. pdfkit) read font files from disk at runtime — a real reliability
 * risk in a serverless bundle that hasn't been tested against Netlify's
 * packaging. The browser's print engine has no such risk and produces an
 * equally real PDF.
 */
export default async function CasePrintPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const tenantId = session.user.tenantId;

  const c = await prisma.case.findFirst({
    where: { id: params.id, tenantId },
    include: {
      customer: true,
      assignedTo: { select: { name: true } },
      slaPolicy: true,
      caseCode: true,
    },
  });
  if (!c) notFound();

  const [notes, activity] = await Promise.all([
    prisma.caseNote.findMany({
      where: { caseId: c.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      where: { tenantId, entity: "Case", entityId: c.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const actorIds = [...new Set(activity.map((a) => a.actorId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.name]));

  const timeline = [
    ...notes.map((n) => ({
      at: n.createdAt,
      text: `${n.author.name} commented: "${n.body}"`,
    })),
    ...activity.map((a) => ({
      at: a.createdAt,
      text: `${a.actorId ? actorNameById.get(a.actorId) ?? "Someone" : "System"} — ${a.action.replace("_", " ")}`,
    })),
  ].sort((x, y) => x.at.getTime() - y.at.getTime());

  return (
    <div className="max-w-2xl mx-auto p-8 print:p-0 bg-white text-ink-950 min-h-screen">
      <PrintButton />

      <div className="flex items-center justify-between border-b border-line-light pb-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand text-white grid place-items-center font-semibold text-xs">
            CX
          </div>
          <span className="font-semibold">CX360</span>
        </div>
        <span className="font-mono text-xs text-ink-950/50">{c.caseNumber}</span>
      </div>

      <h1 className="text-xl font-semibold mb-1">{c.subject}</h1>
      <p className="text-sm text-ink-950/60 mb-6">
        {c.type.replace("_", " ")} · Opened {c.createdAt.toLocaleString()}
      </p>

      <table className="w-full text-sm mb-6 border border-line-light rounded overflow-hidden">
        <tbody>
          <Row label="Customer" value={`${c.customer.firstName} ${c.customer.lastName}`} />
          <Row label="Contact" value={c.customer.email ?? c.customer.phone ?? "—"} />
          <Row label="Status" value={STATUS_LABEL[c.status] ?? c.status} />
          <Row label="Priority" value={c.priority} />
          <Row
            label="Category"
            value={c.caseCode ? `${c.caseCode.category}${c.caseCode.subcategory ? ` / ${c.caseCode.subcategory}` : ""} (${c.caseCode.code})` : c.category ?? "—"}
          />
          <Row label="Assigned to" value={c.assignedTo?.name ?? "Unassigned"} />
          {c.slaPolicy && (
            <>
              <Row
                label="Response due"
                value={c.responseDueAt ? c.responseDueAt.toLocaleString() : "—"}
              />
              <Row
                label="Resolution due"
                value={c.resolutionDueAt ? c.resolutionDueAt.toLocaleString() : "—"}
              />
            </>
          )}
          <Row label="Resolved at" value={c.resolvedAt ? c.resolvedAt.toLocaleString() : "Not yet resolved"} />
        </tbody>
      </table>

      {c.description && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-1">Description</h2>
          <p className="text-sm whitespace-pre-wrap">{c.description}</p>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Full history</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-ink-950/50">No activity recorded.</p>
        ) : (
          <ul className="text-sm space-y-1.5">
            {timeline.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-xs text-ink-950/40 shrink-0 w-40">
                  {t.at.toLocaleString()}
                </span>
                <span>{t.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[10px] text-ink-950/30 mt-10 pt-4 border-t border-line-light">
        Generated by CX360 on {new Date().toLocaleString()}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-line-light last:border-0">
      <td className="px-3 py-2 text-ink-950/50 w-40 bg-surface">{label}</td>
      <td className="px-3 py-2">{value}</td>
    </tr>
  );
}
