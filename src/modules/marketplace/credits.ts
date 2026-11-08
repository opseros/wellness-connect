// Wellness credits: prepaid monthly allowances that employees spend on Moosam.
// See the money model and ledger conventions in src/db/schema/credits.ts.
//
// Rules:
// - Only owners, admins and wellness managers set the policy and see funding.
// - HR sees totals only. A category's total is shown only when at least
//   MIN_PEOPLE different employees used it, so no one person can be singled out.
// - Credits can be spent only when the current month is paid, the category is
//   covered, and both the employee's allowance and the company's pool cover
//   the whole price (no split payments until card payments go live).
// - Every spend and refund has an idempotency key; credit_entry is append-only.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { benefitPolicy, creditEntry, creditFunding, financeSettings, organization } from "@/db/schema";
import { getDb, withScope, type Executor, type Tx } from "@/db/client";
import { AppError, assertUuid, badRequest, forbidden, notFound } from "@/lib/errors";
import { enqueue } from "@/modules/platform/outbox";
import { ORG_BUYERS, assertCompanyOrg, countActiveMembers, isActiveCompanyMember, listMemberships, requireOrgRole } from "@/modules/organizations/service";
import { getSession, listProSessions, markSessionPaid } from "@/modules/sessions/service";
import { getFinanceSettings } from "./payments";
import { facilityMembers, planForPurchase, recordPlanPurchase } from "@/modules/listings/plans";

export const MIN_PEOPLE = 3;
export type CreditCategory = "sessions" | "facilities" | "stays";
export const CATEGORY_LABEL: Record<CreditCategory, string> = {
  sessions: "Wellness professionals",
  facilities: "Gyms, studios and wellness centres",
  stays: "Homestays",
};

