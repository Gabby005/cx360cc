import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Workflow Execution Engine
 * -------------------------
 * Interprets WorkflowRule rows (Trigger → Conditions → Actions, stored as
 * JSON so the no-code builder in Admin can write to them directly) against
 * domain Events written to the outbox.
 *
 * Design choices:
 * - Conditions are ALL-must-match (AND). OR/nested groups are a
 *   Phase 2 extension of the same JSON shape — the interpreter below is
 *   written so adding a `{ any: [...] }` group later doesn't require
 *   touching the dispatcher.
 * - Every (rule, event) pair is logged to WorkflowExecutionLog whether or
 *   not it matched, so "why didn't rule X fire" is answerable from the
 *   Admin UI without reading server logs.
 * - Actions run inside the same transaction as the log write. If an action
 *   throws, the log still records the error and the transaction for THAT
 *   rule is rolled back — but does not stop other rules for the same event
 *   from running (each rule gets its own transaction).
 */

export type Condition = {
  field: string; // dot path into the context, e.g. "priority", "customer.segment"
  operator: "equals" | "not_equals" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  value: unknown;
};

export type Action =
  | { type: "set_status"; params: { status: string } }
  | { type: "set_priority"; params: { priority: string } }
  | { type: "assign_case"; params: { agentId?: string; strategy?: "least_open_cases" } }
  | { type: "add_case_note"; params: { body: string; internal?: boolean } }
  | { type: "notify"; params: { channel: "slack" | "email"; target: string; template?: string } };

export type WorkflowContext = {
  // Flattened, top-level fields resolvable directly (e.g. "priority", "status", "caseType").
  [key: string]: unknown;
  customer?: Record<string, unknown>;
};

type Tx = Prisma.TransactionClient | PrismaClient;

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function resolveField(path: string, ctx: WorkflowContext): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, ctx);
}

export function evaluateCondition(cond: Condition, ctx: WorkflowContext): boolean {
  const actual = resolveField(cond.field, ctx);

  switch (cond.operator) {
    case "equals":
      return actual === cond.value;
    case "not_equals":
      return actual !== cond.value;
    case "gt":
      return typeof actual === "number" && actual > (cond.value as number);
    case "gte":
      return typeof actual === "number" && actual >= (cond.value as number);
    case "lt":
      return typeof actual === "number" && actual < (cond.value as number);
    case "lte":
      return typeof actual === "number" && actual <= (cond.value as number);
    case "contains":
      return typeof actual === "string" && actual.toLowerCase().includes(String(cond.value).toLowerCase());
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(actual);
    default:
      return false;
  }
}

export function evaluateConditions(conditions: Condition[], ctx: WorkflowContext): boolean {
  if (!conditions || conditions.length === 0) return true; // no conditions = always match
  return conditions.every((c) => evaluateCondition(c, ctx));
}

// ---------------------------------------------------------------------------
// Context building — assembles the flat object conditions/actions reference
// ---------------------------------------------------------------------------

