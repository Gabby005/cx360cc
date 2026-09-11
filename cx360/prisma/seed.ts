import { PrismaClient, Priority } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding CX360 demo data…");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-bank" },
    update: {},
    create: { name: "Demo Bank plc", slug: "demo-bank" },
  });

  const passwordHash = await bcrypt.hash("demo1234", 10);

  const [admin, supervisor, agent1, agent2] = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@demobank.cx360" },
      update: {},
      create: { email: "admin@demobank.cx360", name: "Ada Admin", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "supervisor@demobank.cx360" },
      update: {},
      create: { email: "supervisor@demobank.cx360", name: "Sam Supervisor", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "agent@demobank.cx360" },
      update: {},
      create: { email: "agent@demobank.cx360", name: "Amara Agent", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "agent2@demobank.cx360" },
      update: {},
      create: { email: "agent2@demobank.cx360", name: "Femi Agent", passwordHash },
    }),
  ]);

  for (const [user, role] of [
    [admin, "ADMIN"],
    [supervisor, "SUPERVISOR"],
    [agent1, "AGENT"],
    [agent2, "AGENT"],
  ] as const) {
    await prisma.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: {},
      create: { userId: user.id, tenantId: tenant.id, role },
    });
  }

  // SLA policies per the brief's worked example.
  const slaConfig: { priority: Priority; responseMinutes: number; resolutionMinutes: number }[] = [
    { priority: "CRITICAL", responseMinutes: 15, resolutionMinutes: 120 },
    { priority: "HIGH", responseMinutes: 30, resolutionMinutes: 240 },
    { priority: "MEDIUM", responseMinutes: 60, resolutionMinutes: 480 },
    { priority: "LOW", responseMinutes: 240, resolutionMinutes: 1440 },
  ];
  const policies: Record<string, string> = {};
  for (const cfg of slaConfig) {
    const p = await prisma.slaPolicy.upsert({
      where: { tenantId_priority: { tenantId: tenant.id, priority: cfg.priority } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: `${cfg.priority} SLA`,
        priority: cfg.priority,
        responseMinutes: cfg.responseMinutes,
        resolutionMinutes: cfg.resolutionMinutes,
        warningThresholdPct: 80,
        escalationThresholdPct: 90,
      },
    });
    policies[cfg.priority] = p.id;
  }

  const queue = await prisma.queue.upsert({
    where: { id: "seed-general-queue" },
    update: {},
    create: { id: "seed-general-queue", tenantId: tenant.id, name: "General Support" },
  });

  // Customers
  const customerSeed = [
    { firstName: "Ngozi", lastName: "Okafor", email: "ngozi.okafor@example.com", phone: "+2348012345001", segment: "Premier", sentimentAvg: -0.4 },
    { firstName: "Tunde", lastName: "Bakare", email: "tunde.bakare@example.com", phone: "+2348012345002", segment: "Retail", sentimentAvg: 0.3 },
    { firstName: "Chioma", lastName: "Eze", email: "chioma.eze@example.com", phone: "+2348012345003", segment: "SME", sentimentAvg: 0.1 },
    { firstName: "Ibrahim", lastName: "Suleiman", email: "ibrahim.suleiman@example.com", phone: "+2348012345004", segment: "Retail", sentimentAvg: -0.1 },
    { firstName: "Grace", lastName: "Adeyemi", email: "grace.adeyemi@example.com", phone: "+2348012345005", segment: "Premier", sentimentAvg: 0.5 },
  ];

  const customers = [];
  for (const c of customerSeed) {
    const existing = await prisma.customer.findFirst({ where: { tenantId: tenant.id, email: c.email } });
    const customer =
      existing ??
      (await prisma.customer.create({ data: { ...c, tenantId: tenant.id } }));
    customers.push(customer);

    await prisma.customerProduct.create({
      data: {
        customerId: customer.id,
        productName: "Everyday Current Account",
        accountRef: `ACC-${customer.id.slice(-6).toUpperCase()}`,
        status: "active",
      },
    });
  }

  // Approved category/subcategory codes — the taxonomy Admin manages in
  // /admin/case-codes. A handful per type so the demo isn't empty.
  const caseCodeSeed = [
    { type: "COMPLAINT" as const, code: "E0006", category: "ATM/POS", subcategory: "Dispensed less cash" },
    { type: "COMPLAINT" as const, code: "E0012", category: "Card Disputes", subcategory: "Unauthorized transaction" },
    { type: "COMPLAINT" as const, code: "E0021", category: "Branch Service", subcategory: "Excessive wait time" },
    { type: "SERVICE_REQUEST" as const, code: "R0003", category: "Digital Banking", subcategory: "PIN reset" },
    { type: "SERVICE_REQUEST" as const, code: "R0009", category: "Statements", subcategory: "Statement request" },
    { type: "INQUIRY" as const, code: "Q0002", category: "Lending", subcategory: "Loan eligibility" },
  ];
  const caseCodeByKey = new Map<string, { id: string; code: string }>(); // "TYPE:category" -> case code, for wiring seeded cases below
  for (const cc of caseCodeSeed) {
    const existing = await prisma.caseCode.findFirst({ where: { tenantId: tenant.id, code: cc.code } });
    const created = existing ?? (await prisma.caseCode.create({ data: { ...cc, tenantId: tenant.id } }));
    caseCodeByKey.set(`${cc.type}:${cc.category}`, { id: created.id, code: created.code });
  }

  const TYPE_CODE: Record<string, string> = {
    COMPLAINT: "COM",
    SERVICE_REQUEST: "REQ",
    INQUIRY: "ENQ",
    INCIDENT: "INC",
  };

  // Departments transactional cases can be escalated to — Admin manages
  // this in /admin/units (upload or one at a time).
  const unitSeed = [
    { name: "Fraud Team", email: "fraud@demobank.cx360" },
    { name: "Card Operations", email: "cardops@demobank.cx360" },
    { name: "Digital Banking", email: "digital@demobank.cx360" },
  ];
  for (const u of unitSeed) {
    const existing = await prisma.unit.findFirst({ where: { tenantId: tenant.id, email: u.email } });
    if (!existing) {
      await prisma.unit.create({ data: { ...u, tenantId: tenant.id } });
    }
  }

  // Cases with SLA clocks at varying elapsed states (some past due, to
  // demonstrate the SLA badge in warning/breach states out of the box).
  const now = Date.now();
  const caseSeed = [
    { customer: customers[0], subject: "Disputed card transaction — ₦45,000", type: "COMPLAINT", priority: "CRITICAL", status: "OPEN", ageMinutes: 25, category: "Card Disputes", isTransactional: true, transactionAmount: 45000, transactionCurrency: "NGN", unitEmail: "cardops@demobank.cx360" },
    { customer: customers[1], subject: "Unable to reset internet banking PIN", type: "SERVICE_REQUEST", priority: "HIGH", status: "NEW", ageMinutes: 40, category: "Digital Banking", isTransactional: false, transactionAmount: null, transactionCurrency: null, unitEmail: null },
    { customer: customers[2], subject: "Request for statement — last 6 months", type: "SERVICE_REQUEST", priority: "LOW", status: "OPEN", ageMinutes: 200, category: "Statements", isTransactional: false, transactionAmount: null, transactionCurrency: null, unitEmail: null },
    { customer: customers[3], subject: "Complaint: branch wait time exceeded 1hr", type: "COMPLAINT", priority: "MEDIUM", status: "PENDING_CUSTOMER", ageMinutes: 300, category: "Branch Service", isTransactional: false, transactionAmount: null, transactionCurrency: null, unitEmail: null },
    { customer: customers[4], subject: "Loan top-up eligibility enquiry", type: "INQUIRY", priority: "LOW", status: "NEW", ageMinutes: 10, category: "Lending", isTransactional: false, transactionAmount: null, transactionCurrency: null, unitEmail: null },
    { customer: customers[0], subject: "Fraud alert — SIM swap suspected", type: "INCIDENT", priority: "CRITICAL", status: "ESCALATED", ageMinutes: 130, category: "Fraud", isTransactional: false, transactionAmount: null, transactionCurrency: null, unitEmail: null },
  ] as const;

  for (const c of caseSeed) {
    const createdAt = new Date(now - c.ageMinutes * 60_000);
    const existing = await prisma.case.findFirst({ where: { tenantId: tenant.id, subject: c.subject, customerId: c.customer.id } });

    let kase = existing;
    if (!kase) {
      const caseCodeEntry = caseCodeByKey.get(`${c.type}:${c.category}`);
      const unit = c.unitEmail ? await prisma.unit.findFirst({ where: { tenantId: tenant.id, email: c.unitEmail } }) : null;
      // Bump the tenant's case sequence and use it for this seeded case's
      // number, so numbers generated later by the real createCase() service
      // (used by the app itself) continue from here without colliding.
      const updatedTenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: { caseSequence: { increment: 1 } },
      });
      const codeSegment = caseCodeEntry?.code ?? "GEN";
      const caseNumber = `${updatedTenant.caseNumberPrefix}/${TYPE_CODE[c.type]}/${codeSegment}/${String(updatedTenant.caseSequence).padStart(6, "0")}`;

      kase = await prisma.case.create({
        data: {
          tenantId: tenant.id,
          caseNumber,
          customerId: c.customer.id,
          subject: c.subject,
          description: `Seed data: ${c.subject}`,
          type: c.type,
          priority: c.priority,
          status: c.status,
          category: c.category,
          caseCodeId: caseCodeEntry?.id,
          isTransactional: c.isTransactional,
          transactionAmount: c.transactionAmount ?? undefined,
          transactionCurrency: c.transactionCurrency ?? undefined,
          escalatedUnitId: unit?.id,
          escalatedAt: unit ? createdAt : undefined,
          queueId: queue.id,
          slaPolicyId: policies[c.priority],
          assignedToId: [agent1.id, agent2.id][Math.floor(Math.random() * 2)],
          createdAt,
          updatedAt: createdAt,
        },
      });
    }

    await prisma.interaction.create({
      data: {
        tenantId: tenant.id,
        customerId: c.customer.id,
        caseId: kase.id,
        agentId: kase.assignedToId,
        channel: ["VOICE", "EMAIL", "WHATSAPP", "CHAT"][Math.floor(Math.random() * 4)] as any,
        direction: "inbound",
        summary: `Customer contacted regarding: ${c.subject}`,
        sentiment: c.customer.sentimentAvg,
        durationSec: 240,
        createdAt,
      },
    });
  }

  // Knowledge articles
  const articleSeed = [
    { title: "How to process a disputed card transaction", category: "Card Disputes" },
    { title: "Resetting a customer's internet banking PIN", category: "Digital Banking" },
    { title: "Fraud escalation checklist (SIM swap / account takeover)", category: "Fraud" },
  ];
  for (const a of articleSeed) {
    const existing = await prisma.knowledgeArticle.findFirst({ where: { tenantId: tenant.id, title: a.title } });
    if (!existing) {
      await prisma.knowledgeArticle.create({
        data: { tenantId: tenant.id, title: a.title, category: a.category, body: "Full article content goes here.", status: "PUBLISHED" },
      });
    }
  }

  // Sample workflow rules demonstrating the execution engine.
  const existingRule = await prisma.workflowRule.findFirst({ where: { tenantId: tenant.id, name: "Auto-escalate CRITICAL complaints" } });
  if (!existingRule) {
    await prisma.workflowRule.create({
      data: {
        tenantId: tenant.id,
        name: "Auto-escalate CRITICAL complaints",
        triggerType: "case.created",
        conditions: [
          { field: "priority", operator: "equals", value: "CRITICAL" },
          { field: "caseType", operator: "equals", value: "COMPLAINT" },
        ],
        actions: [
          { type: "set_status", params: { status: "ESCALATED" } },
          { type: "notify", params: { channel: "slack", target: "#cx-critical" } },
        ],
        enabled: true,
      },
    });
  }

  const existingSlaRule = await prisma.workflowRule.findFirst({ where: { tenantId: tenant.id, name: "Reassign on SLA breach" } });
  if (!existingSlaRule) {
    await prisma.workflowRule.create({
      data: {
        tenantId: tenant.id,
        name: "Reassign on SLA breach",
        triggerType: "sla.breached",
        conditions: [],
        actions: [
          { type: "assign_case", params: { strategy: "least_open_cases" } },
          { type: "add_case_note", params: { body: "Reassigned automatically after SLA breach.", internal: true } },
        ],
        enabled: true,
      },
    });
  }

  // Standalone inbox items — inbound messages that haven't been triaged
  // into a case yet, so the Inbox queue has something to show immediately.
  const inboxSeed = [
    { customer: customers[1], channel: "WHATSAPP", summary: "Hi, I was charged twice for the same transfer today, can someone check?", status: "NEW" },
    { customer: customers[2], channel: "EMAIL", summary: "Requesting a callback regarding my SME loan application status.", status: "NEW" },
    { customer: customers[4], channel: "CHAT", summary: "Is the mobile app down? I can't log in since this morning.", status: "IN_PROGRESS" },
  ] as const;

  for (const i of inboxSeed) {
    const existing = await prisma.interaction.findFirst({
      where: { tenantId: tenant.id, customerId: i.customer.id, summary: i.summary },
    });
    if (!existing) {
      await prisma.interaction.create({
        data: {
          tenantId: tenant.id,
          customerId: i.customer.id,
          channel: i.channel,
          direction: "inbound",
          status: i.status,
          summary: i.summary,
          agentId: i.status === "IN_PROGRESS" ? agent1.id : null,
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log("Login with: agent@demobank.cx360 / demo1234 (or supervisor@ / admin@)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
