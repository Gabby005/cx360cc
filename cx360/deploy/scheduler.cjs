/**
 * CX360 scheduler — replaces Netlify's scheduled functions when the app is hosted inside the bank.
 * Calls the app's own background-job addresses on time. No packages needed (plain Node).
 *   APP_URL     where the app is (default http://app:3000)
 *   CRON_SECRET must match the app's CRON_SECRET
 * A job never overlaps itself, a failed call is just logged and tried again next time.
 */
const APP = (process.env.APP_URL || "http://app:3000").replace(/\/+$/, "");
const SECRET = process.env.CRON_SECRET;
if (!SECRET) {
  console.error("scheduler: CRON_SECRET is not set — nothing to do.");
  process.exit(1);
}

const MIN = 60_000;
const JOBS = [
  { name: "dispatch-events", every: 1 * MIN },
  { name: "dispatch-notifications", every: 1 * MIN },
  { name: "dispatch-webhooks", every: 1 * MIN },
  { name: "poll-mailbox", every: 1 * MIN },
  { name: "sla-check", every: 2 * MIN },
  { name: "data-cleanup", dailyAtHour: 2 }, // 02:00 server time (TZ)
];

const state = new Map(JOBS.map((j) => [j.name, { last: 0, running: false, lastDay: "" }]));

async function call(job) {
  const s = state.get(job.name);
  if (s.running) return;
  s.running = true;
  const t0 = Date.now();
  try {
    const res = await fetch(`${APP}/api/cron/${job.name}`, { method: "POST", headers: { "x-cron-secret": SECRET }, signal: AbortSignal.timeout(60_000) });
    const text = (await res.text()).slice(0, 300);
    console.log(`${new Date().toISOString()} ${job.name} ${res.status} ${Date.now() - t0}ms ${res.ok ? "" : text}`);
  } catch (err) {
    console.error(`${new Date().toISOString()} ${job.name} failed: ${err && err.message}`);
  } finally {
    s.running = false;
    s.last = Date.now();
  }
}

function tick() {
  const now = new Date();
  for (const job of JOBS) {
    const s = state.get(job.name);
    if (job.every) {
      if (Date.now() - s.last >= job.every) call(job);
    } else if (job.dailyAtHour !== undefined) {
      const day = now.toDateString();
      if (now.getHours() === job.dailyAtHour && s.lastDay !== day) {
        s.lastDay = day;
        call(job);
      }
    }
  }
}

console.log(`scheduler: started, calling ${APP}`);
setTimeout(() => { tick(); setInterval(tick, 10_000); }, 15_000); // small delay so the app is ready
