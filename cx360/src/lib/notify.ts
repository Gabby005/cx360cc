import type { Prisma, PrismaClient } from "@prisma/client";
import { sendNotification, sendNotificationsBulk, type SendNotificationInput } from "@/lib/notifications";
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_BY_KEY,
  renderTemplate,
  type TemplateKey,
  type Vars,
} from "@/lib/notification-templates";

type Db = Prisma.TransactionClient | PrismaClient;

export type Stage = "opened" | "resolved" | "closed";

export type ResolvedTemplate = { key: TemplateKey; channel: "email" | "sms"; enabled: boolean; subject?: string; body: string; isCustom: boolean };
export type TemplateMap = Map<string, ResolvedTemplate>;

/** Built-in defaults merged with whatever the admin has edited. One query. */
export async function loadTemplates(db: Db, tenantId: string): Promise<TemplateMap> {
  const overrides = await db.notificationTemplate.findMany({ where: { tenantId }, select: { key: true, enabled: true, subject: true, body: true } });
  const byKey = new Map(overrides.map((o) => [o.key, o]));
  const map: TemplateMap = new Map();
  for (const d of DEFAULT_TEMPLATES) {
    const o = byKey.get(d.key);
    map.set(d.key, {
      key: d.key,
      channel: d.channel,
      enabled: o ? o.enabled : true,
      subject: o ? o.subject ?? d.subject : d.subject,
      body: o ? o.body : d.body,
      isCustom: !!o,
    });
  }
  return map;
}

export const appBaseUrl = () => (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");

type CaseLike = { id: string; caseNumber: string; subject: string; priority: string; status: string; type: string; category?: string | null };
type PersonLike = { name?: string | null; email?: string | null };

const TYPE_LABEL: Record<string, string> = { COMPLAINT: "Complaint", SERVICE_REQUEST: "Request", INQUIRY: "Enquiry", INCIDENT: "Incident" };

/** The values that fill {{placeholders}} for one ticket. */
export function caseVars(args: {
  tenantName: string;
  kase: CaseLike;
  customer?: { firstName: string; lastName: string } | null;
  owner?: PersonLike | null;
  departmentName?: string | null;
  statusLabel?: string;
  extra?: Vars;
}): Vars {
  const { kase, customer, owner } = args;
  return {
    customerName: customer?.firstName ?? "Customer",
    customerFullName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
    caseNumber: kase.caseNumber,
    subject: kase.subject,
    type: TYPE_LABEL[kase.type] ?? kase.type,
    priority: kase.priority,
    status: args.statusLabel ?? kase.status,
    category: kase.category ?? "",
    ownerName: owner?.name ?? "Unassigned",
    ownerEmail: owner?.email ?? "",
    departmentName: args.departmentName ?? "",
    bankName: args.tenantName,
    caseUrl: `${appBaseUrl()}/cases/${kase.id}`,
    ...args.extra,
  };
}

/** Customer messages for a stage: up to one email + one SMS, only where the template is on and the customer has that contact. */
export function buildCustomerMessages(
  templates: TemplateMap,
  stage: Stage,
  p: { tenantId: string; vars: Vars; relatedCaseId: string; email?: string | null; phone?: string | null }
): SendNotificationInput[] {
  const out: SendNotificationInput[] = [];
  const email = templates.get(`case.${stage}.email`);
  const sms = templates.get(`case.${stage}.sms`);
  if (email?.enabled && p.email) {
    out.push({
      tenantId: p.tenantId,
      channel: "email",
      to: p.email,
      subject: renderTemplate(email.subject ?? "", p.vars),
      message: renderTemplate(email.body, p.vars),
      relatedCaseId: p.relatedCaseId,
      kind: email.key,
    });
  }
  if (sms?.enabled && p.phone) {
    out.push({
      tenantId: p.tenantId,
      channel: "sms",
      to: p.phone,
      message: renderTemplate(sms.body, p.vars),
      relatedCaseId: p.relatedCaseId,
      kind: sms.key,
    });
  }
  return out;
}

/** Sends the customer their "ticket opened / resolved / closed" email + SMS using the current templates. */
export async function notifyCaseStage(db: Db, tenantId: string, caseId: string, stage: Stage) {
  const kase = await db.case.findFirst({
    where: { id: caseId, tenantId },
    select: {
      id: true, caseNumber: true, subject: true, priority: true, status: true, type: true, category: true,
      customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
      assignedTo: { select: { name: true, email: true } },
    },
  });
  if (!kase) return;
  const [templates, tenant] = await Promise.all([loadTemplates(db, tenantId), db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })]);
  const msgs = buildCustomerMessages(templates, stage, {
    tenantId,
    vars: caseVars({ tenantName: tenant?.name ?? "", kase, customer: kase.customer, owner: kase.assignedTo }),
    relatedCaseId: kase.id,
    email: kase.customer.email,
    phone: kase.customer.phone,
  });
  for (const m of msgs) await sendNotification(db, m);
}

/** The "ticket escalated to a department" email, from the editable template. */
export async function sendUnitEscalationEmail(
  db: Db,
  p: { tenantId: string; caseId: string; unit: { name: string; email: string } }
) {
  const kase = await db.case.findFirst({
    where: { id: p.caseId, tenantId: p.tenantId },
    select: {
      id: true, caseNumber: true, subject: true, priority: true, status: true, type: true, category: true,
      customer: { select: { firstName: true, lastName: true } },
      assignedTo: { select: { name: true, email: true } },
    },
  });
  if (!kase) return;
  const [templates, tenant] = await Promise.all([loadTemplates(db, p.tenantId), db.tenant.findUnique({ where: { id: p.tenantId }, select: { name: true } })]);
  const t = templates.get("case.escalated.unit.email")!;
  if (!t.enabled) return;
  const vars = caseVars({ tenantName: tenant?.name ?? "", kase, customer: kase.customer, owner: kase.assignedTo, departmentName: p.unit.name });
  await sendNotification(db, {
    tenantId: p.tenantId,
    channel: "email",
    to: p.unit.email,
    subject: renderTemplate(t.subject ?? "", vars),
    message: renderTemplate(t.body, vars),
    relatedCaseId: kase.id,
    kind: t.key,
  });
}

export { sendNotificationsBulk, TEMPLATE_BY_KEY };
