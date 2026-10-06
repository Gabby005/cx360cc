// One-time helper: adds the new fields/indexes to prisma/schema.prisma IN PLACE,
// leaving everything else (e.g. your directUrl line) untouched. Safe to re-run.
//   node patch-schema.cjs
const fs = require("fs");
const path = "prisma/schema.prisma";
let s = fs.readFileSync(path, "utf8");
const log = [];

function block(kind, name) {
  const m = new RegExp(`^${kind} ${name} \\{[\\s\\S]*?^\\}`, "m").exec(s);
  if (!m) throw new Error(`Could not find ${kind} ${name} in schema.prisma`);
  return { text: m[0], start: m.index };
}
function edit(kind, name, label, already, fn) {
  const b = block(kind, name);
  if (already.test(b.text)) return log.push(`= ${label} (already there)`);
  const next = fn(b.text);
  if (next === b.text) throw new Error(`Could not apply: ${label}`);
  s = s.slice(0, b.start) + next + s.slice(b.start + b.text.length);
  log.push(`+ ${label}`);
}
const after = (re, add) => (t) => t.replace(re, (line) => `${line}\n${add}`);
const beforeClose = (add) => (t) => t.replace(/\n\}$/, `\n${add}\n}`);

edit("model", "Case", "Case.createdById", /createdById\s+String\?/,
  after(/^[ \t]*escalatedAt\s+DateTime\?.*$/m, "  createdById  String?    // who logged the case (null for API-created cases)"));
edit("model", "Case", "Case.createdBy relation", /createdBy\s+User\?/,
  after(/^[ \t]*assignedTo\s+User\?.*$/m, '  createdBy   User?         @relation("CaseCreator", fields: [createdById], references: [id])'));
edit("model", "Case", "Case indexes", /\[tenantId, createdById, createdAt\]/,
  beforeClose(["  @@index([tenantId, createdAt])", "  @@index([tenantId, createdById, createdAt])", "  @@index([tenantId, assignedToId, createdAt])", "  @@index([tenantId, escalatedUnitId, createdAt])"].join("\n")));
edit("model", "User", "User.createdCases", /createdCases\s+Case\[\]/,
  after(/^[ \t]*assignedCases\s+Case\[\].*$/m, '  createdCases      Case[]           @relation("CaseCreator")'));
edit("model", "Membership", "Membership.unit", /unitId\s+String\?/,
  after(/^[ \t]*teamId\s+String\?.*$/m, "  unit   Unit?  @relation(fields: [unitId], references: [id]) // the department this person works in\n  unitId String?"));
edit("model", "Unit", "Unit.members", /members\s+Membership\[\]/,
  after(/^[ \t]*cases\s+Case\[\].*$/m, "  members Membership[]"));
edit("model", "Tenant", "Tenant.customerSummaryFields", /customerSummaryFields\s+Json\?/,
  after(/^[ \t]*logoDataUrl\s+String\?.*$/m, "  customerSummaryFields Json? // [{key,label,sensitive}] extra core-banking fields shown on the customer summary card"));
edit("model", "AuditLog", "AuditLog index", /actorId, action, createdAt/,
  beforeClose("  @@index([tenantId, actorId, action, createdAt])"));

edit("model", "Case", "Case.slaLastFlag", /slaLastFlag\s+String\?/,
  after(/^[ \t]*slaPolicyId\s+String\?.*$/m, "  slaLastFlag   String?   // last SLA stage:level an event was emitted for, so sweeps never repeat events"));
edit("model", "AuditLog", "AuditLog date index", /@@index\(\[tenantId, createdAt\]\)/,
  beforeClose("  @@index([tenantId, createdAt])"));

edit("model", "Tenant", "Tenant.businessHours", /businessHours\s+Json\?/,
  after(/^[ \t]*customerSummaryFields\s+Json\?.*$/m, "  businessHours Json?     // {timezone, days:{mon..sun:{open,close}|null}, holidays:[{date,name}]} — when SLA clocks run"));

function ensureModel(name, text) {
  if (new RegExp(`^model ${name} \\{`, "m").test(s)) return log.push(`= model ${name} (already there)`);
  s = s.replace(/\s*$/, "\n\n") + text.trim() + "\n";
  log.push(`+ model ${name}`);
}

edit("model", "Tenant", "Tenant.notificationSettings", /notificationSettings\s+Json\?/,
  after(/^[ \t]*businessHours\s+Json\?.*$/m, "  notificationSettings Json? // {sla:{enabledSince,trigger,priorities,level1,level2}} — SLA escalation ladder"));
edit("model", "Tenant", "Tenant.notificationTemplates", /notificationTemplates\s+NotificationTemplate\[\]/,
  after(/^[ \t]*notificationLogs\s+NotificationLog\[\].*$/m, "  notificationTemplates NotificationTemplate[]"));
edit("model", "NotificationLog", "NotificationLog.kind/cc", /kind\s+String\?/,
  after(/^[ \t]*status\s+String\s+@default\("logged"\).*$/m, "  kind          String?  // template key, e.g. case.opened.email, sla.level1.email\n  cc            String?  // copied addresses, comma separated"));
edit("model", "NotificationLog", "NotificationLog case index", /\[tenantId, relatedCaseId\]/,
  beforeClose("  @@index([tenantId, relatedCaseId])"));
edit("model", "Case", "Case.slaBreachedAt/slaEscalationLevel", /slaEscalationLevel\s+Int/,
  after(/^[ \t]*slaLastFlag\s+String\?.*$/m, "  slaBreachedAt DateTime? // when the SLA was first exceeded\n  slaEscalationLevel Int @default(0) // 0 none, 1 manager one notified, 2 manager two notified"));
