/**
 * Every event CX360 can send to other systems (webhooks). One list, used by the
 * webhook form, the API reference page and validation.
 */
export type EventDef = { type: string; label: string; description: string; sample: Record<string, unknown> };

export const EVENT_CATALOG: EventDef[] = [
  { type: "case.created", label: "Ticket logged", description: "A new ticket was logged (any type except complaint).", sample: { caseId: "clx…", caseNumber: "PTB/COM/E0006/000123", priority: "HIGH" } },
  { type: "complaint.created", label: "Complaint logged", description: "A new ticket of type Complaint was logged.", sample: { caseId: "clx…", caseNumber: "PTB/COM/E0006/000124", priority: "MEDIUM" } },
  { type: "case.assigned", label: "Ticket assigned", description: "A ticket was assigned or re-assigned to someone.", sample: { caseId: "clx…", assignedToId: "clx…" } },
  { type: "case.resolved", label: "Ticket resolved", description: "A ticket was marked Resolved.", sample: { caseId: "clx…" } },
  { type: "customer.created", label: "Customer created", description: "A customer record was created (in the app or via the API).", sample: { customerId: "clx…", source: "api" } },
  { type: "sla.warning", label: "SLA warning", description: "A ticket has used up its warning share of the SLA clock.", sample: { caseId: "clx…", stage: "resolution", level: "warning", elapsedPct: 82 } },
  { type: "sla.breached", label: "SLA breached", description: "A ticket missed its first-response or resolution deadline.", sample: { caseId: "clx…", stage: "response", level: "breach", elapsedPct: 104 } },
  { type: "sla.escalated", label: "SLA escalated", description: "The escalation ladder emailed manager one (level 1) or manager two (level 2).", sample: { caseId: "clx…", level: 1 } },
];

export const EVENT_TYPES = EVENT_CATALOG.map((e) => e.type);
export const isEventType = (s: string) => EVENT_TYPES.includes(s);
