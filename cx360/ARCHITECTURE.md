# CX360 — Architecture

**One Customer. One View. Every Interaction.**

## 1. Design plan

CX360 is a tool agents stare at for eight hours a day under SLA pressure — not a
marketing site. The design has to prioritize scan-speed, low visual noise, and
unambiguous state (a breaching SLA must never be missed; a resolved case must
never look urgent). That drove every choice below, deliberately away from the
"cream background + terracotta accent + rounded SaaS cards" default.

**Color** (ink, not black — a real ops-console navy):
| Token | Hex | Role |
|---|---|---|
| `--ink-950` | `#0E1420` | App shell background (dark mode base) |
| `--surface` | `#F7F7F5` | Light-mode background |
| `--surface-raised` | `#FFFFFF` / `#161C29` | Cards, panels |
| `--line` | `#E3E1DA` / `#232B3B` | Hairline borders |
| `--primary` | `#2F6F5E` | Brand / primary actions — deep teal, calm, not indigo-default |
| `--ink-text` | `#151A24` / `#E7E9EE` | Body text |
| `--sla-ok` | `#2F6F5E` | SLA on track |
| `--sla-warning` | `#C97A2B` | SLA ≥80% elapsed |
| `--sla-breach` | `#B93A3A` | SLA breached |

**Type:** IBM Plex Sans for all UI text (a workhorse grotesk built for dense
interfaces, not a display face). IBM Plex Mono is used narrowly and
functionally — case IDs, SLA countdown timers, timestamps — because in a
contact-centre tool a monospace numeral genuinely helps agents scan fixed-width
data at speed. It is not decorative.

**Layout:** three-pane workspace (nav rail → list → detail), the pattern real
ops tools (not marketing pages) use: 64px icon rail, a filterable list pane,
and a detail pane that never has to reflow. No card-grid dashboard as the
default view — the default view is a queue.

**Principles:** state is always legible at a glance (color + icon + text,
never color alone); one accent color carries all "needs attention" states;
no decorative gradients, no unnecessary eyebrow labels, no eyebrow ALL-CAPS.

