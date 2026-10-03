import type { NotificationSettings } from "@/lib/notification-settings";

export type EscalationDecision = "none" | "level1" | "start_level2_timer" | "level2";

/**
 * The escalation ladder's rules in one pure, testable place (the SLA sweep
 * just carries out the answer):
 *
 *  - Nothing happens unless the ladder is on, the ticket's priority is covered,
 *    and its deadline passed AFTER the ladder was switched on.
 *  - Level 1 fires once, when the ticket first misses the deadline that counts.
 *  - Level 2 fires once, N hours after Level 1, if the ticket is still open.
 *  - If only Level 2 is on, the N-hour timer starts at the breach with no email.
 */
export function decideEscalation(i: {
  sla: NotificationSettings["sla"];
  priority: string;
  level: number; // Case.slaEscalationLevel
  escalatedAt: Date | null; // Case.slaBreachedAt — when the ticket was first escalated
  clock: { status: string; stage: string; dueAt: Date };
  now: Date;
}): EscalationDecision {
  const { sla, level, clock, now } = i;
  if (!(sla.level1.enabled || sla.level2.enabled) || !sla.enabledSince || !sla.priorities.includes(i.priority)) return "none";

  if (level === 0) {
    const countsAsBreach = sla.trigger === "any" || clock.stage === "resolution";
    if (clock.status !== "breach" || !countsAsBreach) return "none";
    if (clock.dueAt.getTime() < new Date(sla.enabledSince).getTime()) return "none"; // was already overdue before the ladder existed
    if (sla.level1.enabled && sla.level1.to.length > 0) return "level1";
    if (!sla.level1.enabled && sla.level2.enabled) return "start_level2_timer";
    return "none";
  }

  if (level === 1 && sla.level2.enabled && sla.level2.to.length > 0 && i.escalatedAt) {
    if (now.getTime() - i.escalatedAt.getTime() >= sla.level2.afterHours * 3_600_000) return "level2";
  }
  return "none";
}
