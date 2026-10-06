import { schedule } from "@netlify/functions";

/** Runs daily at 02:00 UTC. Just pokes the app's own /api/cron/data-cleanup route; the work lives in src/lib/jobs/. */
export const handler = schedule("0 2 * * *", async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.NEXTAUTH_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("data-cleanup: missing site URL or CRON_SECRET env var, skipping run");
    return { statusCode: 500 };
  }
  try {
    const res = await fetch(`${base}/api/cron/data-cleanup`, { method: "POST", headers: { "x-cron-secret": secret } });
    console.log(`data-cleanup: ${res.status} ${await res.text()}`);
    return { statusCode: res.ok ? 200 : 500 };
  } catch (err) {
    console.error("data-cleanup: request failed", err);
    return { statusCode: 500 };
  }
});
