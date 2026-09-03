/**
 * SLA Engine
 * ----------
 * Pure functions for computing SLA state from a Case + its SlaPolicy.
 * Kept dependency-free (no Prisma types) so it's trivially unit-testable.
 *
 * Design: elapsed% is always computed on read from timestamps — never
 * stored — so it's correct even if a request arrives seconds before a
 * scheduled sweep would have caught a breach. The scheduled sweep
 * (/api/cron/sla-check) exists only to *emit events* (warnings, breaches,
 * escalations) exactly once, not to be the source of truth for display.
 */

export type SlaTarget = {
  responseMinutes: number;
  resolutionMinutes: number;
  warningThresholdPct: number;
  escalationThresholdPct: number;
};

export type SlaClockInput = {
  createdAt: Date;
  respondedAt: Date | null;
  resolvedAt: Date | null;
  policy: SlaTarget;
  now?: Date;
};

export type SlaClockState = {
  stage: "response" | "resolution" | "met";
  targetMinutes: number;
  elapsedMinutes: number;
  elapsedPct: number; // 0-100+, can exceed 100 on breach
  dueAt: Date;
  status: "ok" | "warning" | "escalate" | "breach";
  minutesRemaining: number; // negative once breached
};

export function computeSlaClock(input: SlaClockInput): SlaClockState {
  const now = input.now ?? new Date();
  const { policy } = input;

  // Determine which clock is currently active: response, then resolution.
  const stage: SlaClockState["stage"] = input.resolvedAt
    ? "met"
    : input.respondedAt
    ? "resolution"
    : "response";

  const anchor = input.createdAt;
  const targetMinutes =
    stage === "response" ? policy.responseMinutes : policy.resolutionMinutes;

  const dueAt = new Date(anchor.getTime() + targetMinutes * 60_000);

  if (stage === "met") {
    return {
      stage,
      targetMinutes,
      elapsedMinutes: minutesBetween(anchor, input.resolvedAt!),
      elapsedPct: 0,
      dueAt,
      status: "ok",
      minutesRemaining: minutesBetween(now, dueAt),
    };
  }

  const elapsedMinutes = minutesBetween(anchor, now);
  const elapsedPct = Math.round((elapsedMinutes / targetMinutes) * 100);
  const minutesRemaining = minutesBetween(now, dueAt);

  let status: SlaClockState["status"] = "ok";
  if (elapsedPct >= 100) status = "breach";
  else if (elapsedPct >= policy.escalationThresholdPct) status = "escalate";
  else if (elapsedPct >= policy.warningThresholdPct) status = "warning";

  return { stage, targetMinutes, elapsedMinutes, elapsedPct, dueAt, status, minutesRemaining };
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** Formats minutes remaining as a compact countdown string, e.g. "14m", "-2m", "1h 05m". */
export function formatCountdown(minutesRemaining: number): string {
  const sign = minutesRemaining < 0 ? "-" : "";
  const abs = Math.abs(minutesRemaining);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${String(m).padStart(2, "0")}m`;
}

export const SLA_STATUS_LABEL: Record<SlaClockState["status"], string> = {
  ok: "On track",
  warning: "At risk",
  escalate: "Escalating",
  breach: "Breached",
};
