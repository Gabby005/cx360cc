import { runJob } from "@/lib/monitoring";
import { runSlaCheck } from "./sla-check";
import { runDispatchEvents } from "./dispatch-events";
import { runPollMailbox } from "./poll-mailbox";
import { runDispatchWebhooks } from "./dispatch-webhooks";
import { runDispatchNotifications } from "./dispatch-notifications";

export const JOBS = {
  "sla-check": { label: "SLA check", every: "every 2 min", run: runSlaCheck },
  "dispatch-events": { label: "Workflow & webhook events", every: "every minute", run: runDispatchEvents },
  "poll-mailbox": { label: "Inbound email", every: "every minute", run: runPollMailbox },
  "dispatch-webhooks": { label: "Webhook delivery", every: "every minute", run: runDispatchWebhooks },
  "dispatch-notifications": { label: "Email & SMS delivery", every: "every minute", run: runDispatchNotifications },
} as const;
export type JobName = keyof typeof JOBS;
export const isJobName = (s: string): s is JobName => s in JOBS;

export const runNamedJob = (name: JobName) => runJob(name, JOBS[name].run as () => Promise<Record<string, unknown>>);
