import { schedule } from "@netlify/functions";

/**
 * Runs every minute — more frequently than the SLA sweep, since this
 * drives the workflow engine and webhook delivery, and delayed
 * automation (e.g. "notify supervisor" not firing for a minute) is more
 * noticeable to users than a slightly-late SLA warning.
 *
 * Calls /api/cron/dispatch-events, which itself calls
 * runRulesForEvent() (src/lib/workflow-engine.ts) and deliverWebhook()
 * (src/lib/webhook.ts) for every undispatched Event row.
 */
export const handler = schedule("* * * * *", async () => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error("dispatch-events: missing URL or CRON_SECRET env var, skipping run");
    return { statusCode: 500 };
  }

  try {
    const res = await fetch(`${base}/api/cron/dispatch-events`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const body = await res.text();
    console.log(`dispatch-events: ${res.status} ${body}`);
    return { statusCode: res.ok ? 200 : 500 };
  } catch (err) {
    console.error("dispatch-events: request failed", err);
    return { statusCode: 500 };
  }
});
