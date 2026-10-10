---
title: "CX360 — User Manual"
subtitle: "For agents, supervisors and administrators"
---

# 1. What CX360 is

CX360 is the bank's contact-centre system. Every customer message (phone, WhatsApp, email, SMS, Instagram, Messenger, X) lands in one **Inbox**. You answer it, turn it into a **case** when it needs follow-up, and CX360 tracks the time limit (SLA) until it is closed.

| Role | Can do |
|---|---|
| **Agent** | Work the Inbox, log and update cases, view customers |
| **Supervisor** | Everything an Agent does, plus see all cases, export, batch close, quality reviews, Analytics |
| **Super Admin** | Everything, plus users, settings, channels, integrations, audit log, system health |
| **Read only** | View only |

You only see the menu items your role allows.

# 2. Signing in

1. Open the CX360 address given by IT and enter your email and password.
2. **First time:** you must choose a new password. It needs at least 10 characters with a letter and a number, and not a common password such as `password1`.
3. **Wrong password 5 times** pauses the account for 15 minutes. Wait, or ask an administrator.
4. **Forgot your password?** Ask an administrator to reset it (Admin → Users). You will get a temporary one and must change it at next sign-in.

To change your password any time, use the account menu → Change password.

# 3. The screens

| Screen | Use it to |
|---|---|
| **Overview** | See today at a glance: KPI tiles, one tile per channel, cases needing attention, missed calls to return, latest activity. Refreshes every minute. |
| **Inbox** | Read and answer customer messages from every channel |
| **Agent workspace** | Your own work list: cases assigned to you and what is due |
| **Cases** | Find, log and manage cases |
| **Customers** | Search a customer and see their full history |
| **My performance** | Your own numbers |
| **Knowledge base** | Approved answers and procedures |
| **Workflows** | (Super Admin) Automatic rules |
| **Analytics** | (Supervisor and above) Charts and reports, including a Channels section |
| **Admin** | (Super Admin) Settings |

# 4. Daily work for agents

## 4.1 Answering the Inbox

1. Open **Inbox**. The tiles at the top filter by channel (Phone, WhatsApp, Email, SMS, Instagram, Messenger, X). Use search and the sort button to find messages.
2. Click a message. The customer card shows who they are and their history.
3. Type your reply and send. Then choose what happens next:
   - **Convert to case** if it needs follow-up.
   - **Close without case** if the reply fully answers it.

**Flags, colours and read / unread**

| Tool | What it does |
|---|---|
| **Unread dot and bold name** | A new message is unread until someone opens it. Opening it marks it read. |
| **Mark unread / Mark read** | Button above the message (or press `u`). Use it to remind yourself or the team to come back to it. |
| **Flag** | Priority: Urgent (red), High (orange), Low (grey). Choose "Priority first" in the sort list to put urgent messages on top. Press `f` to cycle the flag. |
| **Team code** | Tag a message with a team (Team A, Team B and so on). Each team has its own colour, shown as a stripe on the left and a small label. Hover over a message in the list and use the buttons that appear on its right: tag a team, flag it, or mark it read or unread. This does not open the message, so it stays unread. Pick a team from the "All teams" list to see only that team's messages. Supervisors and admins can add, rename, recolour or remove teams with **Manage teams** in the team menu. |
| **Assign to me** | Marks you as the person handling it. The **Mine** tab lists your messages. |
| **Close without a case** | The message stays in the Inbox under **Closed** (and **All**). It is marked read. Open it and press **Reopen as unread** to bring it back to the queue. |
| **Select several** | Tick the boxes to the left of messages, then mark read or unread, flag, colour, assign to you or close them all at once. |

The tabs at the top of the list are **Open**, **Unread**, **Read**, **Flagged**, **Mine**, **Closed** and **All**. Read state is shared by the whole team: if one person opens a message, it shows as read for everyone. Other shortcuts: `j` next message, `k` previous. The list refreshes itself every 45 seconds. Closed and linked messages are kept in view for 30 days.

**Reply rules by channel**

| Channel | Rule |
|---|---|
| WhatsApp, Instagram, Messenger | You can reply only within **24 hours** of the customer's last message. After that CX360 tells you the window is closed. |
| X | Replies are sent; each one may carry a small cost, so keep them short. |
| Email, SMS | Sent normally. |
| Phone, chat, portal | Notes only. Nothing is sent to the customer. |