ensureModel("NotificationTemplate", `
model NotificationTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  key         String   // e.g. case.opened.email, sla.level1.email
  enabled     Boolean  @default(true)
  subject     String?
  body        String
  updatedAt   DateTime @updatedAt
  updatedById String?

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, key])
}`);

edit("model", "Tenant", "Tenant.deliverySettings", /deliverySettings\s+Json\?/,
  after(/^[ \t]*notificationSettings\s+Json\?.*$/m, "  deliverySettings Json? // how email/SMS reach the bank's own gateways (no secrets stored here)"));
edit("model", "NotificationLog", "NotificationLog delivery fields", /nextAttemptAt\s+DateTime\?/,
  after(/^[ \t]*cc\s+String\?.*$/m, "  attempts      Int      @default(0)\n  nextAttemptAt DateTime?\n  lockedUntil   DateTime?\n  lastError     String?\n  sentAt        DateTime?"));
edit("model", "NotificationLog", "NotificationLog queue index", /\[status, nextAttemptAt\]/,
  beforeClose("  @@index([status, nextAttemptAt])"));
ensureModel("ErrorLog", `
model ErrorLog {
  id          String   @id @default(cuid())
  tenantId    String?
  source      String   // server | client | job:<name>
  message     String
  stack       String?
  path        String?
  userId      String?
  count       Int      @default(1)
  fingerprint String   @unique
  resolved    Boolean  @default(false)
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @default(now())

  @@index([resolved, lastSeenAt])
}`);
ensureModel("JobRun", `
model JobRun {
  id         String    @id @default(cuid())
  job        String
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
  ok         Boolean   @default(false)
  summary    String?
  error      String?

  @@index([job, startedAt])
}`);

edit("model", "ApiKey", "ApiKey.scopes", /scopes\s+String\[\]/,
  after(/^[ \t]*revokedAt\s+DateTime\?.*$/m, '  scopes     String[] @default(["read", "write"]) // what the key may do: read, write'));
ensureModel("WebhookDelivery", `
model WebhookDelivery {
  id             String    @id @default(cuid())
  tenantId       String
  subscriptionId String
  eventId        String?
  type           String
  payload        Json
  status         String    @default("queued") // queued | sent | failed
  attempts       Int       @default(0)
  nextAttemptAt  DateTime?
  lockedUntil    DateTime?
  lastHttpStatus Int?
  lastError      String?
  createdAt      DateTime  @default(now())
  sentAt         DateTime?

  @@index([status, nextAttemptAt])
  @@index([tenantId, createdAt])
  @@index([subscriptionId, createdAt])
}`);

edit("model", "Tenant", "Tenant.coreBankingSettings", /coreBankingSettings\s+Json\?/,
  after(/^[ \t]*deliverySettings\s+Json\?.*$/m, "  coreBankingSettings Json? // live core banking lookups (endpoints + field mapping; no secrets, no customer data)"));

edit("model", "Tenant", "Tenant.channelSettings", /channelSettings\s+Json\?/,
  after(/^[ \t]*coreBankingSettings\s+Json\?.*$/m, "  channelSettings Json? // inbound channels: mailbox polling, WhatsApp number (no secrets)"));
edit("model", "Interaction", "Interaction.externalId/contact/subject", /externalId\s+String\?/,
  after(/^[ \t]*caseId\s+String\?.*$/m, "  externalId  String?           // provider message id, so a re-delivered message is stored once\n  contact     String?           // the email address / phone number on the customer's side\n  subject     String?           // email subject"));
edit("model", "Interaction", "Interaction channel unique + case index", /\[tenantId, channel, externalId\]/,
  beforeClose("  @@unique([tenantId, channel, externalId])\n  @@index([tenantId, caseId])"));

edit("enum", "Channel", "Channel.INSTAGRAM/MESSENGER", /INSTAGRAM/,
  beforeClose("  INSTAGRAM\n  MESSENGER"));


// ---- Go-live hardening + X (Twitter) ----
edit("model", "User", "User login protection fields", /failedLogins\s+Int/,
  after(/^[ \t]*createdAt\s+DateTime\s+@default\(now\(\)\)\s*$/m, "  failedLogins       Int      @default(0) // wrong passwords in a row; resets on a good login\n  lockedUntil        DateTime? // sign-in blocked until this time after too many wrong passwords\n  mustChangePassword Boolean  @default(false) // set for new accounts and admin resets\n  passwordChangedAt  DateTime?"));
edit("enum", "Channel", "Channel.X", /^\s*X\s*$/m,
  beforeClose("  X"));
edit("model", "Tenant", "Tenant.channelTokens", /channelTokens\s+ChannelToken\[\]/,
  after(/^[ \t]*channelSettings\s+Json\?.*$/m, "  channelTokens ChannelToken[]"));
ensureModel("ChannelToken", `
model ChannelToken {
  id        String   @id @default(cuid())
  tenantId  String
  provider  String   // "x"
  data      String   // encrypted sign-in tokens (AES-256-GCM, key in CX360_TOKEN_KEY)
  expiresAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, provider])
}`);

// ---- Speed indexes ----
edit("model", "Interaction", "Interaction speed indexes", /@@index\(\[tenantId, direction, status, createdAt\]\)/,
  beforeClose("  @@index([tenantId, direction, status, createdAt])\n  @@index([tenantId, customerId, createdAt])"));

fs.writeFileSync(path, s);
console.log(log.join("\n"));
console.log("\nschema.prisma updated. Next: npx prisma validate");
