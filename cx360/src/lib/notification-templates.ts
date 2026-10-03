/**
 * Message templates — the wording of every email / SMS CX360 sends.
 *
 * Built-in defaults live here. When an admin edits one (Admin → Notifications,
 * or the email box in a Workflows escalation level) a row is saved in
 * NotificationTemplate and wins over the default; "Reset to default" deletes
 * that row. Placeholders look like {{caseNumber}} and are filled in per ticket.
 *
 * Pure and dependency-free so the editor can preview live in the browser using
 * exactly the same code the server uses to send.
 */

export type TemplateKey =
  | "case.opened.email"
  | "case.opened.sms"
  | "case.resolved.email"
  | "case.resolved.sms"
  | "case.closed.email"
  | "case.closed.sms"
  | "case.escalated.unit.email"
  | "sla.level1.email"
  | "sla.level2.email";

export type TemplateGroup = "customer" | "department" | "sla";

export type TemplateDef = {
  key: TemplateKey;
  group: TemplateGroup;
  channel: "email" | "sms";
  label: string;
  description: string;
  subject?: string; // email only
  body: string;
  /** SLA templates are switched on/off by the escalation ladder, not by a per-template toggle. */
  alwaysOn?: boolean;
};

export const GROUP_LABEL: Record<TemplateGroup, { title: string; blurb: string }> = {
  customer: { title: "Customer messages", blurb: "Sent to the customer when their ticket is logged, resolved or closed." },
  department: { title: "Department escalation", blurb: "Sent to a department's email when a ticket is escalated to it." },
  sla: { title: "SLA exceeded (managers)", blurb: "Sent to managers when a ticket passes its deadline. Recipients are set under Workflows." },
};

export type VariableKey =
  | "customerName"
  | "customerFullName"
  | "caseNumber"
  | "subject"
  | "type"
  | "priority"
  | "status"
  | "category"
  | "ownerName"
  | "ownerEmail"
  | "departmentName"
  | "dueAt"
  | "overdueBy"
  | "slaStage"
  | "hoursSinceBreach"
  | "bankName"
  | "caseUrl";

export const VARIABLES: { key: VariableKey; label: string }[] = [
  { key: "customerName", label: "Customer first name" },
  { key: "customerFullName", label: "Customer full name" },
  { key: "caseNumber", label: "Ticket number" },
  { key: "subject", label: "Ticket subject" },
  { key: "type", label: "Complaint / Request / Enquiry" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "category", label: "Category" },
  { key: "ownerName", label: "Ticket owner" },
  { key: "ownerEmail", label: "Ticket owner's email" },
  { key: "departmentName", label: "Department escalated to" },
  { key: "dueAt", label: "Deadline" },
  { key: "overdueBy", label: "How overdue" },
  { key: "slaStage", label: "Which deadline (first response / resolution)" },
  { key: "hoursSinceBreach", label: "Hours since the deadline was missed" },
  { key: "bankName", label: "Bank name" },
  { key: "caseUrl", label: "Link to the ticket" },
];

const KNOWN = new Set<string>(VARIABLES.map((v) => v.key));

