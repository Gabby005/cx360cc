import type { Prisma } from "@prisma/client";

/** Friendly names for what shows up in the audit log. Unknown values fall back to a tidied version of the raw text. */
export const ACTION_LABELS: Record<string, string> = {
  // tickets
  created: "Created",
  status_changed: "Status changed",
  reassigned: "Reassigned",
  priority_changed: "Priority changed",
  reopened: "Reopened",
  escalated: "Escalated to a unit",
  reused_from: "Created by reusing an earlier ticket",
  reused_as: "Reused as a new ticket",
  inbox_teams_updated: "Inbox team codes changed",
  updated: "Updated",
  batch_closed: "Closed in batch",
  batch_close_run: "Ran a batch close",
  exported: "Downloaded a report",
  // people & access
  user_created: "User created",
  user_added: "User added",
  user_updated: "User updated",
  password_changed: "Password changed",
  password_reset: "Password reset by an admin",
  x_connected: "X (Twitter) account connected",
  role_changed: "Role changed",
  team_created: "Team created",
  // setup
  unit_created: "Department created",
  unit_activated: "Department activated",
  unit_deactivated: "Department deactivated",
  case_code_created: "Case code created",
  case_code_activated: "Case code activated",
  case_code_deactivated: "Case code deactivated",
  sla_policy_updated: "SLA policy changed",
  settings_updated: "Settings changed",
  business_hours_updated: "Business hours changed",
  core_banking_settings_updated: "Core banking connection changed",
  channel_settings_updated: "Channel settings changed",
  x_webhook_registered: "X incoming messages activated",
  x_disconnected: "X account disconnected",
  customer_core_viewed: "Customer core-banking data viewed",
  delivery_settings_updated: "Email/SMS delivery settings changed",
  notification_settings_updated: "Escalation settings changed",
  notification_template_updated: "Message wording edited",
  notification_template_reset: "Message wording reset",
  sla_escalated_level1: "SLA escalated — manager one emailed",
  sla_escalated_level2: "SLA escalated — manager two emailed",
  // integrations
  api_key_created: "API key created",
  api_key_revoked: "API key revoked",
  api_key_updated: "API key changed",
  webhook_created: "Webhook created",
  webhook_updated: "Webhook changed",
  webhook_secret_rotated: "Webhook secret replaced",
  webhook_delivery_resent: "Webhook delivery re-sent",
  webhook_enabled: "Webhook enabled",
  webhook_disabled: "Webhook disabled",
  webhook_deleted: "Webhook deleted",
};

export const ENTITY_LABELS: Record<string, string> = {
  Case: "Ticket",
  CaseExport: "Report download",
  CaseBatch: "Batch close",
  AuditExport: "Audit download",
  User: "User",
  Team: "Team",
  Unit: "Department",
  CaseCode: "Case code",
  SlaPolicy: "SLA policy",
  Tenant: "Settings",
  BusinessHours: "Business hours",
  DeliverySettings: "Email/SMS delivery",
  CoreBanking: "Core banking connection",
  NotificationSettings: "Escalation settings",
  NotificationTemplate: "Message template",
  CustomerSummaryConfig: "Customer summary",
  ApiKey: "API key",
  Webhook: "Webhook",
};

export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
export const entityLabel = (e: string) => ENTITY_LABELS[e] ?? e;

export type AuditFilters = { action?: string; entity?: string; actor?: string };

export function buildAuditWhere(tenantId: string, f: AuditFilters, range: { start: Date; end: Date }): Prisma.AuditLogWhereInput {
  return {
    tenantId,
    createdAt: { gte: range.start, lt: range.end },
    ...(f.action ? { action: f.action } : {}),
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.actor ? { actorId: f.actor } : {}),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** One readable line describing what changed. */
export function describeChange(before: unknown, after: unknown, max = 240): string {
  let out = "";
  if (isObj(before) && isObj(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const parts = keys
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((k) => `${k}: ${fmt(before[k])} → ${fmt(after[k])}`);
    out = parts.join("; ") || "No field changes";
  } else if (isObj(after)) {
    out = Object.entries(after).map(([k, v]) => `${k}: ${fmt(v)}`).join("; ");
  } else if (isObj(before)) {
    out = "Removed — " + Object.entries(before).map(([k, v]) => `${k}: ${fmt(v)}`).join("; ");
  }
  return out.length > max ? out.slice(0, max - 1) + "…" : out;
}
