# CX360 — what IT needs to prepare (one page)

**Purpose:** CX360 is the contact-centre CRM for Service Monitoring & Quality. It runs as four containers (app, database, scheduler, proxy) on one Linux server. The full step-by-step is in `IT-REHEARSAL-GUIDE`.

## Before the rehearsal day — please have ready

| # | Item | Done |
|---|---|---|
| 1 | Linux server (Ubuntu 22.04/24.04 or RHEL 9): 4 vCPU, 8 GB RAM, 100 GB SSD | ☐ |
| 2 | Docker Engine 24+ with the Compose plugin | ☐ |
| 3 | Internal DNS name, e.g. `cx360.premiumtrust.local` | ☐ |
| 4 | Certificate and key for that name (`server.crt`, `server.key`) from the bank CA | ☐ |
| 5 | NTP time sync on the server (SLA clocks depend on it) | ☐ |
| 6 | Backup destination on another machine (20 GB+ to start) | ☐ |
| 7 | Firewall: staff PCs → server 443. Server → Microsoft (`login.microsoftonline.com`, `graph.microsoft.com`) 443 | ☐ |
| 8 | Microsoft Entra app registration with `Mail.ReadWrite` and `Mail.Send`; Tenant ID, Client ID, secret, and the shared mailbox address | ☐ |
| 9 | Bank SMS gateway address, credentials and sender ID | ☐ |
| 10 | Core banking lookup API address and key (if live balances are wanted) | ☐ |
| 11 | Avaya: who will POST call logs to `/api/channels/voice`, and the screen-pop URL for agent PCs | ☐ |

## Only if WhatsApp, Instagram, Facebook or X are wanted

| # | Item | Done |
|---|---|---|
| 12 | Publish **only** `/api/channels/meta` and `/api/channels/x` on the internet-facing gateway/WAF and forward to the server | ☐ |
| 13 | Outbound 443 to `graph.facebook.com`, `api.x.com`, `x.com` | ☐ |
| 14 | Meta developer app and X developer app owned by the bank (owner: Service Monitoring & Quality) | ☐ |

## What we hand IT
The repository (with `deploy/`), `IT-REHEARSAL-GUIDE`, and the list of Netlify settings to copy into `.env.production`.

## Rehearsal outcome we need
All 20 smoke tests in the guide ticked, reboot test passed, backup and restore tested once, and a named person for each role in the guide.

## Never
Never expose the database port (5432) outside the server. Never put secrets in the database or in chat messages.