If a reply fails, the reason is shown on the screen. Try again or contact your supervisor.

## 4.2 Phone calls

- **Screen-pop:** when you answer a call, CX360 opens the caller's page automatically (if known), showing their history.
- **Missed calls:** these appear in the Inbox under Phone and on the Overview in "Missed calls to return". Press **Call back**. A call counts as handled once someone calls back or follows up on another channel.
- **After a call:** log a case if there is anything to follow up.

## 4.3 Logging a case

1. Cases → **Log a case**.
2. Find the customer (phone, name or account) or add one.
3. Choose the **case code** (category) and describe the issue. Priority and SLA are set from the code.
4. Save. A case number is issued and the SLA clock starts.

## 4.4 Working a case

| Status | Meaning |
|---|---|
| New | Just logged |
| Open / In progress | Being worked |
| Pending with Bank unit / 3rd party | Waiting on someone else. **Choose the unit** so it can be chased. |
| Resolved | Fixed, awaiting confirmation |
| Closed | Finished |

- Add **comments** (internal notes) and **attachments** in the case timeline.
- **Reuse this ticket** (on a closed ticket) creates a new ticket with a new ticket number, copied from the closed one: same customer, subject, type, priority, case code and description. Both tickets get a note linking to each other.
- **SLA colours:** green on track, amber close to the limit, red breached. Work red first.

## 4.5 The customer page

Shows profile, cases, all messages across channels, accounts, feedback, and a **live core-banking card** with balance and recent transactions (when connected). Use it to verify and answer without switching systems.

# 5. Supervisors

- **Cases:** tabs show scopes (for example mine, my team, all, overdue). Use filters for status, priority, date, agent.
- **Export:** download to Excel, up to 92 days at a time.
- **Batch close:** tick several cases and close them together.
- **Quality review:** open a case → QA panel → score it and leave coaching notes for the agent.
- **Analytics:** volume, SLA, resolution time, agent results, and the **Channels** section: volume per channel, average response time per channel, and missed calls nobody returned.

# 6. Administrators

All under **Admin**.

| Setting | What it does |
|---|---|
| **Users & roles** | Add users (temporary password shown once), change roles, deactivate, reset password |
| **Departments** | Teams and units |
| **Case codes** | Categories, default priority and SLA |
| **SLA policies** | Time limits per priority |
| **Business hours** | Working hours and holidays for SLA counting |
| **SLA escalation** | Who is alerted at what point |
| **Notification centre** | Email and SMS gateways, message templates, tests |
| **Core banking** | Connects live balance and transactions |
| **Channels** | Email mailbox, SMS replies, Avaya, WhatsApp/Instagram/Messenger, X. Shows which secrets are set |
| **Integration hub** | API keys and webhooks for other bank systems |
| **Audit log** | Who did what and when |
| **System health** | Job status, queue, errors, **Speed check**, and the **Before going live** list |
| **Branding** | Logo and colours |
| **Customer summary fields** | Which details appear on the customer card |

**Good habits:** keep two administrators; remove or reset demo accounts; check System health daily; never share passwords.

# 7. Questions and fixes

| Problem | What to do |
|---|---|
| Page feels slow | Tell an administrator; they check System health → Speed check |
| Can't reply on WhatsApp | The 24-hour window has closed; use another channel or SMS |
| Customer not found | Search by phone without the leading 0 or +234, then add as new |
| Missing menu item | Your role does not include it; ask an administrator |
| Email/SMS not sent | Administrator checks Notification centre → Delivery → Test |
| Missed call not showing | Avaya call-log link may be down; tell an administrator |
| Locked out | Wait 15 minutes or ask for a reset |

# 8. Glossary

**Case** – a tracked piece of work for a customer. **SLA** – the time limit to resolve it. **Channel** – the way a customer reaches us. **Screen-pop** – caller's page opening automatically. **Webhook** – an automatic message between systems. **Case code** – the category of a case.

# 9. One-page quick reference

1. Sign in → check **Overview**.
2. **Inbox** → reply → Convert to case *or* Close.
3. Missed call? **Call back**.
4. Case: set status, add comment, pick the unit if pending.
5. Red SLA first.
6. End of day: nothing left in Inbox, no red cases unassigned.
