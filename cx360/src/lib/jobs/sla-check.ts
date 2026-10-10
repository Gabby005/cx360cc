import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeSlaClock } from "@/lib/sla";
import { parseBusinessHours, type BusinessHours } from "@/lib/business-hours";
import { parseNotificationSettings, type NotificationSettings } from "@/lib/notification-settings";
import { loadTemplates, caseVars, type TemplateMap } from "@/lib/notify";
import { type SendNotificationInput } from "@/lib/notifications";
import { renderTemplate, formatDuration } from "@/lib/notification-templates";
import { STATUS_LABEL } from "@/lib/case-status";
import { decideEscalation } from "@/lib/sla-escalation";
import { REOPEN_RULES } from "@/lib/reopen-policy";

const BATCH = 500; // cases read per round trip
const MAX_SCAN = 5000; // cases examined per run, so one run always finishes quickly; the next run continues
const MAX_ESCALATIONS_PER_RUN = 50; // safety valve: after an outage, managers get a steady trickle, not hundreds of emails at once
const DISPLAY_TZ = process.env.APP_TIMEZONE || "Africa/Lagos";

type TenantCtx = { name: string; hours: BusinessHours | null; settings: NotificationSettings; templates: TemplateMap | null };

/**
 * Called by a scheduler (Netlify Scheduled Function, or any external cron
 * hitting this URL with the CRON_SECRET) every 1-5 minutes. For each open
 * case with an SLA clock it:
 *
 *  1. Emits sla.warning / sla.breached ONCE per stage and level
 *     (tracked in Case.slaLastFlag), and auto-escalates the status on breach.
 *  2. Runs the escalation ladder from Workflows → SLA exceeded:
 *       Level 1  first time the deadline is missed  → email manager one
 *       Level 2  still open N hours later (def. 24) → email manager two,
 *                copying the ticket owner, manager one and any extra addresses
 *     Each level fires once per ticket (Case.slaEscalationLevel). Only tickets
 *     whose deadline passes AFTER the ladder was switched on are escalated.
 */
