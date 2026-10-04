import { schedule } from "@netlify/functions";

/** Runs every minute. Just pokes the app's own /api/cron/dispatch-events route; the work lives in src/lib/jobs/. */
export const handler = schedule("* * * * *", async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.NEXTAUTH_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("dispatch-events: missing site URL or CRON_SECRET env var, skipping run");
    return { statusCode: 500 };
  }
  try {
    const res = await fetch(`${base}/api/cron/dispatch-events`, { method: "POST", headers: { "x-cron-secret": secret } });
    console.log(`dispatch-events: ${res.status} ${await res.text()}`);
    return { statusCode: res.ok ? 200 : 500 };
  } catch (err) {
    console.error("dispatch-events: request failed", err);
    return { statusCode: 500 };
  }
});
