/**
 * Notification settings (stored in Tenant.notificationSettings): the SLA
 * escalation ladder.
 *
 *   Level 1  the first time a ticket exceeds its turnaround time → email manager one
 *   Level 2  still not closed N hours later (default 24)         → email manager two,
 *            copying the ticket owner, manager one and any extra addresses
 *
 * `enabledSince` is stamped when the ladder is first switched on. Only tickets
 * whose deadline falls AFTER that moment are escalated, so switching it on
 * never floods managers with every ticket that was already overdue.
 */
export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export type SlaLevel1 = { enabled: boolean; to: string[]; cc: string[]; ccOwner: boolean };
export type SlaLevel2 = { enabled: boolean; afterHours: number; to: string[]; cc: string[]; ccOwner: boolean; ccLevel1: boolean };

export type NotificationSettings = {
  sla: {
    enabledSince: string | null; // ISO timestamp
    trigger: "resolution" | "any"; // resolution deadline only, or first-response too
    priorities: string[];
    level1: SlaLevel1;
    level2: SlaLevel2;
  };
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  sla: {
    enabledSince: null,
    trigger: "resolution",
    priorities: [...PRIORITIES],
    level1: { enabled: false, to: [], cc: [], ccOwner: false },
    level2: { enabled: false, afterHours: 24, to: [], cc: [], ccOwner: true, ccLevel1: true },
  },
};

export const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

const emails = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && EMAIL_RE.test(x.trim())).map((x) => x.trim().toLowerCase()))] : [];

/** Reads whatever is stored and always returns a complete, valid settings object. */
export function parseNotificationSettings(raw: unknown): NotificationSettings {
  const d = DEFAULT_NOTIFICATION_SETTINGS.sla;
  const sla = (raw && typeof raw === "object" ? (raw as { sla?: Record<string, unknown> }).sla : undefined) ?? {};
  const l1 = (sla.level1 ?? {}) as Record<string, unknown>;
  const l2 = (sla.level2 ?? {}) as Record<string, unknown>;
  const hours = typeof l2.afterHours === "number" && l2.afterHours >= 1 && l2.afterHours <= 720 ? Math.round(l2.afterHours) : d.level2.afterHours;
  const prios = Array.isArray(sla.priorities) ? sla.priorities.filter((p): p is string => (PRIORITIES as readonly string[]).includes(p as string)) : d.priorities;
  return {
    sla: {
      enabledSince: typeof sla.enabledSince === "string" && !Number.isNaN(Date.parse(sla.enabledSince)) ? sla.enabledSince : null,
      trigger: sla.trigger === "any" ? "any" : "resolution",
      priorities: prios,
      level1: { enabled: l1.enabled === true, to: emails(l1.to), cc: emails(l1.cc), ccOwner: l1.ccOwner === true },
      level2: {
        enabled: l2.enabled === true,
        afterHours: hours,
        to: emails(l2.to),
        cc: emails(l2.cc),
        ccOwner: l2.ccOwner !== false,
        ccLevel1: l2.ccLevel1 !== false,
      },
    },
  };
}

export const ladderActive = (s: NotificationSettings) => s.sla.level1.enabled || s.sla.level2.enabled;
