---
title: "CX360 — IT Rehearsal Guide"
subtitle: "Hosting CX360 inside the bank (away from Netlify)"
---

# 1. What this guide is for

This guide walks IT through a **full dry run**: install CX360 on a bank server, connect it, test it, break it on purpose, restore it, and decide when it is safe to go live. Do the whole rehearsal on a **staging server** first. Nothing here touches the live Netlify system until you choose to switch over.

**Time needed:** about one working day for the rehearsal, plus a short cut-over window on go-live day.

**What you end up with**

| Piece | What it does |
|---|---|
| Proxy (Caddy) | The one door staff use. Handles HTTPS with the bank's certificate. |
| App | CX360 itself (a Next.js application). |
| Database (PostgreSQL 16) | All cases, customers and messages. Only the app can reach it. |
| Scheduler | Replaces Netlify's timers: sends email/SMS, checks SLAs, reads the mailbox, cleans old logs. |

All four run as containers from one file (`deploy/docker-compose.yml`). The same package runs on Netlify or in the bank, so nothing in the app has to change.

> **Honest note.** The deployment files in `deploy/` were written and syntax-checked but could not be built end-to-end in the environment where they were produced (no access to the bank network or a container build host). Treat the first rehearsal build as the real test. If a step fails, note the exact error text; it is usually a small fix.

## Who does what

| Role | Person | Responsibilities |
|---|---|---|
| IT infrastructure | | Server, OS, Docker, firewall, DNS, certificate |
| IT security | | Reviews network rules, secrets handling, access |
| DBA (optional) | | Only if using the bank's own PostgreSQL instead of the bundled one |
| CX360 owner (Service Monitoring & Quality) | | Business sign-off, test scripts, user training |
| Integrations owner | | SMS gateway, core banking, Avaya, mailbox permissions |

# 2. How the pieces connect

```
Staff browser ──HTTPS 443──► Proxy ──► App :3000 ──► Database :5432 (private)
                                         ▲   │
                         Scheduler ──────┘   ├──► Microsoft 365 (email)         outbound HTTPS
                                             ├──► Bank SMS gateway              internal
                                             ├──► Core banking API              internal
                                             ├──► Meta (WhatsApp/Instagram)     outbound HTTPS
                                             └──► X (Twitter)                   outbound HTTPS

Customers' WhatsApp / Instagram / Messenger / X ──► (public internet) ──► ONLY two paths forwarded to the app
Avaya (screen-pop)  : agent's PC opens  https://<host>/screenpop?ani=<number>      (browser → app, internal)
Avaya (call log)    : PBX / middleware POSTs to /api/channels/voice                (internal)
```

# 3. What IT must provide

| Item | Requirement | Notes |
|---|---|---|
| Server | Linux (Ubuntu 22.04/24.04 or RHEL 9), 4 vCPU, 8 GB RAM, 100 GB SSD | A sensible starting point for a few hundred users. Resize after the load test (section 6, test 14). |
| Container engine | Docker Engine 24+ with the Compose plugin | Install by the bank's approved method. |
| Address | A DNS name, for example `cx360.premiumtrust.local` | Staff type this. |
| Certificate | Certificate and key for that name (`server.crt`, `server.key`) | From the bank's internal CA. |
| Time | NTP synchronised | SLA clocks depend on correct time. |
| Backup storage | A second machine or share for backup copies | A backup on the same server is not a backup. |
| Outbound access | See section 4 | Only what the connected channels need. |
| Mailbox permission | Microsoft Entra app with `Mail.ReadWrite` and `Mail.Send` | Only if using email. |

# 4. Network and firewall