export async function runSlaCheck() {
  const where = {
    status: { in: ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_BANK", "PENDING_THIRD_PARTY", "ESCALATED"] as ("NEW" | "OPEN" | "PENDING_CUSTOMER" | "PENDING_BANK" | "PENDING_THIRD_PARTY" | "ESCALATED")[] },
    slaPolicyId: { not: null },
    // Skip tickets that have reached their final level, but keep ones waiting on Level 2.
    OR: [{ slaLastFlag: null }, { slaLastFlag: { not: "resolution:breach" } }, { slaEscalationLevel: 1 }],
  };

  const tenants = new Map<string, TenantCtx>();
  async function tenantCtx(tenantId: string): Promise<TenantCtx> {
    let t = tenants.get(tenantId);
    if (!t) {
      const row = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, businessHours: true, notificationSettings: true } });
      t = { name: row?.name ?? "", hours: parseBusinessHours(row?.businessHours), settings: parseNotificationSettings(row?.notificationSettings), templates: null };
      tenants.set(tenantId, t);
    }
    return t;
  }

  let scanned = 0;
  let warnings = 0;
  let breaches = 0;
  let level1 = 0;
  let level2 = 0;
  let cursor: string | undefined;

  while (scanned < MAX_SCAN) {
    const rows = await prisma.case.findMany({
      where,
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        tenantId: true,
        caseNumber: true,
        subject: true,
        priority: true,
        type: true,
        category: true,
        status: true,
        createdAt: true,
        reopenedAt: true,
        respondedAt: true,
        resolvedAt: true,
        slaLastFlag: true,
        slaBreachedAt: true,
        slaEscalationLevel: true,
        customer: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { name: true, email: true } },
        createdBy: { select: { name: true, email: true } },
        slaPolicy: { select: { responseMinutes: true, resolutionMinutes: true, warningThresholdPct: true, escalationThresholdPct: true, businessHoursOnly: true } },
      },
    });
    if (rows.length === 0) break;

    const now = new Date();
    const events: { tenantId: string; type: string; payload: Prisma.InputJsonValue }[] = [];
    const flagGroups = new Map<string, string[]>();
    const escalateIds: string[] = [];
    const notifications: SendNotificationInput[] = [];
    const audits: { tenantId: string; actorId: null; action: string; entity: string; entityId: string; after: Prisma.InputJsonValue }[] = [];
    const ladderUpdates: { id: string; level: 1 | 2; breachedAt?: Date }[] = [];

    for (const c of rows) {
      if (!c.slaPolicy) continue;
      // A reopened ticket sends no SLA warnings or manager emails (rules in src/lib/reopen-policy.ts).
      if (c.reopenedAt && !REOPEN_RULES.alertManagers) continue;
      const tc = await tenantCtx(c.tenantId);
      const businessHours = c.slaPolicy.businessHoursOnly ? tc.hours : null;
      const clock = computeSlaClock({ createdAt: c.createdAt, startedAt: c.reopenedAt, respondedAt: c.respondedAt, resolvedAt: c.resolvedAt, policy: c.slaPolicy, businessHours });

      // 1) warning / breach events — once per stage and level
      if (clock.status !== "ok") {
        const flag = `${clock.stage}:${clock.status}`;
        if (flag !== c.slaLastFlag) {
          const breached = clock.status === "breach";
          events.push({ tenantId: c.tenantId, type: breached ? "sla.breached" : "sla.warning", payload: { caseId: c.id, stage: clock.stage, level: clock.status, elapsedPct: clock.elapsedPct } });
          flagGroups.set(flag, [...(flagGroups.get(flag) ?? []), c.id]);
          if (breached) {
            breaches++;
            if (c.status !== "ESCALATED") escalateIds.push(c.id);
          } else {
            warnings++;
          }
        }
      }

      // 2) escalation ladder (Workflows → SLA exceeded) — the rules live in sla-escalation.ts
      const sla = tc.settings.sla;
      if (level1 + level2 >= MAX_ESCALATIONS_PER_RUN) continue;
      const decision = decideEscalation({ sla, priority: c.priority, level: c.slaEscalationLevel, escalatedAt: c.slaBreachedAt, clock, now });
      if (decision === "none") continue;

      if (decision === "start_level2_timer") {
        // Level 1 is switched off but Level 2 is on: start the Level 2 timer without emailing anyone.
        ladderUpdates.push({ id: c.id, level: 1, breachedAt: now });
        continue;
      }

      const owner = c.assignedTo ?? c.createdBy;
      const fmtDue = new Intl.DateTimeFormat("en-GB", { timeZone: tc.hours?.timezone ?? DISPLAY_TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      tc.templates ??= await loadTemplates(prisma, c.tenantId);

      const compose = (key: "sla.level1.email" | "sla.level2.email", to: string[], cc: string[], escalatedAt: Date) => {
        const t = tc.templates!.get(key)!;
        const hoursSince = Math.max(0, Math.round((now.getTime() - escalatedAt.getTime()) / 3_600_000));
        const overdueMinutes = clock.status === "breach" ? Math.max(0, -clock.minutesRemaining) : 0;
        const vars = caseVars({
          tenantName: tc.name,
          kase: c,
          customer: c.customer,
          owner,
          statusLabel: STATUS_LABEL[c.status] ?? c.status,
          extra: {
            dueAt: fmtDue.format(clock.dueAt),
            overdueBy: formatDuration(overdueMinutes),
            slaStage: clock.stage === "response" ? "first-response" : "resolution",
            hoursSinceBreach: hoursSince,
          },
        });
        const toSet = new Set(to.map((x) => x.toLowerCase()));
        const ccList = [...new Set(cc.map((x) => x.toLowerCase()))].filter((x) => !toSet.has(x));
        notifications.push({
          tenantId: c.tenantId,
          channel: "email",
          to: to.join(", "),
          cc: ccList,
          subject: renderTemplate(t.subject ?? "", vars),
          message: renderTemplate(t.body, vars),
          relatedCaseId: c.id,
          kind: key,
        });
      };

      if (decision === "level1") {
        compose("sla.level1.email", sla.level1.to, [...sla.level1.cc, ...(sla.level1.ccOwner && owner?.email ? [owner.email] : [])], now);
        events.push({ tenantId: c.tenantId, type: "sla.escalated", payload: { caseId: c.id, level: 1 } });
        audits.push({ tenantId: c.tenantId, actorId: null, action: "sla_escalated_level1", entity: "Case", entityId: c.id, after: { notified: sla.level1.to } });
        ladderUpdates.push({ id: c.id, level: 1, breachedAt: now });
        level1++;
      } else {
        const cc = [...sla.level2.cc, ...(sla.level2.ccOwner && owner?.email ? [owner.email] : []), ...(sla.level2.ccLevel1 ? sla.level1.to : [])];
        compose("sla.level2.email", sla.level2.to, cc, c.slaBreachedAt ?? now);
        events.push({ tenantId: c.tenantId, type: "sla.escalated", payload: { caseId: c.id, level: 2 } });
        audits.push({ tenantId: c.tenantId, actorId: null, action: "sla_escalated_level2", entity: "Case", entityId: c.id, after: { notified: sla.level2.to } });
        ladderUpdates.push({ id: c.id, level: 2 });
        level2++;
      }
    }

    if (events.length > 0 || ladderUpdates.length > 0) {
      await prisma.$transaction(
        [
          ...(events.length ? [prisma.event.createMany({ data: events })] : []),
          ...[...flagGroups.entries()].map(([flag, ids]) => prisma.case.updateMany({ where: { id: { in: ids } }, data: { slaLastFlag: flag } })),
          ...(escalateIds.length ? [prisma.case.updateMany({ where: { id: { in: escalateIds } }, data: { status: "ESCALATED" } })] : []),
          ...ladderUpdates.map((u) => prisma.case.update({ where: { id: u.id }, data: { slaEscalationLevel: u.level, ...(u.breachedAt ? { slaBreachedAt: u.breachedAt } : {}) } })),
          ...(audits.length ? [prisma.auditLog.createMany({ data: audits })] : []),
          ...(notifications.length ? [prisma.notificationLog.createMany({ data: notifications.map((n) => ({ tenantId: n.tenantId, channel: n.channel, to: n.to, cc: n.cc?.length ? n.cc.join(", ") : null, subject: n.subject, message: n.message, relatedCaseId: n.relatedCaseId, kind: n.kind, status: "queued" })) })] : []),
        ],
      );
    }

    scanned += rows.length;
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  return { scanned, warnings, breaches, escalatedLevel1: level1, escalatedLevel2: level2 };
}