export async function buildContext(
  tx: Tx,
  eventType: string,
  payload: Record<string, unknown>
): Promise<WorkflowContext> {
  const ctx: WorkflowContext = { ...payload, eventType };

  const caseId = payload.caseId as string | undefined;
  if (caseId) {
    const kase = await tx.case.findUnique({
      where: { id: caseId },
      include: { customer: true },
    });
    if (kase) {
      ctx.status = kase.status;
      ctx.priority = kase.priority;
      ctx.caseType = kase.type;
      ctx.category = kase.category;
      ctx.assignedToId = kase.assignedToId;
      ctx.customer = {
        id: kase.customer.id,
        segment: kase.customer.segment,
        sentimentAvg: kase.customer.sentimentAvg,
      };
    }
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

async function executeAction(
  tx: Tx,
  action: Action,
  ctx: WorkflowContext,
  tenantId: string
): Promise<{ type: string; result: string }> {
  const caseId = ctx.caseId as string | undefined;

  switch (action.type) {
    case "set_status": {
      if (!caseId) return { type: action.type, result: "skipped: no caseId in context" };
      await tx.case.update({ where: { id: caseId }, data: { status: action.params.status as any } });
      return { type: action.type, result: `case ${caseId} -> ${action.params.status}` };
    }

    case "set_priority": {
      if (!caseId) return { type: action.type, result: "skipped: no caseId in context" };
      await tx.case.update({ where: { id: caseId }, data: { priority: action.params.priority as any } });
      return { type: action.type, result: `case ${caseId} -> priority ${action.params.priority}` };
    }

    case "assign_case": {
      if (!caseId) return { type: action.type, result: "skipped: no caseId in context" };

      let agentId = action.params.agentId;
      if (!agentId && action.params.strategy === "least_open_cases") {
        agentId = await pickLeastLoadedAgent(tx, tenantId);
      }
      if (!agentId) return { type: action.type, result: "skipped: no agent resolved" };

      await tx.case.update({ where: { id: caseId }, data: { assignedToId: agentId } });
      return { type: action.type, result: `case ${caseId} -> agent ${agentId}` };
    }

    case "add_case_note": {
      if (!caseId) return { type: action.type, result: "skipped: no caseId in context" };
      // System-authored notes need a user row; workflow actions record
      // against the tenant's first ADMIN membership as the acting "system" user.
      const admin = await tx.membership.findFirst({ where: { tenantId, role: "ADMIN" } });
      if (!admin) return { type: action.type, result: "skipped: no admin user to author note" };
      await tx.caseNote.create({
        data: { caseId, authorId: admin.userId, body: action.params.body, internal: action.params.internal ?? true },
      });
      return { type: action.type, result: "note added" };
    }

    case "notify": {
      // Real Slack/email delivery is a Phase 2 integration; this records
      // the notification intent so it's visible in the execution log and
      // can be wired to a real provider without changing the rule shape.
      return { type: action.type, result: `would notify ${action.params.channel}:${action.params.target}` };
    }

    default:
      return { type: (action as Action).type, result: "unknown action type" };
  }
}

async function pickLeastLoadedAgent(tx: Tx, tenantId: string): Promise<string | undefined> {
  const agents = await tx.membership.findMany({
    where: { tenantId, role: "AGENT" },
    select: { userId: true },
  });
  if (agents.length === 0) return undefined;

  const counts = await Promise.all(
    agents.map(async (a) => ({
      userId: a.userId,
      openCases: await tx.case.count({
        where: { assignedToId: a.userId, tenantId, status: { notIn: ["RESOLVED", "CLOSED"] } },
      }),
    }))
  );

  counts.sort((a, b) => a.openCases - b.openCases);
  return counts[0]?.userId;
}

// ---------------------------------------------------------------------------
// Entry point — run all enabled rules for a tenant/triggerType against one event
// ---------------------------------------------------------------------------

export async function runRulesForEvent(
  prisma: PrismaClient,
  event: { id: string; tenantId: string; type: string; payload: unknown }
): Promise<{ rulesEvaluated: number; rulesMatched: number }> {
  const rules = await prisma.workflowRule.findMany({
    where: { tenantId: event.tenantId, triggerType: event.type, enabled: true },
  });

  let matched = 0;

  for (const rule of rules) {
    try {
      await prisma.$transaction(async (tx) => {
        const ctx = await buildContext(tx, event.type, event.payload as Record<string, unknown>);
        const conditions = (rule.conditions as unknown as Condition[]) ?? [];
        const isMatch = evaluateConditions(conditions, ctx);

        let actionsRun: { type: string; result: string }[] = [];
        if (isMatch) {
          const actions = (rule.actions as unknown as Action[]) ?? [];
          for (const action of actions) {
            const result = await executeAction(tx, action, ctx, event.tenantId);
            actionsRun.push(result);
          }
        }

        await tx.workflowExecutionLog.create({
          data: {
            tenantId: event.tenantId,
            ruleId: rule.id,
            eventId: event.id,
            matched: isMatch,
            actionsRun: actionsRun as unknown as Prisma.InputJsonValue,
          },
        });

        if (isMatch) matched++;
      });
    } catch (err) {
      await prisma.workflowExecutionLog.create({
        data: {
          tenantId: event.tenantId,
          ruleId: rule.id,
          eventId: event.id,
          matched: false,
          error: err instanceof Error ? err.message : "Unknown error",
        },
      });
    }
  }

  return { rulesEvaluated: rules.length, rulesMatched: matched };
}