| From | To | Port | Needed for |
|---|---|---|---|
| Staff PCs | Proxy | 443 (80 only to redirect) | Using CX360 |
| Proxy | App | 3000 (inside Docker only) | — |
| App | Database | 5432 (inside Docker only) | **Never expose 5432 outside the server** |
| App | `login.microsoftonline.com`, `graph.microsoft.com` | 443 | Email in and out |
| App | Bank SMS gateway | as per gateway | SMS |
| App | Core banking API | as per API | Live balances and transactions |
| App | `graph.facebook.com` | 443 | WhatsApp, Instagram, Messenger replies |
| App | `api.x.com`, `x.com` | 443 | X replies and sign-in |
| Avaya / middleware | App | 443 | Call log (`/api/channels/voice`) |
| Internet (Meta, X) | **Only** `/api/channels/meta` and `/api/channels/x` | 443 | Customer messages arriving |

**Publishing the two webhook paths safely.** Meta and X can only deliver to a public address. Ask the network team to publish **only** those two paths through the bank's existing internet-facing gateway or WAF and forward them to the app. Nothing else (login, pages, admin) should be reachable from the internet. Each message is cryptographically signed by Meta/X and rejected by the app if the signature is wrong, but keeping everything else private is still the right design. If the bank does not want any inbound internet path, skip WhatsApp, Instagram, Messenger and X for now; email, SMS replies and Avaya all work internally.

**Internal addresses.** Because CX360 now lives inside the bank network, the SMS gateway, core banking and webhook receivers can be internal addresses (`http://10.x.x.x/...`). This is switched on by the variable `CX360_ALLOW_INTERNAL_URLS=true` (already set in the example file). On Netlify it stays off, which blocks internal addresses.

# 5. Rehearsal, step by step

## Phase A — Prepare the server (about 45 minutes)

