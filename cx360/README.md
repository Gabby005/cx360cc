# CX360 — Enterprise Contact Centre CRM

One Customer. One View. Every Interaction.

This is a working full-stack vertical slice: real Postgres schema (via
Prisma), real auth, real SLA countdown logic, and Auth → Customer 360 →
Cases → Agent Workspace wired end-to-end. See `ARCHITECTURE.md` for what's
fully working vs. scaffolded for Phase 2, and the design rationale.

## 1. Local setup

```bash
git clone <your-repo-url> cx360 && cd cx360
npm install
cp .env.example .env      # fill in DATABASE_URL etc. — see below
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in with:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@demobank.cx360` | `demo1234` |
| Supervisor | `supervisor@demobank.cx360` | `demo1234` |
| Agent | `agent@demobank.cx360` | `demo1234` |

The seed script creates a "Demo Bank plc" tenant, SLA policies matching the
brief's worked example (Critical 15m/2h, High 30m/4h…), five demo customers,
and six cases at different SLA-elapsed states so you can see the SLA badge
in ok/warning/breach states immediately.

## 2. Connecting your own database

CX360 needs any standard PostgreSQL 13+ database. Common options:

- **Neon** (serverless Postgres, generous free tier, works great with Netlify)
- **Supabase**
- **Netlify DB** (Neon under the hood, one-click from the Netlify dashboard)
- **AWS RDS / Aiven / your own Postgres**

Steps:
1. Create the database and copy its connection string.
2. Set `DATABASE_URL` (and `DIRECT_URL` if your provider gives you a
   separate pooled vs. direct connection string — Neon and Supabase both do)
   in `.env` locally and in Netlify's environment variables for production.
3. Run `npx prisma migrate deploy` against it (locally pointed at prod, or
   as a Netlify build-time step — see below) to create all tables.
4. Optionally run `npm run db:seed` once against a fresh environment to get
   realistic demo data — safe to skip in a real production database.

**Important:** never commit `.env` — it's already in `.gitignore`. Put
secrets only in Netlify's Environment Variables UI (Site settings →
Environment variables).

## 3. Deploying to Netlify

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Netlify should auto-detect Next.js and use `netlify.toml` (already
   configured with `@netlify/plugin-nextjs`). Build command `npm run build`,
   publish directory `.next` — already set.
4. Add environment variables in **Site settings → Environment variables**:
   `DATABASE_URL`, `DIRECT_URL` (if applicable), `NEXTAUTH_URL` (your live
   Netlify URL, e.g. `https://cx360-demo.netlify.app`), `NEXTAUTH_SECRET`
   (generate with `openssl rand -base64 32`), `CRON_SECRET` (same command).
5. Add `npx prisma migrate deploy` as a **pre-build command** (Site settings
   → Build & deploy → Build settings) so schema changes ship automatically
   on every deploy — or run it manually against production when you change
   the schema.
6. Deploy.

### Background sweeps run automatically — no extra setup

