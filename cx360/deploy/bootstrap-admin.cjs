/**
 * Creates a brand-new organisation with its first administrator (no demo data).
 *   docker compose --env-file .env.production run --rm migrate \
 *     node deploy/bootstrap-admin.cjs --org "PremiumTrust Bank" --slug premiumtrust --email you@bank.com --name "Your Name"
 * Prints a one-time temporary password; the person must choose their own at first sign-in.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const org = arg("org"), slug = arg("slug"), email = (arg("email") || "").trim().toLowerCase(), name = arg("name");
if (!org || !slug || !email || !name || !/^[a-z0-9-]+$/.test(slug) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: node deploy/bootstrap-admin.cjs --org "Bank name" --slug bank-slug --email admin@bank.com --name "Full Name"');
  process.exit(1);
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.upsert({ where: { slug }, update: {}, create: { name: org, slug } });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) { console.error(`A user with ${email} already exists.`); process.exit(1); }

    const bytes = crypto.randomBytes(9).toString("hex");
    const temp = `${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}`;
    const user = await prisma.user.create({ data: { email, name, passwordHash: await bcrypt.hash(temp, 10), mustChangePassword: true } });
    await prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: "ADMIN" } });

    // Starting service-level targets (change them any time in Workflows / Admin).
    for (const [priority, responseMinutes, resolutionMinutes] of [["CRITICAL", 15, 120], ["HIGH", 30, 240], ["MEDIUM", 60, 480], ["LOW", 240, 1440]]) {
      await prisma.slaPolicy.upsert({
        where: { tenantId_priority: { tenantId: tenant.id, priority } },
        update: {},
        create: { tenantId: tenant.id, name: `${priority} SLA`, priority, responseMinutes, resolutionMinutes, warningThresholdPct: 80, escalationThresholdPct: 90 },
      });
    }
    const q = await prisma.queue.findFirst({ where: { tenantId: tenant.id } });
    if (!q) await prisma.queue.create({ data: { tenantId: tenant.id, name: "General Support" } });

    console.log(`\nOrganisation: ${org}  (slug: ${slug})\nAdministrator: ${email}\nTemporary password (shown once): ${temp}\n`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
