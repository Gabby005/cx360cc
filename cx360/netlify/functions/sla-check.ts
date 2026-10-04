import { schedule } from "@netlify/functions";

/** Runs every 2 minutes. Just pokes the app's own /api/cron/sla-check route; the work lives in src/lib/jobs/. */
export const handler = schedule("*/2 * * * *", async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.NEXTAUTH_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("sla-check: missing site URL or CRON_SECRET env var, skipping run");
    return { statusCode: 500 };
  }
  try {
    const res = await fetch(`${base}/api/cron/sla-check`, { method: "POST", headers: { "x-cron-secret": secret } });
    console.log(`sla-check: ${res.status} ${await res.text()}`);
    return { statusCode: res.ok ? 200 : 500 };
  } catch (err) {
    console.error("sla-check: request failed", err);
    return { statusCode: 500 };
  }
});