`netlify/functions/sla-check.ts` and `netlify/functions/dispatch-events.ts`
are already wired as [Netlify Scheduled Functions](https://docs.netlify.com/functions/scheduled-functions/)
(via `netlify.toml`'s `[functions]` block and the `schedule()` wrapper from
`@netlify/functions`). Once `CRON_SECRET` is set as an environment variable
and the site is deployed, they run on their own:

- **`sla-check`** — every 2 minutes. Calls `/api/cron/sla-check`, which
  emits `sla.warning` / `sla.breached` events and auto-escalates breached cases.
- **`dispatch-events`** — every 1 minute. Calls `/api/cron/dispatch-events`,
  which runs the workflow engine against any undispatched event and
  delivers matching webhooks.

Both functions read the site's own URL from Netlify's built-in `URL` env
var and authenticate with `CRON_SECRET` as the `x-cron-secret` header — the
exact same check the two routes already enforce, so nothing needs to match
up manually. You can confirm they're running from **Netlify → Functions**
in the dashboard (each invocation is logged), or watch `WorkflowExecutionLog`
rows appear in Admin → Workflows as real events flow through.

If you'd rather not use Netlify's scheduler (e.g. running on a different
host), any external cron works too — hit `POST /api/cron/<name>` with the
`x-cron-secret` header on the same schedule.

## 4. External API (Integration Hub)

Generate a key at **Admin → Integration Hub → New key** (shown once — copy
it immediately), then:

```bash
curl https://your-site.netlify.app/api/v1/customers \
  -H "X-API-Key: cx360_..."

curl -X POST https://your-site.netlify.app/api/v1/cases \
  -H "X-API-Key: cx360_..." \
  -H "Content-Type: application/json" \
  -d '{"customerId":"<id>","subject":"Card blocked incorrectly","priority":"HIGH","type":"COMPLAINT"}'
```

Webhooks (also in Integration Hub) deliver events as signed POSTs:

```
POST <your-url>
X-CX360-Signature: <hex HMAC-SHA256 of the raw body, using your webhook's secret>
Content-Type: application/json

{"type":"case.created","payload":{"caseId":"...","priority":"HIGH"},"sentAt":"..."}
```

Verify by recomputing the HMAC over the exact raw request body with your
secret and comparing to the header.

## 5. Project structure

```
prisma/schema.prisma      Full data model — all 12 modules from the brief
prisma/seed.ts             Realistic demo data
src/lib/sla.ts              SLA engine — pure, unit-testable countdown logic
src/lib/tenant.ts           Session + RBAC + tenant-isolation helpers
src/lib/auth.ts             NextAuth config (credentials provider)
src/app/api/**              Route handlers = the API layer
src/app/(auth)/login        Sign-in
src/app/(dashboard)/**      Authenticated app shell + pages
src/components/**           UI components
```

## 6. Extending this

- **Add a channel adapter** (e.g. WhatsApp Business API webhook): add a
  route handler at `src/app/api/webhooks/whatsapp/route.ts` that verifies
  the provider's signature, maps its payload to `{ customerId, channel,
  summary, transcript }` (looking up/creating the `Customer` by phone
  number first if needed), and calls the same logic as `POST /api/inbox` —
  the Inbox queue, reply, and convert-to-case flows all work unchanged
  from there.
- **Add a new workflow action type**: add a case to the `switch` in
  `executeAction()` in `src/lib/workflow-engine.ts`, then add the type to
  `ACTION_TYPES` in `src/components/workflows/workflows-client.tsx` (and the
  zod enum in `src/app/api/workflows/route.ts`) so it's selectable in the
  rule builder.
- **Wire real Slack/email delivery**: the `notify` action currently records
  intent to `WorkflowExecutionLog`; replace the `return` in its case with an
  actual API call (Slack webhook URL, or an email provider SDK).
- **Split the API into a standalone NestJS service** if you outgrow a single
  Next.js deployable (e.g. need long-running consumers): the route handlers
  are thin, so move the Prisma calls into `src/server/services/*.ts` first,
  then lift that into a NestJS app — the split is deliberately easy.

## 7. Known gaps in this delivery (see ARCHITECTURE.md §3 for the full table)

Omnichannel channel adapters, workflow execution engine, KB authoring flow,
survey builder, QA scorecards UI, connector marketplace, and the standalone
customer portal are schema-complete but not yet built as UI — they were left
as clearly marked Phase 2 rather than built as disconnected mock screens, per
the brief's instruction to build a real working application first.

## 8. A note on this environment

This scaffold was generated in a sandboxed environment without network
access to `binaries.prisma.sh` or Netlify's API, so `prisma generate` and a
live deploy could not be executed here. Everything has been reviewed for
correctness, but run `npx prisma migrate dev` locally as your first step —
it will download the Prisma engine (unblocked in a normal environment) and
surface any schema issues immediately.
