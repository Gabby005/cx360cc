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

## 7. Case codes and case numbering

Case numbers follow `{TenantPrefix}/{TypeCode}/{CaseCode}/{Sequence}`, e.g.
`PTB/COM/E0006/000123`:

- **TenantPrefix** — set in Admin centre (default `CX`), e.g. `PTB` for
  PremiumTrust Bank. Editable at any time; changing it only affects
  cases created afterward, existing numbers never change.
- **TypeCode** — fixed per `CaseType`: Complaint→`COM`, Request
  (`SERVICE_REQUEST`)→`REQ`, Enquiry (`INQUIRY`)→`ENQ`, Incident→`INC`.
  Not admin-configurable by design (these map 1:1 to the enum).
- **CaseCode** — the admin-managed category/subcategory taxonomy
  (`CaseCode` model). Admin uploads a CSV per type (columns:
  `code,category,subcategory`) or adds entries one at a time in
  Admin → Case codes. Agents pick Category → Subcategory when logging a
  case (in the Inbox's "Convert to case" form, and any future case-creation
  form built the same way), which resolves to one `CaseCode` row. Falls
  back to `GEN` if no code is selected, so the number format stays
  consistent either way.
- **Sequence** — a per-tenant atomic counter (`Tenant.caseSequence`),
  zero-padded to 6 digits. Not reset per type/code/year — one running
  count per tenant, so numbers are always increasing and never collide
  even under concurrent case creation.

All of this lives in `src/lib/case-service.ts` (`createCase()`), the same
shared service used by the Cases API, the Inbox's convert-to-case action,
and the external `/api/v1/cases` endpoint — so every entry point produces
identically-formatted numbers with zero duplicated logic.

## 8. Transactional cases, unit escalation, and notifications

Three related pieces, all routed through one shared layer
(`src/lib/notifications.ts`):

- **Transactional toggle** — the New Case form and the Inbox's "Convert to
  case" form both have a "This is a transactional case" checkbox. Turning
  it on requires an Amount + Currency (enforced both client-side and in
  the zod schema server-side) and reveals an optional "Escalate to unit"
  dropdown.
- **Units** — `Unit` model (`Admin → Units`): department name + email,
  managed the same way as `CaseCode` (bulk CSV upload with columns
  `name,email`, or one at a time). If a transactional case has a unit
  selected, submitting it fires an escalation email to that unit —
  handled inside `createCase()` so it's identical regardless of which
  form created the case.
- **Comment required on every case** — `description` went from optional
  to required (`z.string().min(1)`) in every case-creation endpoint
  (Cases API, Inbox convert-to-case, external v1 API). Old rows from
  before this was enforced stay nullable in the DB; new ones can't be
  created without one.
- **Customer notifications** — every case creation sends the customer an
  "opened" message (email + SMS, whichever contact points exist); every
  transition to `CLOSED` (single-case PATCH or batch-close) sends a
  "closed" message. Both call `notifyCustomer()`.
- **SLA-triggered notifications** — the workflow engine's `notify` action
  (see §4) now actually calls `sendNotification()` for the `email`
  channel, instead of just logging an inert string. Same layer, same
  audit trail, whether the trigger was a case event or an SLA rule.

**No real provider is configured** — there's no SendGrid/Twilio/etc.
credentials in this environment. `sendNotification()` logs every attempt
to `NotificationLog` (viewable at `Admin → Notifications`) with
`status: "logged"`. Wiring a real provider is a one-function change at
the `console.log` line in `src/lib/notifications.ts`; nothing else in the
app needs to change since everything already calls that one function.

## 9. Ticket reuse and expanded pending statuses

- **Reuse ticket** — closed cases get a "Reuse this ticket" button
  (`POST /api/cases/:id/reopen`) instead of forcing a brand-new case
  number for the same underlying issue. Reopening keeps the original case
  number and full history, resets `closedAt`/`resolvedAt`, and increments
  `Case.reopenedCount` — a case reopened repeatedly is itself a useful
  quality signal for QA/coaching later.
- **Pending sub-statuses** — `CaseStatus` now includes `PENDING_BANK` and
  `PENDING_THIRD_PARTY` alongside the existing `PENDING_CUSTOMER`, so a
  case's status can reflect *who* it's actually waiting on. Every place
  that displays or filters by status reads from one shared module
  (`src/lib/case-status.ts` — `STATUS_LABEL`, `STATUS_PILL`,
  `OPEN_STATUSES`) rather than each page keeping its own copy, so adding
  a status in the future is a one-file change.

## 10. Core banking read layer (simulated)

`src/lib/core-banking.ts` is the seam where a real Flexcube/T24/etc.
connection would plug in — see the extensive comment in that file for how
a real integration typically works (SOAP/REST core-banking API, a
scheduled sync job writing into `CustomerProduct.balance` and
`AccountTransaction`, matched to CX360 customers via `accountRef`).

No such connection exists in this environment, so `CustomerProduct` and
`AccountTransaction` are seeded with realistic-looking fake data instead.
The Customer 360 page lists an account's linked/sibling accounts as
clickable pills; each opens a dedicated **read-only** account page
(`/customers/:id/accounts/:productId`) showing balance and the last 10
transactions, with no mutation endpoint of any kind — browsing account
data can never affect a `Case` record, only the "Ticket properties"
panel on the case detail page can.

## 11. Branding and theme

- **Dark/light mode** — a real toggle in the top bar (not just prepared
  `dark:` classes). `src/components/theme-init.tsx` is a raw inline
  `<script>` (not a `useEffect`) that applies the saved preference before
  first paint, so there's no flash of the wrong theme.
- **Per-tenant brand color** — `Tenant.brandColor` (hex) drives
  `--brand-rgb`/`--brand-light-rgb`/`--brand-dark-rgb` CSS variables,
  injected via a `<style>` tag in the dashboard layout and login page
  (`src/lib/theme.ts`). Tailwind's `brand` color tokens
  (`tailwind.config.ts`) reference these variables instead of static hex,
  so every `bg-brand`/`text-brand`/`bg-brand/10` utility across the whole
  app updates immediately when Admin changes the color — no rebuild.
  Semantic status colors (`sla-ok`/`warning`/`breach`) are deliberately
  NOT tied to brand customization, so "breach" always reads as red.
- **Logo upload** — stored as a base64 data URI directly on
  `Tenant.logoDataUrl`, capped at ~500KB client-side before upload. There
  is no object storage (S3, Cloudinary, etc.) configured in this
  environment; a production deployment serving a large logo to many users
  should upload to real object storage and store the resulting URL
  instead — the Admin → Branding UI and the `PATCH /api/admin/tenant`
  endpoint wouldn't need to change, only what's stored in that field.

## 12. Getting it running

See `README.md` for exact setup, database, and Netlify deployment steps.