/** "YYYY-MM" in India. */
export function creditPeriod(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}
export function periodLabel(p: string) {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${p}-01T00:00:00Z`));
}

export function splitFee(amountPaise: number, feeBps: number) {
  const feePaise = Math.round((amountPaise * feeBps) / 10_000);
  return { feePaise, payablePaise: amountPaise - feePaise };
}

async function memberFeeBps(db: Executor) {
  const s = await db.query.financeSettings.findFirst({ where: eq(financeSettings.id, "default") });
  return s?.memberFeeBps ?? 500;
}

// ---------- Company: policy ----------

export const policyInput = z.object({
  active: z.coerce.boolean().default(false),
  allowanceRupees: z.coerce.number().int("Use whole rupees").min(0).max(100_000, "Keep the allowance at ₹1,00,000 or less"),
  coverSessions: z.coerce.boolean().default(false),
  coverFacilities: z.coerce.boolean().default(false),
  coverStays: z.coerce.boolean().default(false),
  partnersOnly: z.coerce.boolean().default(false),
});

export async function savePolicy(userId: string, orgId: string, input: z.input<typeof policyInput>) {
  const d = policyInput.parse(input);
  if (d.active && d.allowanceRupees === 0) throw badRequest("Set a monthly allowance before switching credits on");
  if (d.active && !d.coverSessions && !d.coverFacilities && !d.coverStays) throw badRequest("Pick at least one thing credits can be spent on");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    await assertCompanyOrg(orgId, tx);
    const values = {
      active: d.active,
      allowancePaise: d.allowanceRupees * 100,
      coverSessions: d.coverSessions,
      coverFacilities: d.coverFacilities,
      coverStays: d.coverStays,
      partnersOnly: d.partnersOnly,
      updatedBy: userId,
      updatedAt: new Date(),
    };
    const [row] = await tx.insert(benefitPolicy).values({ orgId, ...values }).onConflictDoUpdate({ target: benefitPolicy.orgId, set: values }).returning();
    if (row.active) await ensureFunding(tx, orgId);
    return row;
  });
}

// ---------- Funding (prepaid, monthly) ----------

async function poolBalance(tx: Executor, orgId: string) {
  const [r] = await tx
    .select({
      b: sql<number>`coalesce(sum(case ${creditEntry.type} when 'fund' then ${creditEntry.amountPaise} when 'refund' then ${creditEntry.amountPaise} else -${creditEntry.amountPaise} end), 0)::int`,
    })
    .from(creditEntry)
    .where(eq(creditEntry.orgId, orgId));
  return r.b;
}

/**
 * Make sure this month's prepayment request exists: seats × allowance, less
 * what is still unspent in the pool. If the pool already covers it, the
 * month counts as paid straight away.
 */
export async function ensureFunding(tx: Tx, orgId: string, period = creditPeriod()) {
  const existing = await tx.query.creditFunding.findFirst({ where: and(eq(creditFunding.orgId, orgId), eq(creditFunding.period, period)) });
  if (existing) return existing;
  const policy = await tx.query.benefitPolicy.findFirst({ where: eq(benefitPolicy.orgId, orgId) });
  if (!policy?.active || policy.allowancePaise === 0) return null;
  const seats = await countActiveMembers(orgId, tx);
  const requiredPaise = seats * policy.allowancePaise;
  const carriedPaise = Math.min(requiredPaise, Math.max(0, await poolBalance(tx, orgId)));
  const duePaise = requiredPaise - carriedPaise;
  const [row] = await tx
    .insert(creditFunding)
    .values({ orgId, period, seats, allowancePaise: policy.allowancePaise, requiredPaise, carriedPaise, duePaise, status: duePaise === 0 ? "paid" : "due", paidAt: duePaise === 0 ? new Date() : null, method: duePaise === 0 ? "carried" : null })
    .onConflictDoNothing()
    .returning();
  if (row?.status === "due") await enqueue(tx, { type: "credits.funding_due", payload: { fundingId: row.id, orgId } });
  return row ?? (await tx.query.creditFunding.findFirst({ where: and(eq(creditFunding.orgId, orgId), eq(creditFunding.period, period)) }))!;
}

export const fundingPaymentInput = z.object({
  method: z.enum(["bank_transfer", "razorpay"]).default("bank_transfer"),
  reference: z.string().trim().min(4, "Add the bank or payment reference").max(80),
});

/** Record a company's prepayment (staff, after the money arrived; or a verified webhook). `tx` must bypass RLS. */
export async function recordFundingPayment(tx: Tx, fundingId: string, staffId: string | null, input: z.input<typeof fundingPaymentInput>) {
  assertUuid(fundingId, "Payment request");
  const d = fundingPaymentInput.parse(input);
  const f = await tx.query.creditFunding.findFirst({ where: eq(creditFunding.id, fundingId) });
  if (!f) throw notFound("Payment request not found");
  if (f.status !== "due") throw badRequest("This month is already paid or cancelled");
  await tx.insert(creditEntry).values({ orgId: f.orgId, userId: null, period: f.period, type: "fund", amountPaise: f.duePaise, fundingId: f.id, idempotencyKey: `fund:${f.id}` });
  const [row] = await tx
    .update(creditFunding)
    .set({ status: "paid", method: d.method, reference: d.reference, recordedBy: staffId, paidAt: new Date() })
    .where(eq(creditFunding.id, f.id))
    .returning();
  await enqueue(tx, { type: "credits.funded", payload: { fundingId: f.id, orgId: f.orgId } });
  return row;
}

/** Funding requests waiting for money, for the admin queue. `db` must bypass RLS. */
export async function dueFundings(db: Executor) {
  return db
    .select({ f: creditFunding, orgName: organization.name })
    .from(creditFunding)
    .innerJoin(organization, eq(organization.id, creditFunding.orgId))
    .where(eq(creditFunding.status, "due"))
    .orderBy(creditFunding.createdAt);
}

// ---------- Company: overview (totals only) ----------

export async function companyCredits(userId: string, orgId: string, period = creditPeriod()) {
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const policy = (await tx.query.benefitPolicy.findFirst({ where: eq(benefitPolicy.orgId, orgId) })) ?? null;
    const current = policy?.active ? await ensureFunding(tx, orgId, period) : await tx.query.creditFunding.findFirst({ where: and(eq(creditFunding.orgId, orgId), eq(creditFunding.period, period)) });
    const history = await tx.select().from(creditFunding).where(eq(creditFunding.orgId, orgId)).orderBy(desc(creditFunding.period)).limit(12);
    // Net spend per person and category this month (refunds cancel spends). Only aggregates leave this function.
    const perPerson = await tx
      .select({
        category: creditEntry.category,
        userId: creditEntry.userId,
        net: sql<number>`sum(case ${creditEntry.type} when 'spend' then ${creditEntry.amountPaise} else -${creditEntry.amountPaise} end)::int`,
      })
      .from(creditEntry)
      .where(and(eq(creditEntry.orgId, orgId), eq(creditEntry.period, period), inArray(creditEntry.type, ["spend", "refund"])))
      .groupBy(creditEntry.category, creditEntry.userId);
    const spenders = perPerson.filter((r) => r.net > 0);
    const byCat = (["sessions", "facilities", "stays"] as const).map((c) => {
      const rows = spenders.filter((r) => r.category === c);
      return { category: c, net: rows.reduce((a, r) => a + r.net, 0), people: rows.length };
    });
    const people = { n: new Set(spenders.map((r) => r.userId)).size };
    const usedPaise = byCat.reduce((a, r) => a + r.net, 0);
    const categories = (["sessions", "facilities", "stays"] as const).map((c) => {
      const r = byCat.find((x) => x.category === c);
      return { category: c, label: CATEGORY_LABEL[c], people: r?.people ?? 0, netPaise: r && r.people >= MIN_PEOPLE ? r.net : null };
    });
    const fin = await getFinanceSettings(tx);
    return {
      bankDetails: fin.bankDetails,
      feeBps: fin.memberFeeBps,
      policy,
      current: current ?? null,
      history,
      period,
      poolPaise: await poolBalance(tx, orgId),
      usedPaise,
      activePeople: people.n,
      categories,
    };
  });
}

// ---------- Employees: wallets ----------

export type Wallet = {
  orgId: string;
  orgName: string;
  period: string;
  allowancePaise: number;
  usedPaise: number;
  availablePaise: number;
  funded: boolean;
  covers: Record<CreditCategory, boolean>;
  partnersOnly: boolean;
};

async function walletIn(tx: Tx, userId: string, orgId: string, orgName: string, period: string): Promise<Wallet | null> {
  const policy = await tx.query.benefitPolicy.findFirst({ where: eq(benefitPolicy.orgId, orgId) });
  if (!policy?.active) return null;
  const funding = await ensureFunding(tx, orgId, period);
  const [mine] = await tx
    .select({ net: sql<number>`coalesce(sum(case ${creditEntry.type} when 'spend' then ${creditEntry.amountPaise} when 'refund' then -${creditEntry.amountPaise} else 0 end), 0)::int` })
    .from(creditEntry)
    .where(and(eq(creditEntry.orgId, orgId), eq(creditEntry.userId, userId), eq(creditEntry.period, period)));
  const funded = funding?.status === "paid";
  const pool = Math.max(0, await poolBalance(tx, orgId));
  const left = Math.max(0, policy.allowancePaise - mine.net);
  return {
    orgId,
    orgName,
    period,
    allowancePaise: policy.allowancePaise,
    usedPaise: mine.net,
    availablePaise: funded ? Math.min(left, pool) : 0,
    funded,
    covers: { sessions: policy.coverSessions, facilities: policy.coverFacilities, stays: policy.coverStays },
    partnersOnly: policy.partnersOnly,
  };
}

/** Your credits at each company you work for that has credits switched on. */
export async function myWallets(userId: string, period = creditPeriod()): Promise<Wallet[]> {
  const orgs = (await listMemberships(userId)).filter(
    (m) => m.membership.status === "active" && m.organization.kind === "company" && !m.organization.suspendedAt && !m.organization.removedAt,
  );
  const out: Wallet[] = [];
  for (const m of orgs) {
    const w = await withScope({ userId, orgId: m.organization.id }, (tx) => walletIn(tx, userId, m.organization.id, m.organization.name, period));
    if (w) out.push(w);
  }
  return out;
}

/** Your own credit spends and refunds (only you see these per item). */
export async function myCreditHistory(userId: string) {
  return withScope({ userId }, (tx) =>
    tx
      .select({ id: creditEntry.id, type: creditEntry.type, amountPaise: creditEntry.amountPaise, category: creditEntry.category, refType: creditEntry.refType, refId: creditEntry.refId, createdAt: creditEntry.createdAt })
      .from(creditEntry)
      .where(eq(creditEntry.userId, userId))
      .orderBy(desc(creditEntry.createdAt))
      .limit(50),
  );
}

/** What credits can pay for, across your wallets (for "Covered" tags). */
export async function myCoverage(userId: string) {
  const ws = (await myWallets(userId)).filter((w) => w.funded);
  return {
    sessions: ws.some((w) => w.covers.sessions),
    facilities: ws.some((w) => w.covers.facilities),
    stays: ws.some((w) => w.covers.stays),
    partnersOnly: ws.length > 0 && ws.every((w) => !w.covers.facilities || w.partnersOnly),
    availablePaise: ws.reduce((a, w) => a + w.availablePaise, 0),
  };
}

// ---------- Spending ----------

export const payWithCreditsInput = z.object({ idempotencyKey: z.string().min(8).max(100) });

/**
 * Pay for an accepted session with credits. Picks the first company wallet
 * that covers sessions and has enough for the whole price.
 */
export async function paySessionWithCredits(userId: string, appointmentId: string, input: z.input<typeof payWithCreditsInput>) {
  assertUuid(appointmentId, "Session");
  const { idempotencyKey } = payWithCreditsInput.parse(input);
  // Same request again (a double click, a retry): report the earlier result.
  const earlier = await withScope({ userId }, (tx) => tx.query.creditEntry.findFirst({ where: and(eq(creditEntry.idempotencyKey, `spend:${idempotencyKey}`), eq(creditEntry.userId, userId)) }));
  if (earlier) return { paid: true, orgId: earlier.orgId };
  const s = await getSession(userId, appointmentId);
  if (s.memberUserId !== userId) throw notFound("Session not found");
  if (s.status !== "accepted") throw badRequest("This session isn't waiting for payment");
  const price = s.pricePaise;
  if (price <= 0) throw badRequest("This session is free");
  const wallets = (await myWallets(userId)).filter((w) => w.funded && w.covers.sessions);
  if (!wallets.length) throw forbidden("Your company's credits don't cover sessions this month");
  const w = wallets.find((x) => x.availablePaise >= price);
  if (!w) throw new AppError(409, "insufficient_credits", "You don't have enough credits left this month for this session");

  return withScope({ userId, orgId: w.orgId }, async (tx) => {
    // Serialise spends per company so the pool can't go below zero.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"credits:" + w.orgId}))`);
    const dup = await tx.query.creditEntry.findFirst({ where: eq(creditEntry.idempotencyKey, `spend:${idempotencyKey}`) });
    if (dup) return { paid: true, orgId: dup.orgId };
    if (!(await isActiveCompanyMember(userId, w.orgId, tx))) throw forbidden("You're no longer a member of that company");
    const fresh = await walletIn(tx, userId, w.orgId, w.orgName, creditPeriod());
    if (!fresh || fresh.availablePaise < price) throw new AppError(409, "insufficient_credits", "You don't have enough credits left this month for this session");
    const split = splitFee(price, await memberFeeBps(tx));
    await tx.insert(creditEntry).values({
      orgId: w.orgId,
      userId,
      period: fresh.period,
      type: "spend",
      amountPaise: price,
      ...split,
      category: "sessions",
      refType: "session",
      refId: appointmentId,
      idempotencyKey: `spend:${idempotencyKey}`,
    });
    await markSessionPaid(tx, appointmentId);
    return { paid: true, orgId: w.orgId };
  });
}

