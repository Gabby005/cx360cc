import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/tenant";
import { MAX_FILES, MAX_TOTAL_BYTES, fmtSize } from "@/lib/attachments";

/** Checks the files an agent attached to an email (theirs to use, not yet sent, within limits). */
export async function resolveAttachments(tenantId: string, ids: string[] | undefined): Promise<{ ids: string[]; note: string }> {
  if (!ids?.length) return { ids: [], note: "" };
  if (ids.length > MAX_FILES) throw new ApiError(400, `Attach up to ${MAX_FILES} files per email.`);
  const rows = await prisma.mailAttachment.findMany({ where: { id: { in: ids }, tenantId, notificationId: null }, select: { id: true, filename: true, size: true } });
  if (rows.length !== new Set(ids).size) throw new ApiError(400, "One of the attached files is no longer available — please attach it again.");
  if (rows.reduce((n, r) => n + r.size, 0) > MAX_TOTAL_BYTES) throw new ApiError(400, `Attachments can total up to ${MAX_TOTAL_BYTES / 1048576} MB.`);
  return { ids: rows.map((r) => r.id), note: "\n\n" + rows.map((r) => `📎 ${r.filename} (${fmtSize(r.size)})`).join("\n") };
}