## 2. High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 14 (App Router) — single deployable unit on Netlify │
│  ┌───────────────┐   ┌────────────────────────────────────┐ │
│  │  React UI      │   │  Route Handlers (/app/api/**)      │ │
│  │  (RSC + client)│──▶│  = the "NestJS-equivalent" API layer│ │
│  └───────────────┘   └───────────────┬────────────────────┘ │
└───────────────────────────────────────┼──────────────────────┘
                                         ▼
                              ┌─────────────────────┐
                              │  Prisma ORM          │
                              └──────────┬───────────┘
                                         ▼
                              ┌─────────────────────┐
                              │  PostgreSQL (your DB) │
                              └─────────────────────┘
                     Redis (SLA jobs, notifications) — optional, via Upstash
```

**Why Next.js API routes instead of a separate NestJS service:** the brief
asks for a single Netlify-hosted deployable connected to a customer database.
Next.js Route Handlers give the same layered-controller pattern (auth
middleware → validation → service → Prisma) without standing up and
separately hosting a second backend service. If you later outgrow this (e.g.
you need long-running workers, a telephony event consumer, or gRPC), split
`src/server/services/*` out into a standalone NestJS service — the service
layer is already isolated from the HTTP layer for exactly that move.

**Multi-tenancy:** every table carries `tenantId`. All Prisma queries go
through a `withTenant()` helper (see `src/lib/tenant.ts`) that injects the
current tenant from the session, so no query can accidentally cross tenants.

**RBAC:** roles (`ADMIN`, `SUPERVISOR`, `AGENT`, `READ_ONLY`) are stored per
tenant-membership; route handlers declare required permissions via
`requirePermission()`.

**Events:** domain events (`case.created`, `sla.breached`, etc.) are written
to an `Event` outbox table inside the same transaction as the state change,
then dispatched to registered webhooks by a background dispatcher. This
outbox pattern avoids the classic "DB commit succeeded, webhook call failed"
data-loss bug.

**SLA engine:** SLA policy rows define response/resolution targets per
priority. `src/lib/sla.ts` computes elapsed%, due timestamps, and next
warning threshold on read (cheap, always-correct) and a scheduled job
(`/api/cron/sla-check`, run automatically every 2 minutes via
`netlify/functions/sla-check.ts` — see README §3) sweeps for
breaches/warnings and emits events.

## 3. Phased build (this delivery vs. what's stubbed)

This first delivery implements a **working vertical slice** end-to-end —
Auth → Customer 360 → Cases → Agent Workspace → SLA Engine, on a real,
migratable Postgres schema that already models *all* modules from the brief
(Knowledge Base, Feedback, QA, Workflow Automation, Integration Hub, Admin,
Customer Portal) so nothing has to be redesigned later. Modules beyond the
vertical slice have schema + a stub page with a clear "Phase 2" marker rather
than being invented as disconnected mock screens, per the brief's
instruction not to fake it.

| Module | Status in this delivery |
|---|---|
| Auth (RBAC, multi-tenant) | ✅ Working (NextAuth credentials + session-based RBAC) |
| Customer 360 | ✅ Working (profile, products, interactions, cases, sentiment) |
| Case Management | ✅ Working (CRUD, assignment, priority, status, SLA linkage) |
| Agent Workspace | ✅ Working (queue, active case, SLA countdown, customer context) |
| SLA Engine | ✅ Working (policy config, live countdown, breach/warning events) |
| Omnichannel Inbox | ✅ Working — ingest, triage, reply, convert-to-case; live channel adapters (Twilio/WhatsApp Business API/telephony CTI) are Phase 2, they need provider credentials |
| Workflow Automation | ✅ Working — condition/action engine, execution log, rule builder in Admin |
| Knowledge Base | 🟡 Schema + list/search UI; authoring workflow is Phase 2 |
| Feedback (CSAT/NPS/CES) | 🟡 Schema + capture endpoint; survey builder is Phase 2 |
| Quality Management | 🟡 Schema only |
| Analytics & Reporting | 🟡 One real dashboard (SLA + queue metrics from live data); rest is Phase 2 |
| Integration Hub | ✅ Working — API keys, webhook CRUD + test delivery, authenticated `/api/v1` external API; connector marketplace listing is a catalog only (OAuth wiring per provider is Phase 2) |
| Admin Centre | ✅ Users/roles/SLA policy config working; rest Phase 2 |
| Customer Portal | 🟡 Schema ready; separate portal app is Phase 2 |

## 4. Workflow execution engine

`src/lib/workflow-engine.ts` interprets `WorkflowRule` rows against domain
events using the same outbox pattern already used for webhooks:

1. Every state-changing API route writes an `Event` row in the same
   transaction as the change (`case.created`, `case.assigned`, `sla.breached`, …).
2. `/api/cron/dispatch-events` sweeps undispatched events on a schedule,
   and for each one:
   - finds enabled `WorkflowRule`s whose `triggerType` matches the event type
   - builds a flat evaluation context (event payload + the related Case and
     Customer, so conditions can reference `priority`, `customer.segment`, etc.)
   - evaluates `conditions` (AND semantics — all must match; empty = always match)
   - if matched, runs `actions` in order: `set_status`, `set_priority`,
     `assign_case` (fixed agent, or `least_open_cases` load-balancing across
     agents), `add_case_note`, `notify` (records intent to the execution
     log; wiring a real Slack/email provider is a one-function change in
     `executeAction`)
   - writes a `WorkflowExecutionLog` row regardless of match/failure, so
     Admin → Workflows shows *why* a rule did or didn't fire, not just that
     it exists
3. The same sweep delivers matching events to `WebhookSubscription`s
   (HMAC-signed via `X-CX360-Signature`), and marks the event dispatched
   exactly once — so a retried sweep can never double-fire an action or a
   webhook for the same event.

Rules are configured via `POST /api/workflows` (structured JSON: `name`,
`triggerType`, `conditions[]`, `actions[]`) and a form UI on the Workflows
page. This is a *structured* no-code builder — dropdowns and repeatable
rows, not a drag-and-drop canvas — but it writes the exact same JSON shape
the engine reads, so a visual canvas can be layered on top later without
touching `workflow-engine.ts`.

Schedule `/api/cron/dispatch-events` the same way as `/api/cron/sla-check`
(see README §3) — typically every 30–60 seconds. Both are already wired as
Netlify Scheduled Functions in this delivery (`netlify/functions/`), so no
manual cron setup is needed on Netlify — they just need `CRON_SECRET` set.

## 5. Omnichannel Inbox pipeline

The Inbox models one real thing well — the ingest → triage → respond →
convert pipeline — rather than faking six channel integrations. `Interaction`
rows carry a `status` (`NEW` → `IN_PROGRESS` → `LINKED`/`CLOSED`) that drives
the queue at `/inbox`, independent of whether a `Case` exists yet:

1. **Ingest** — `POST /api/inbox` is the contract a real channel adapter
   would call after mapping its own payload (a Twilio webhook, an inbound
   email parser, a telephony CTI event) to `{ channel, customerId, summary,
   transcript }`. Until those adapters are connected (they need live
   provider credentials — Twilio, WhatsApp Business API, etc. — which is
   why they're Phase 2), the Inbox UI's "Simulate incoming message" panel
   calls this exact same endpoint, so everything downstream of ingest is
   exercised for real.
2. **Triage** — the Inbox queue lists `NEW`/`IN_PROGRESS` inbound messages
   across all channels, filterable by channel, each showing the customer
   and a preview.
3. **Respond** — `POST /api/inbox/:id/reply` creates an outbound
   `Interaction` on the same channel/customer thread and flips status to
   `IN_PROGRESS`.
4. **Convert to case** — `POST /api/inbox/:id/convert-to-case` calls the
   same `createCase()` service the Cases API uses (`src/lib/case-service.ts`),
   so a case opened from the inbox gets an identical SLA clock and
   `case.created`/`complaint.created` event as one opened directly — no
   duplicated logic, no drift between the two entry points.
5. **Close without a case** — for messages that don't need one (spam,
   already resolved elsewhere).

## 6. Integration Hub

Two authenticated surfaces, both real:

- **`/api/v1/customers`, `/api/v1/cases`** — the external, API-key-authenticated
  REST surface (`src/lib/api-auth.ts` handles the `X-API-Key` /
  `Authorization: Bearer` handshake). This is deliberately built on the
  same Prisma models and the same `createCase()` service the web app and
  the Inbox use — a case opened by a core-banking system via API key gets
  an identical SLA clock and `case.created` event as one opened by an
  agent. Keys are generated in Admin → Integration Hub, shown once at
  creation, and stored only as a SHA-256 hash (`src/lib/api-key.ts`) — the
  same pattern Stripe/GitHub use, so a database leak alone can't be used
  to authenticate as a customer.
- **Webhooks** — `WebhookSubscription` rows subscribe a URL to specific
  event types; delivery is HMAC-SHA256-signed (`X-CX360-Signature`,
  `src/lib/webhook.ts`) and happens two ways: the scheduled
  `/api/cron/dispatch-events` sweep (real traffic), and a "Send test
  event" button in the UI that calls the identical delivery function
  synchronously for instant feedback when wiring up a new endpoint.

The **connector marketplace** grid in Integration Hub is a catalog, not
live connections — each entry (core banking, Twilio, WhatsApp Business
API, SAP, Salesforce, …) needs that provider's own OAuth app and
credentials to wire up, which this delivery doesn't have. The API-key and
webhook infrastructure above is exactly what a real connector would plug
into once credentials exist.

## 7. Getting it running

See `README.md` for exact setup, database, and Netlify deployment steps.