export const DEFAULT_TEMPLATES: TemplateDef[] = [
  {
    key: "case.opened.email",
    group: "customer",
    channel: "email",
    label: "Ticket logged — email",
    description: "Sent to the customer as soon as their ticket is logged.",
    subject: "Your ticket {{caseNumber}} has been opened",
    body:
      "Hi {{customerName}},\n\nWe've opened ticket {{caseNumber}} for \"{{subject}}\". We'll keep you updated as it progresses.\n\nThank you,\n{{bankName}} Customer Care",
  },
  {
    key: "case.opened.sms",
    group: "customer",
    channel: "sms",
    label: "Ticket logged — SMS",
    description: "Text message to the customer when their ticket is logged.",
    body: "Hi {{customerName}}, we've opened ticket {{caseNumber}} for \"{{subject}}\". We'll keep you updated. - {{bankName}}",
  },
  {
    key: "case.resolved.email",
    group: "customer",
    channel: "email",
    label: "Ticket resolved — email",
    description: "Sent when a ticket is marked Resolved.",
    subject: "Your ticket {{caseNumber}} has been resolved",
    body:
      "Hi {{customerName}},\n\nGood news — ticket {{caseNumber}} (\"{{subject}}\") has been resolved. If anything is still not right, just contact us and we'll reopen it.\n\nThank you,\n{{bankName}} Customer Care",
  },
  {
    key: "case.resolved.sms",
    group: "customer",
    channel: "sms",
    label: "Ticket resolved — SMS",
    description: "Text message when a ticket is marked Resolved.",
    body: "Hi {{customerName}}, ticket {{caseNumber}} has been resolved. If anything is still not right, contact us and we'll reopen it. - {{bankName}}",
  },
  {
    key: "case.closed.email",
    group: "customer",
    channel: "email",
    label: "Ticket closed — email",
    description: "Sent when a ticket is closed without having been marked Resolved first (so customers aren't messaged twice).",
    subject: "Your ticket {{caseNumber}} has been closed",
    body:
      "Hi {{customerName}},\n\nTicket {{caseNumber}} (\"{{subject}}\") has been closed. If you still need help, just reach out and we'll reopen it.\n\nThank you,\n{{bankName}} Customer Care",
  },
  {
    key: "case.closed.sms",
    group: "customer",
    channel: "sms",
    label: "Ticket closed — SMS",
    description: "Text message when a ticket is closed without being marked Resolved first.",
    body: "Hi {{customerName}}, ticket {{caseNumber}} has been closed. Need more help? Contact us and we'll reopen it. - {{bankName}}",
  },
  {
    key: "case.escalated.unit.email",
    group: "department",
    channel: "email",
    label: "Escalated to a department — email",
    description: "Sent to the department's email address when a ticket is escalated to it.",
    subject: "Case escalated to {{departmentName}}: {{caseNumber}}",
    body:
      "A case has been escalated to {{departmentName}}.\n\nCase: {{caseNumber}}\nSubject: {{subject}}\nCustomer: {{customerFullName}}\nPriority: {{priority}}\n\nOpen the case: {{caseUrl}}",
  },
  {
    key: "sla.level1.email",
    group: "sla",
    channel: "email",
    alwaysOn: true,
    label: "Level 1 — SLA exceeded (manager one)",
    description: "Sent the first time a ticket exceeds its turnaround time.",
    subject: "SLA exceeded: ticket {{caseNumber}} ({{priority}})",
    body:
      "Hello,\n\nTicket {{caseNumber}} has exceeded its {{slaStage}} turnaround time and needs attention.\n\nSubject: {{subject}}\nCustomer: {{customerFullName}}\nPriority: {{priority}}\nStatus: {{status}}\nOwner: {{ownerName}}\nDeadline was: {{dueAt}}\nOverdue by: {{overdueBy}}\n\nOpen the ticket: {{caseUrl}}\n\n{{bankName}} CX360",
  },
  {
    key: "sla.level2.email",
    group: "sla",
    channel: "email",
    alwaysOn: true,
    label: "Level 2 — still not closed (manager two)",
    description: "Sent if the ticket is still open a set number of hours after Level 1.",
    subject: "URGENT: ticket {{caseNumber}} still open {{hoursSinceBreach}}h after SLA breach",
    body:
      "Hello,\n\nTicket {{caseNumber}} was escalated {{hoursSinceBreach}} hours ago and is still not closed. It is now {{overdueBy}} overdue and needs your intervention.\n\nSubject: {{subject}}\nCustomer: {{customerFullName}}\nPriority: {{priority}}\nStatus: {{status}}\nOwner: {{ownerName}}\nDeadline was: {{dueAt}}\n\nOpen the ticket: {{caseUrl}}\n\n{{bankName}} CX360",
  },
];

export const TEMPLATE_BY_KEY = new Map<string, TemplateDef>(DEFAULT_TEMPLATES.map((t) => [t.key, t]));
export const isTemplateKey = (k: string): k is TemplateKey => TEMPLATE_BY_KEY.has(k);

export type Vars = Partial<Record<VariableKey, string | number | null | undefined>>;

/** What the editor's live preview shows. */
export const SAMPLE_VARS: Record<VariableKey, string> = {
  customerName: "Ngozi",
  customerFullName: "Ngozi Adeyemi",
  caseNumber: "PTB/COM/E0006/000123",
  subject: "Failed transfer not reversed",
  type: "Complaint",
  priority: "HIGH",
  status: "Open",
  category: "Digital Banking",
  ownerName: "Amara Agent",
  ownerEmail: "amara.agent@bank.com",
  departmentName: "Card Operations",
  dueAt: "Mon 5 Oct, 11:30",
  overdueBy: "3h 20m",
  slaStage: "resolution",
  hoursSinceBreach: "24",
  bankName: "Your Bank",
  caseUrl: "https://your-site.netlify.app/cases/abc123",
};

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Fills {{placeholders}}. Known ones with no value become empty; unknown ones are left visible so typos get noticed. */
export function renderTemplate(text: string, vars: Vars): string {
  return text.replace(PLACEHOLDER, (match, name: string) => {
    if (!KNOWN.has(name)) return match;
    const v = vars[name as VariableKey];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** Placeholder names that aren't recognised (usually a typo like {{casenumber}}). */
export function unknownVariables(text: string): string[] {
  const bad = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) if (!KNOWN.has(m[1])) bad.add(m[1]);
  return [...bad];
}

/** Rough SMS size: plain text fits 160 characters per message (153 once it spans several); non-English characters drop that to 70. */
export function smsInfo(text: string): { length: number; segments: number; unicode: boolean } {
  const unicode = /[^\x00-\x7F£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const length = text.length;
  return { length, unicode, segments: length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi) };
}

/** "3h 20m", "2d 4h", "45m" */
export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
