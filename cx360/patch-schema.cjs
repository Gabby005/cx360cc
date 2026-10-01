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

fs.writeFileSync(path, s);
console.log(log.join("\n"));
console.log("\nschema.prisma updated. Next: npx prisma validate");
