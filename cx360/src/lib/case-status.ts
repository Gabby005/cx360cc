export const CASE_STATUSES = [
  "NEW",
  "OPEN",
  "PENDING_CUSTOMER",
  "PENDING_BANK",
  "PENDING_THIRD_PARTY",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  PENDING_CUSTOMER: "Pending with Customer",
  PENDING_BANK: "Pending with Bank",
  PENDING_THIRD_PARTY: "Pending with 3rd Party",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const STATUS_PILL: Record<string, string> = {
  NEW: "pill-neutral",
  OPEN: "pill-neutral",
  PENDING_CUSTOMER: "pill-warning",
  PENDING_BANK: "pill-warning",
  PENDING_THIRD_PARTY: "pill-warning",
  ESCALATED: "pill-breach",
  RESOLVED: "pill-ok",
  CLOSED: "pill-neutral",
};

/** "Open" in the sense of "still needs work" — used to scope dashboards, SLA sweeps, and per-agent counts. */
export const OPEN_STATUSES = ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY", "ESCALATED"] as const;