1. Create the staging server and confirm the time is correct: `timedatectl` should say "System clock synchronized: yes".
2. Install Docker and Compose. Check: `docker --version` and `docker compose version`.
3. Create the folder and copy the code in (use the bank's internal Git, or the `.tar.gz` package):

   ```
   sudo mkdir -p /opt/cx360 && sudo chown $USER /opt/cx360
   cd /opt/cx360
   tar -xzf ~/cx360-source.tar.gz        # or: git clone <internal repo> .
   cd deploy
   ```
4. Create the settings file and lock it down:

   ```
   cp .env.production.example .env.production
   chmod 600 .env.production
   ```
5. Fill in `.env.production`. Generate each secret with `openssl rand -base64 32` (use a different one each time):
   `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET`, `CRON_SECRET`, `CX360_INBOUND_TOKEN`, `CX360_TOKEN_KEY`.
   Set `CX360_HOST` and `NEXTAUTH_URL` (same name; the URL starts with `https://`). Keep `CX360_ALLOW_INTERNAL_URLS=true` and `TZ=Africa/Lagos`.
   **Write the secrets into the bank's password vault now.** `CX360_TOKEN_KEY` must never change after X is connected, or the saved sign-in cannot be read.
6. Put the certificate in place: copy `server.crt` and `server.key` into `deploy/certs/`.

## Phase B — Install (about 30 minutes, mostly waiting for the build)

```
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
```

Expected: `db`, `app`, `proxy` and `scheduler` all "running" (app shows "healthy" after about a minute). The `migrate` step runs once and then exits with success; that is normal.

Watch the app start: `docker compose --env-file .env.production logs -f app` (press Ctrl+C to leave).

Create the first administrator (no demo data):

```
docker compose --env-file .env.production run --rm migrate \
  node deploy/bootstrap-admin.cjs --org "PremiumTrust Bank" --slug premiumtrust \
  --email admin.name@premiumtrust.com --name "Admin Name"
```

It prints a one-time temporary password. Keep the `--slug` value: it appears in the webhook addresses.

## Phase C — Smoke tests (about 60 minutes)

Tick each one. "Expected" is what a pass looks like.

| # | Test | How | Expected | Pass |
|---|---|---|---|---|
| 1 | Page loads over HTTPS | Open `https://<CX360_HOST>` from a staff PC | Login page, no certificate warning | ☐ |
| 2 | Health | Open `https://<host>/api/health` | `{"ok":true}` | ☐ |
| 3 | First sign-in | Use the temporary password | Forced to choose a new password | ☐ |
| 4 | Password rules | Try `password1` | Rejected (too common / too short) | ☐ |
| 5 | Lockout | Enter a wrong password 5 times for a test user | Account paused 15 minutes | ☐ |
| 6 | System health screen | Admin → System health | "Before going live" list is shown; **Speed check** under 40 ms | ☐ |
| 7 | Scheduler running | Wait 3 minutes, refresh System health | Background jobs show "Healthy" (not "Never run") | ☐ |
| 8 | Create users | Admin → Users: add one Supervisor and two Agents | Each gets a temporary password shown once | ☐ |
| 9 | Log a case | Agent: Cases → Log a case | Case number issued, SLA clock shown | ☐ |
| 10 | Work a case | Change status, assign, add comment, attach a file | Saved; appears in the timeline | ☐ |
| 11 | Analytics | Supervisor opens Analytics | Charts load, Channels section at the bottom | ☐ |
| 12 | Branding | Admin → Branding: upload logo | Logo shows on login and menu | ☐ |
| 13 | Reboot | `sudo reboot`; wait 3 minutes | CX360 comes back by itself, nothing to start by hand | ☐ |
| 14 | Load test (optional) | 30 people click through screens for 10 minutes | Speed check stays under 120 ms; no errors on System health | ☐ |

## Phase D — Connect the channels (as available)

Do these in **Admin → Channels** and **Admin → Notification centre**. Every secret goes into `.env.production` as `CX360_<NAME>`, then `docker compose --env-file .env.production up -d` to apply.

| Channel | What to do | Test |
|---|---|---|
| Email (Microsoft 365) | Entra app with `Mail.ReadWrite` + `Mail.Send`. Notification centre → Delivery: email = Microsoft 365. Channels: switch on mailbox reading. | Send an email to the mailbox; it appears in the Inbox within 2 minutes. Reply from the Inbox; customer receives it. |
| SMS | Notification centre → Delivery → SMS gateway address, method and body template. Internal address is allowed. | Use the **Test** button; then a real case-opened SMS. |
| SMS replies | Ask the SMS team to forward replies to `https://<host>/api/channels/sms?tenant=<slug>` with header `x-cx360-token: <CX360_INBOUND_TOKEN>`. | Reply to a test SMS; it appears in the Inbox. |
| Core banking | Admin → Core banking: endpoints and field mapping. Use **Test**. | Open a customer: live balance and last 5 transactions show. |
| Avaya screen-pop | Configure Avaya to open `https://<host>/screenpop?ani=<caller number>` for the agent when a call is answered. | Answer a test call: caller's history appears. |
| Avaya call log | Send one POST per finished call to `https://<host>/api/channels/voice?tenant=<slug>` with header `x-cx360-token`. Body fields: `callId, from, to, direction, durationSec, startedAt, agentEmail, disposition`. | Make a missed call: it appears in the Inbox under Phone and in the Overview "Missed calls to return" list. |
| WhatsApp / Instagram / Messenger | Meta app set-up as in the Channels screen; publish `/api/channels/meta` (section 4). | Send a WhatsApp message to the business number. |
| X (Twitter) | Admin → Channels → X: connect, then Activate incoming messages. Publish `/api/channels/x`. | Send a DM to the bank's X account. |

Customer questions for IT to ask Avaya support: which product (Aura, IP Office or Elite)? Can it open a web address with the caller's number on answer? Can it send call details to an internet address after each call?

## Phase E — Failure drills (about 60 minutes)

The point is to find out *now*, calmly, what happens when something breaks.

| # | Drill | Do this | Expected | Pass |
|---|---|---|---|---|
| E1 | Backup | Run `./backup.sh` from `deploy/` | A `.dump` file appears in `deploy/backups/` | ☐ |
| E2 | Restore | Create a test case, run backup, delete the case's customer note, run `./restore.sh backups/<file>` | Data returns to the state at backup time | ☐ |
| E3 | App crash | `docker kill cx360-app-1` | Docker restarts it within seconds; page works again | ☐ |
| E4 | Database down | `docker compose stop db`, open CX360, then `docker compose start db` | Errors while down; recovers by itself after; nothing lost | ☐ |
| E5 | Scheduler stopped | `docker compose stop scheduler`, wait 6 minutes | System health shows jobs "Overdue"; start it again and they recover | ☐ |
| E6 | Bad update | Deploy a deliberately broken version, then roll back (section 7) | Previous version running again in under 10 minutes | ☐ |
| E7 | Disk full warning | Check `df -h` and note where backups and Docker data live | Alert threshold agreed (for example 80%) | ☐ |
| E8 | Certificate expiry | Note the certificate's end date | Renewal reminder in the team calendar | ☐ |

# 6. Moving the live data from Netlify/Neon to the bank

Do this only after the rehearsal passes and the business owner agrees a cut-over window (an evening is ideal).

1. **Announce** a short freeze: staff stop using CX360 for the window.
2. **Export from Neon** (needs `pg_dump` version 16 or newer; use the *direct* connection string, not the pooled one):

   ```
   pg_dump "<NEON_DIRECT_URL>" -Fc -f cx360-neon.dump
   ```
3. **Import into the bank database** (on the server, in `deploy/`):

   ```
   docker compose --env-file .env.production up -d db
   docker compose --env-file .env.production cp cx360-neon.dump db:/tmp/cx360-neon.dump
   docker compose --env-file .env.production exec db pg_restore -U cx360 -d cx360 --clean --if-exists --no-owner /tmp/cx360-neon.dump
   docker compose --env-file .env.production up -d --build
   ```
4. **Re-enter secrets**: gateway and channel secrets are *not* in the database; they live in `.env.production`. X must be reconnected (Admin → Channels → X) if `CX360_TOKEN_KEY` is new.
5. **Check**: counts of cases and customers match what Netlify shows; sign in; run smoke tests 1–2, 6–7, 9–10.
6. **Switch**: point the DNS name at the new server; update the Meta/X webhook addresses and the Avaya settings to the new address.
7. **Keep the Netlify site and Neon database untouched for 2 weeks** as the rollback. If something goes wrong, point DNS back; cases created in the bank system during that time would need to be re-entered or exported, so decide the rollback deadline early (for example, first 48 hours).
8. After sign-off, switch Netlify off and archive the final Neon dump with the bank's records policy.

# 7. Running it day to day

**Daily (2 minutes):** open Admin → System health. Jobs should be Healthy, the queue empty or small, no open errors, speed check under 40 ms.

**Weekly:** confirm the backup copy exists on the *other* machine; apply OS patches in a window; check disk space.

| Task | How |
|---|---|
| See what is running | `docker compose --env-file .env.production ps` |
| Read the app log | `docker compose --env-file .env.production logs --tail=200 app` |
| Restart the app | `docker compose --env-file .env.production restart app` |
| Update to a new version | Replace the code with the new package, then `docker compose --env-file .env.production up -d --build`. Database changes apply automatically. **Run `./backup.sh` first.** |
| Roll back an update | Put the previous code back, `up -d --build` again. If the new version changed the database, restore the backup taken before the update. |
| Change a secret | Edit `.env.production`, then `docker compose --env-file .env.production up -d` |
| Add a user | In CX360: Admin → Users |
| Schedule backups | `crontab -e` and add: `0 1 * * * cd /opt/cx360/deploy && ./backup.sh >> backup.log 2>&1` |
| Uptime monitor | Point the bank's monitoring at `https://<host>/api/health` (expects HTTP 200) |

**Security checklist:** `.env.production` readable only by the service account (`chmod 600`); database port not published; only 443 (and 80 for redirect) open to staff; two administrators exist; demo accounts removed or their passwords reset (System health warns); backups encrypted at rest on the second machine; OS patches monthly.

**Speed.** Keep the app and database on the same server or the same data centre. The "Speed check" on System health reports one database round trip; if it is over 120 ms something is wrong with distance, load or disk. The nightly cleanup keeps logs small; cases, customers, messages, audit trail and surveys are never deleted.

# 8. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Browser warns about the certificate | Wrong certificate, or the bank's CA is not trusted on that PC | Check `deploy/certs/`; install the CA on staff PCs |
| Page won't load | Proxy or app down | `ps`; read `logs app` and `logs proxy` |
| Login redirects in a loop | `NEXTAUTH_URL` differs from the address in the browser | Make them identical, including `https://` |
| "Never run" on every job | Scheduler can't reach the app, or `CRON_SECRET` differs | `logs scheduler`; one `CRON_SECRET` in one file |
| Email/SMS "waiting" forever | Gateway not connected, or unreachable from the server | Notification centre → Delivery → Test; check firewall |
| Internal gateway address rejected | `CX360_ALLOW_INTERNAL_URLS` not `true` | Set it and recreate: `up -d` |
| WhatsApp/X messages never arrive | Webhook path not published, or wrong secret | Check the public route and the Channels screen's "set / not set" marks |
| Screens slow | Distance to database, disk or CPU | System health → Speed check; `docker stats` |
| Build fails | Network blocks the package registry | Allow npm registry on the build host, or build on a machine that can and move the image (`docker save` / `docker load`) |

# 9. Sign-off

| Item | Name | Date | Signature |
|---|---|---|---|
| Rehearsal completed, all smoke tests and drills passed | | | |
| Security review accepted | | | |
| Backup and restore proven | | | |
| Business owner accepts go-live | | | |
| Go-live date and rollback deadline agreed | | | |

# Appendix A — What is in `deploy/`

| File | Purpose |
|---|---|
| `Dockerfile` | Builds the app image (and a one-off tool image for database changes and the first admin) |
| `docker-compose.yml` | Starts database, app, scheduler and proxy together |
| `Caddyfile` | HTTPS front door and the two public webhook paths note |
| `scheduler.cjs` | The timer that replaces Netlify's scheduled functions |
| `backup.sh`, `restore.sh` | Database backup (keeps 14 days) and restore |
| `bootstrap-admin.cjs` | Creates the organisation and first administrator |
| `.env.production.example` | Template for all settings and secrets |
| `certs/` | Where the bank's certificate and key go |

# Appendix B — Settings reference

| Variable | Meaning |
|---|---|
| `CX360_HOST` | Address staff type (for example `cx360.premiumtrust.local`) |
| `NEXTAUTH_URL` | Same address with `https://` |
| `NEXTAUTH_SECRET` | Signs login sessions (long random) |
| `CRON_SECRET` | Lets the scheduler call the background jobs |
| `POSTGRES_PASSWORD` | Database password |
| `CX360_INBOUND_TOKEN` | Shared token for email, SMS-reply and Avaya call-log webhooks |
| `CX360_TOKEN_KEY` | Encrypts saved X sign-in tokens (never change afterwards) |
| `CX360_ALLOW_INTERNAL_URLS` | `true` allows internal gateway addresses |
| `CX360_META_*`, `CX360_WHATSAPP_TOKEN`, `CX360_X_*`, `CX360_GRAPH_CLIENT_SECRET` | Channel secrets (only for channels in use) |
| `CX360_<NAME>` | Any `{{secret:NAME}}` used in Admin settings (for example `CX360_SMS_API_KEY`) |
| `TZ` | Server time zone (for example `Africa/Lagos`); the nightly cleanup runs at 02:00 in this zone |

# Appendix C — Using the bank's own PostgreSQL instead

Remove the `db` service from `docker-compose.yml` (and the `depends_on: db` lines), then set `DATABASE_URL` and `DIRECT_URL` in `.env.production` to the bank database (PostgreSQL 14 or newer). The `DATABASE_URL` / `DIRECT_URL` lines under `environment:` in the compose file override the env file, so delete those lines too. The database user needs permission to create tables (for migrations). Backups then become the DBA's responsibility; keep `backup.sh` only for the bundled database.
