import { schedule } from "@netlify/functions";

/**
 * Runs every 2 minutes. Calls the app's own /api/cron/sla-check route
 * rather than duplicating its logic here — this function is just the
 * scheduler trigger; all the actual SLA-breach detection and event
 * emission lives in src/app/api/cron/sla-check/route.ts so it's covered
 * by the same code path (and same tests, if you add them) whether it's
 * invoked by this schedule or manually with curl.
 *
 * `URL` is a Netlify-provided env var pointing at this site's own
 * deployed URL — no need to hardcode a domain.
 */
export const handler = schedule("*/2 * * * *", async () => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error("sla-check: missing URL or CRON_SECRET env var, skipping run");
    return { statusCode: 500 };
  }

  try {
    const res = await fetch(`${base}/api/cron/sla-check`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const body = await res.text();
    console.log(`sla-check: ${res.status} ${body}`);
    return { statusCode: res.ok ? 200 : 500 };
  } catch (err) {
    console.error("sla-check: request failed", err);
    return { statusCode: 500 };
  }
});
