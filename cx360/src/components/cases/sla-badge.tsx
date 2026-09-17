import { AlertTriangle, CheckCircle2, Clock, Flame } from "lucide-react";
import clsx from "clsx";
import { computeSlaClock, formatCountdown, SLA_STATUS_LABEL, type SlaTarget } from "@/lib/sla";

const STYLE: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  ok: { bg: "bg-sla-ok/10", text: "text-sla-ok", icon: CheckCircle2 },
  warning: { bg: "bg-sla-warning/10", text: "text-sla-warning", icon: Clock },
  escalate: { bg: "bg-sla-warning/15", text: "text-sla-warning", icon: AlertTriangle },
  breach: { bg: "bg-sla-breach/10", text: "text-sla-breach", icon: Flame },
};

export function SlaBadge({
  createdAt,
  respondedAt,
  resolvedAt,
  policy,
}: {
  createdAt: Date;
  respondedAt: Date | null;
  resolvedAt: Date | null;
  policy: SlaTarget;
}) {
  const clock = computeSlaClock({ createdAt, respondedAt, resolvedAt, policy });

  if (clock.stage === "met") {
    return (
      <span className="pill-ok">
        <CheckCircle2 size={12} /> Met SLA
      </span>
    );
  }

  const s = STYLE[clock.status];
  const Icon = s.icon;

  return (
    <span
      className={clsx("pill font-mono", s.bg, s.text)}
      title={`${SLA_STATUS_LABEL[clock.status]} · ${clock.stage} target ${clock.targetMinutes}m`}
    >
      <Icon size={12} />
      {formatCountdown(clock.minutesRemaining)}
    </span>
  );
}