/**
 * Give credits back for a cancelled session that was paid with credits.
 * Safe to call more than once. `tx` must bypass RLS (the outbox worker).
 */
export async function refundSessionCredits(tx: Tx, appointmentId: string) {
  const spend = await tx.query.creditEntry.findFirst({ where: and(eq(creditEntry.refType, "session"), eq(creditEntry.refId, appointmentId), eq(creditEntry.type, "spend")) });
  if (!spend) return null;
  const [row] = await tx
    .insert(creditEntry)
    .values({
      orgId: spend.orgId,
      userId: spend.userId,
      period: spend.period,
      type: "refund",
      amountPaise: spend.amountPaise,
      feePaise: spend.feePaise,
      payablePaise: spend.payablePaise,
      category: spend.category,
      refType: "session",
      refId: appointmentId,
      idempotencyKey: `refund:session:${appointmentId}`,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/** Was this session paid with credits? (For the member and the professional's view.) */
export async function sessionPaidWithCredits(userId: string, appointmentId: string) {
  const rows = await withScope({ userId }, (tx) =>
    tx.select({ type: creditEntry.type }).from(creditEntry).where(and(eq(creditEntry.refType, "session"), eq(creditEntry.refId, appointmentId))),
  );
  return rows.some((r) => r.type === "spend") && !rows.some((r) => r.type === "refund");
}

/**
 * Buy a gym, studio or wellness centre plan with credits. The company must
 * cover facilities, and if it allows benefit partners only, the facility must
 * be one. Whole price only.
 */
export async function buyPlanWithCredits(userId: string, planId: string, input: z.input<typeof payWithCreditsInput>) {
  const { idempotencyKey } = payWithCreditsInput.parse(input);
  const earlier = await withScope({ userId }, (tx) => tx.query.creditEntry.findFirst({ where: and(eq(creditEntry.idempotencyKey, `spend:${idempotencyKey}`), eq(creditEntry.userId, userId)) }));
  if (earlier) return { paid: true, purchaseId: earlier.refId };
  const { plan, benefitPartner } = await planForPurchase(planId);
  const eligible = (await myWallets(userId)).filter((w) => w.funded && w.covers.facilities && (!w.partnersOnly || benefitPartner));
  if (!eligible.length) throw forbidden(benefitPartner ? "Your company's credits don't cover gym and studio plans this month" : "This place isn't a Moosam benefit partner, so company credits can't be used here");
  const w = eligible.find((x) => x.availablePaise >= plan.pricePaise);
  if (!w) throw new AppError(409, "insufficient_credits", "You don't have enough credits left this month for this plan");

  return withScope({ userId, orgId: w.orgId }, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"credits:" + w.orgId}))`);
    if (!(await isActiveCompanyMember(userId, w.orgId, tx))) throw forbidden("You're no longer a member of that company");
    const fresh = await walletIn(tx, userId, w.orgId, w.orgName, creditPeriod());
    if (!fresh || fresh.availablePaise < plan.pricePaise) throw new AppError(409, "insufficient_credits", "You don't have enough credits left this month for this plan");
    const purchase = await recordPlanPurchase(tx, { userId, plan, paidWith: "credits", idempotencyKey: `plan:${idempotencyKey}` });
    await tx.insert(creditEntry).values({
      orgId: w.orgId,
      userId,
      period: fresh.period,
      type: "spend",
      amountPaise: plan.pricePaise,
      ...splitFee(plan.pricePaise, await memberFeeBps(tx)),
      category: "facilities",
      refType: "plan",
      refId: purchase.id,
      idempotencyKey: `spend:${idempotencyKey}`,
    });
    await enqueue(tx, { type: "plan.purchased", payload: { purchaseId: purchase.id } });
    return { paid: true, purchaseId: purchase.id };
  });
}

// ---------- Earnings summaries (dashboards) ----------

const inMonth = (d: Date | string, period: string) => creditPeriod(typeof d === "string" ? new Date(`${d}T12:00:00+05:30`) : d) === period;

/** A professional's paid sessions this month: gross, Moosam's fee and what they receive. */
export async function proMonthEarnings(userId: string, period = creditPeriod()) {
  const [sessions, feeBps] = await Promise.all([listProSessions(userId), memberFeeBps(getDb())]);
  const paid = sessions.filter((x) => ["confirmed", "completed"].includes(x.status) && x.pricePaise > 0 && inMonth(x.startsAt, period));
  const grossPaise = paid.reduce((a, x) => a + x.pricePaise, 0);
  const feePaise = paid.reduce((a, x) => a + splitFee(x.pricePaise, feeBps).feePaise, 0);
  return { period, sessions: paid.length, grossPaise, feePaise, netPaise: grossPaise - feePaise, feeBps, waiting: sessions.filter((x) => x.status === "requested").length };
}

/** The last `months` months of member-session earnings, newest first (one read of the sessions). */
export async function proEarningsByMonth(userId: string, months = 6, now = new Date()) {
  const [sessions, feeBps] = await Promise.all([listProSessions(userId), memberFeeBps(getDb())]);
  const paid = sessions.filter((x) => ["confirmed", "completed"].includes(x.status) && x.pricePaise > 0);
  const out: { period: string; sessions: number; grossPaise: number; feePaise: number; netPaise: number }[] = [];
  const [y, m] = creditPeriod(now).split("-").map(Number);
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const rows = paid.filter((x) => inMonth(x.startsAt, period));
    const grossPaise = rows.reduce((a, x) => a + x.pricePaise, 0);
    const feePaise = rows.reduce((a, x) => a + splitFee(x.pricePaise, feeBps).feePaise, 0);
    out.push({ period, sessions: rows.length, grossPaise, feePaise, netPaise: grossPaise - feePaise });
  }
  return { feeBps, months: out };
}

/** A facility's plan sales this month and active members. */
export async function facilityMonthStats(userId: string, orgId: string, period = creditPeriod()) {
  const [rows, feeBps] = await Promise.all([facilityMembers(userId, orgId), memberFeeBps(getDb())]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const sold = rows.filter((r) => r.status === "active" && inMonth(r.startsOn, period));
  const grossPaise = sold.reduce((a, r) => a + r.pricePaise, 0);
  const feePaise = sold.reduce((a, r) => a + splitFee(r.pricePaise, feeBps).feePaise, 0);
  return {
    activeMembers: rows.filter((r) => r.status === "active" && r.endsOn >= today).length,
    soldThisMonth: sold.length,
    viaCredits: sold.filter((r) => r.paidWith === "credits").length,
    grossPaise,
    feePaise,
    netPaise: grossPaise - feePaise,
    feeBps,
  };
}

/** Platform totals for member bookings paid with credits this month (staff only; `db` must bypass RLS). */
export async function creditsMonthSummary(db: Executor, period = creditPeriod()) {
  const [r] = await db
    .select({
      spentPaise: sql<number>`coalesce(sum(case ${creditEntry.type} when 'spend' then ${creditEntry.amountPaise} when 'refund' then -${creditEntry.amountPaise} else 0 end), 0)::int`,
      feePaise: sql<number>`coalesce(sum(case ${creditEntry.type} when 'spend' then ${creditEntry.feePaise} when 'refund' then -${creditEntry.feePaise} else 0 end), 0)::int`,
      fundedPaise: sql<number>`coalesce(sum(case ${creditEntry.type} when 'fund' then ${creditEntry.amountPaise} else 0 end), 0)::int`,
      companies: sql<number>`count(distinct ${creditEntry.orgId})::int`,
    })
    .from(creditEntry)
    .where(eq(creditEntry.period, period));
  const [due] = await db.select({ n: sql<number>`count(*)::int`, paise: sql<number>`coalesce(sum(${creditFunding.duePaise}), 0)::int` }).from(creditFunding).where(eq(creditFunding.status, "due"));
  return { period, ...r, dueCount: due.n, duePaise: due.paise };
}
