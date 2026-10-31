import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { booking, category, enquiry, organization, payout, proposal, requirement, user } from "@/db/schema";
import { withScope } from "@/db/client";
import { assertUuid, badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { enqueue, audit } from "@/modules/platform/outbox";
import { ORG_BUYERS, requireOrgRole, assertCompanyOrg } from "@/modules/organizations/service";
import { profileIdsForUsers } from "@/modules/professionals/service";
import { ensureQuote, onBookingCancelled } from "./payments";

export * from "./payments";
import { matchRequirement } from "@/modules/matching/service";

const rupeesToPaise = (r: number) => Math.round(r * 100);

export const requirementInput = z
  .object({
    title: z.string().trim().min(3).max(160),
    categoryId: z.string().uuid(),
    city: z.string().trim().max(80).default(""),
    deliveryMode: z.enum(["in_person", "virtual", "hybrid"]),
    participants: z.number().int().min(1).max(100_000),
    budgetMinRupees: z.number().min(0),
    budgetMaxRupees: z.number().min(0),
    preferredDate: z.string().date().optional(),
    mustBeVerified: z.boolean().default(true),
    mustLanguages: z.array(z.string().trim().min(2).max(40)).max(5).default([]),
    minYearsExperience: z.number().int().min(0).max(50).default(0),
    details: z.string().trim().max(4000).default(""),
    publish: z.boolean().default(false),
  })
  .refine((v) => v.budgetMaxRupees >= v.budgetMinRupees, { message: "Budget maximum must be at least the minimum" })
  .refine((v) => v.deliveryMode === "virtual" || v.city.length > 0, { message: "City is required for in-person or hybrid" });

export async function createRequirement(userId: string, orgId: string, input: z.input<typeof requirementInput>) {
  const d = requirementInput.parse(input);
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    await assertCompanyOrg(orgId, tx);
    const [row] = await tx
      .insert(requirement)
      .values({
        orgId,
        createdBy: userId,
        title: d.title,
        categoryId: d.categoryId,
        city: d.city,
        deliveryMode: d.deliveryMode,
        participants: d.participants,
        budgetMinPaise: rupeesToPaise(d.budgetMinRupees),
        budgetMaxPaise: rupeesToPaise(d.budgetMaxRupees),
        preferredDate: d.preferredDate,
        mustBeVerified: d.mustBeVerified,
        mustLanguages: d.mustLanguages,
        minYearsExperience: d.minYearsExperience,
        details: d.details,
        status: d.publish ? "published" : "draft",
      })
      .returning();
    return row;
  });
}

export async function listOrgRequirements(userId: string, orgId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ["owner", "admin", "wellness_manager", "member"], tx);
    return tx.select().from(requirement).where(eq(requirement.orgId, orgId)).orderBy(desc(requirement.createdAt));
  });
}

export async function getMatches(userId: string, orgId: string, requirementId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const result = await matchRequirement(tx, requirementId);
    if (result.requirement.orgId !== orgId) throw notFound("Requirement not found");
    return result;
  });
}

/** Enquiries go only to professionals who currently pass every hard filter. */
export async function sendEnquiries(userId: string, orgId: string, requirementId: string, professionalUserIds: string[]) {
  if (!professionalUserIds.length || professionalUserIds.length > 20) throw badRequest("Choose between 1 and 20 professionals");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const { requirement: req, matches } = await matchRequirement(tx, requirementId);
    if (req.orgId !== orgId) throw notFound("Requirement not found");
    if (req.status !== "published") throw badRequest("Publish the requirement before sending enquiries");
    const scores = new Map(matches.map((m) => [m.candidate.userId, m.score]));
    const rejected = professionalUserIds.filter((id) => !scores.has(id));
    if (rejected.length) throw badRequest("Some professionals don't meet this requirement's must-haves");
    const rows = await tx
      .insert(enquiry)
      .values(professionalUserIds.map((pid) => ({ requirementId, orgId, professionalUserId: pid, matchScore: scores.get(pid) ?? null })))
      .onConflictDoNothing()
      .returning();
    for (const e of rows) {
      await enqueue(tx, { type: "enquiry.sent", payload: { enquiryId: e.id, requirementId, professionalUserId: e.professionalUserId } });
    }
    return rows;
  });
}

export const proposalInput = z.object({
  feeRupees: z.number().positive().max(10_000_000),
  proposedStart: z.string().datetime({ offset: true }),
  maxParticipants: z.number().int().min(1),
  inclusions: z.string().trim().max(2000).default(""),
  message: z.string().trim().max(2000).default(""),
  freeCancellationDays: z.number().int().min(0).max(60).default(7),
});

/** A professional may propose only on a requirement they were sent an enquiry for. */
export async function submitProposal(professionalUserId: string, requirementId: string, input: z.input<typeof proposalInput>) {
  const d = proposalInput.parse(input);
  return withScope({ userId: professionalUserId }, async (tx) => {
    const enq = await tx.query.enquiry.findFirst({
      where: and(eq(enquiry.requirementId, requirementId), eq(enquiry.professionalUserId, professionalUserId)),
    });
    if (!enq) throw forbidden("You can only respond to enquiries sent to you");
    if (enq.status === "declined") throw badRequest("You declined this enquiry");
    const req = await tx.query.requirement.findFirst({ where: eq(requirement.id, requirementId) });
    if (!req || req.status !== "published") throw badRequest("This requirement is no longer open");
    const [row] = await tx
      .insert(proposal)
      .values({
        requirementId,
        orgId: req.orgId,
        professionalUserId,
        feePaise: rupeesToPaise(d.feeRupees),
        proposedStart: new Date(d.proposedStart),
        maxParticipants: d.maxParticipants,
        inclusions: d.inclusions,
        message: d.message,
        freeCancellationDays: d.freeCancellationDays,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict("You already sent a proposal for this requirement");
    await tx.update(enquiry).set({ status: "responded" }).where(eq(enquiry.id, enq.id));
    await enqueue(tx, { type: "proposal.submitted", payload: { proposalId: row.id, requirementId, orgId: req.orgId, createdBy: req.createdBy } });
    return row;
  });
}

export async function listProposals(userId: string, orgId: string, requirementId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    return tx.select().from(proposal).where(and(eq(proposal.requirementId, requirementId), eq(proposal.orgId, orgId)));
  });
}

/**
 * Accept one proposal: decline the others, create the booking and queue the
 * notifications in ONE transaction. Repeating the call with the same
 * idempotency key returns the same booking.
 */
export async function acceptProposal(userId: string, orgId: string, proposalId: string, idempotencyKey: string) {
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) throw badRequest("Invalid idempotency key");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const existing = await tx.query.booking.findFirst({ where: eq(booking.idempotencyKey, idempotencyKey) });
    if (existing) {
      if (existing.proposalId !== proposalId) throw conflict("Idempotency key already used for a different proposal");
      return existing;
    }
    const [p] = await tx.select().from(proposal).where(and(eq(proposal.id, proposalId), eq(proposal.orgId, orgId))).for("update");
    if (!p) throw notFound("Proposal not found");
    if (p.status !== "submitted") throw conflict(p.status === "revision_requested" ? "Wait for the professional's revised proposal" : `This proposal is ${p.status}`);
    await tx.update(proposal).set({ status: "accepted", updatedAt: new Date() }).where(eq(proposal.id, p.id));
    const others = await tx
      .update(proposal)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(proposal.requirementId, p.requirementId), ne(proposal.id, p.id), inArray(proposal.status, ["submitted", "revision_requested"])))
      .returning({ id: proposal.id, professionalUserId: proposal.professionalUserId });
    for (const o of others) await enqueue(tx, { type: "proposal.not_selected", payload: { proposalId: o.id, professionalUserId: o.professionalUserId } });
    await tx
      .update(enquiry)
      .set({ status: "closed" })
      .where(and(eq(enquiry.requirementId, p.requirementId), inArray(enquiry.status, ["sent", "viewed"])));
    const [req] = await tx.update(requirement).set({ status: "closed", updatedAt: new Date() }).where(eq(requirement.id, p.requirementId)).returning();
    const org = await tx.query.organization.findFirst({ where: eq(organization.id, orgId) });
    const location = req.deliveryMode === "virtual" ? "Online (link to be shared)" : [org?.address, req.city || org?.city].filter(Boolean).join(", ");
    const [created] = await tx
      .insert(booking)
      .values({ proposalId: p.id, orgId, professionalUserId: p.professionalUserId, scheduledStart: p.proposedStart, idempotencyKey, location })
      .returning();
    // Fix the price (fee, GST, commission) now, so later rate changes don't affect it.
    const b = await ensureQuote(tx, created.id);
    await enqueue(tx, { type: "booking.created", payload: { bookingId: b.id, orgId, professionalUserId: p.professionalUserId } });
    await audit(tx, { actorId: userId, action: "proposal.accept", targetType: "proposal", targetId: p.id, metadata: { bookingId: b.id } });
    return b;
  });
}

// ---------- M2: the professional's side ----------
// All of these run scoped to the professional (no org), so RLS only shows rows
// where professional_user_id is them (and requirements they were invited to).

const ENQUIRY_OPEN = ["sent", "viewed"] as const;

export async function listMyEnquiries(proUserId: string) {
  return withScope({ userId: proUserId }, async (tx) => {
    return tx
      .select({
        id: enquiry.id,
        status: enquiry.status,
        createdAt: enquiry.createdAt,
        requirementId: requirement.id,
        title: requirement.title,
        requirementStatus: requirement.status,
        city: requirement.city,
        deliveryMode: requirement.deliveryMode,
        participants: requirement.participants,
        budgetMinPaise: requirement.budgetMinPaise,
        budgetMaxPaise: requirement.budgetMaxPaise,
        preferredDate: requirement.preferredDate,
        categoryName: category.name,
        orgName: organization.name,
      })
      .from(enquiry)
      .innerJoin(requirement, eq(requirement.id, enquiry.requirementId))
      .innerJoin(category, eq(category.id, requirement.categoryId))
      .innerJoin(organization, eq(organization.id, enquiry.orgId))
      .where(eq(enquiry.professionalUserId, proUserId))
      .orderBy(desc(enquiry.createdAt));
  });
}

/** Opening an enquiry marks it viewed (the company sees that). */
export async function getMyEnquiry(proUserId: string, enquiryId: string) {
  assertUuid(enquiryId, "Enquiry");
  return withScope({ userId: proUserId }, async (tx) => {
    const [row] = await tx
      .select({ enquiry, requirement, categoryName: category.name, orgName: organization.name })
      .from(enquiry)
      .innerJoin(requirement, eq(requirement.id, enquiry.requirementId))
      .innerJoin(category, eq(category.id, requirement.categoryId))
      .innerJoin(organization, eq(organization.id, enquiry.orgId))
      .where(and(eq(enquiry.id, enquiryId), eq(enquiry.professionalUserId, proUserId)));
    if (!row) throw notFound("Enquiry not found");
    if (row.enquiry.status === "sent") {
      await tx.update(enquiry).set({ status: "viewed" }).where(eq(enquiry.id, enquiryId));
      row.enquiry.status = "viewed";
    }
    const myProposal = await tx.query.proposal.findFirst({
      where: and(eq(proposal.requirementId, row.requirement.id), eq(proposal.professionalUserId, proUserId)),
    });
    return { ...row, proposal: myProposal ?? null, canPropose: row.requirement.status === "published" && !myProposal && row.enquiry.status !== "declined" };
  });
}

export async function declineEnquiry(proUserId: string, enquiryId: string) {
  return withScope({ userId: proUserId }, async (tx) => {
    const [row] = await tx
      .update(enquiry)
      .set({ status: "declined" })
      .where(and(eq(enquiry.id, enquiryId), eq(enquiry.professionalUserId, proUserId), inArray(enquiry.status, [...ENQUIRY_OPEN])))
      .returning();
    if (!row) throw badRequest("This enquiry can no longer be declined");
    return row;
  });
}

/** Withdraw a proposal the company hasn't decided on yet. */
export async function withdrawProposal(proUserId: string, proposalId: string) {
  return withScope({ userId: proUserId }, async (tx) => {
    const [row] = await tx
      .update(proposal)
      .set({ status: "withdrawn", updatedAt: new Date() })
      .where(and(eq(proposal.id, proposalId), eq(proposal.professionalUserId, proUserId), eq(proposal.status, "submitted")))
      .returning();
    if (!row) throw badRequest("Only a proposal that is still waiting can be withdrawn");
    return row;
  });
}

export async function listMyProposals(proUserId: string) {
  return withScope({ userId: proUserId }, async (tx) => {
    return tx
      .select({
        proposal,
        title: requirement.title,
        orgName: organization.name,
        enquiryId: enquiry.id,
        bookingId: booking.id,
        bookingStatus: booking.status,
      })
      .from(proposal)
      .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
      .innerJoin(organization, eq(organization.id, proposal.orgId))
      .leftJoin(enquiry, and(eq(enquiry.requirementId, proposal.requirementId), eq(enquiry.professionalUserId, proUserId)))
      .leftJoin(booking, eq(booking.proposalId, proposal.id))
      .where(eq(proposal.professionalUserId, proUserId))
      .orderBy(desc(proposal.createdAt));
  });
}

export async function listMyBookings(proUserId: string) {
  return withScope({ userId: proUserId }, async (tx) => {
    const rows = await tx
      .select({ booking, title: requirement.title, orgName: organization.name, feePaise: proposal.feePaise, currency: proposal.currency, participants: proposal.maxParticipants })
      .from(booking)
      .innerJoin(proposal, eq(proposal.id, booking.proposalId))
      .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
      .innerJoin(organization, eq(organization.id, booking.orgId))
      .where(eq(booking.professionalUserId, proUserId))
      .orderBy(desc(booking.scheduledStart));
    const paid = await tx
      .select({ bookingId: payout.bookingId, sum: sql<number>`sum(${payout.amountPaise})::int`, last: sql<Date>`max(${payout.paidAt})` })
      .from(payout)
      .where(eq(payout.professionalUserId, proUserId))
      .groupBy(payout.bookingId);
    const byBooking = new Map(paid.map((p) => [p.bookingId, p]));
    return rows.map((r) => ({ ...r, paidOutPaise: byBooking.get(r.booking.id)?.sum ?? 0, lastPayoutAt: byBooking.get(r.booking.id)?.last ?? null }));
  });
}

/**
 * The professional's money, from their share (fee minus commission):
 * - awaiting: booked, the company hasn't paid yet
 * - earned: the company has paid (less any refunded share)
 * - paidOut / due: what we've sent them, and what we still owe
 */
export function summarizeEarnings(
  rows: { booking: { status: string; paymentStatus: string; payablePaise: number | null; payableReversedPaise: number }; paidOutPaise: number }[],
) {
  let awaiting = 0;
  let earned = 0;
  let paidOut = 0;
  for (const r of rows) {
    const share = r.booking.payablePaise ?? 0;
    paidOut += r.paidOutPaise;
    if (r.booking.paymentStatus === "paid" || r.booking.paymentStatus === "partially_refunded" || r.booking.paymentStatus === "refunded") earned += share - r.booking.payableReversedPaise;
    else if (r.booking.status !== "cancelled") awaiting += share;
  }
  return { awaitingPaymentPaise: awaiting, earnedPaise: earned, paidOutPaise: paidOut, duePaise: earned - paidOut, bookingCount: rows.filter((r) => r.booking.status !== "cancelled").length };
}

// ---------- M3: the company side ----------
// Every function runs inside withScope({ userId, orgId }) and checks the
// caller's role in the same transaction; RLS hides other companies' rows.

const DAY = 86_400_000;

export async function getRequirement(userId: string, orgId: string, requirementId: string) {
  assertUuid(requirementId, "Requirement");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const [row] = await tx
      .select({ requirement, categoryName: category.name })
      .from(requirement)
      .innerJoin(category, eq(category.id, requirement.categoryId))
      .where(and(eq(requirement.id, requirementId), eq(requirement.orgId, orgId)));
    if (!row) throw notFound("Requirement not found");
    return row;
  });
}

/**
 * Edit a draft or published requirement. `publish: true` publishes a draft;
 * a published requirement is never silently un-published.
 */
export async function updateRequirement(userId: string, orgId: string, requirementId: string, input: z.input<typeof requirementInput>) {
  const d = requirementInput.parse(input);
  assertUuid(requirementId, "Requirement");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const current = await tx.query.requirement.findFirst({ where: and(eq(requirement.id, requirementId), eq(requirement.orgId, orgId)) });
    if (!current) throw notFound("Requirement not found");
    if (current.status !== "draft" && current.status !== "published") throw badRequest(`A ${current.status} requirement can't be edited`);
    const [row] = await tx
      .update(requirement)
      .set({
        title: d.title,
        categoryId: d.categoryId,
        city: d.city,
        deliveryMode: d.deliveryMode,
        participants: d.participants,
        budgetMinPaise: rupeesToPaise(d.budgetMinRupees),
        budgetMaxPaise: rupeesToPaise(d.budgetMaxRupees),
        preferredDate: d.preferredDate ?? null,
        mustBeVerified: d.mustBeVerified,
        mustLanguages: d.mustLanguages,
        minYearsExperience: d.minYearsExperience,
        details: d.details,
        status: current.status === "published" || d.publish ? "published" : "draft",
        updatedAt: new Date(),
      })
      .where(eq(requirement.id, requirementId))
      .returning();
    return row;
  });
}

/** Withdraw: closes open enquiries, turns down pending proposals and tells those professionals. */
export async function withdrawRequirement(userId: string, orgId: string, requirementId: string) {
  assertUuid(requirementId, "Requirement");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const [row] = await tx
      .update(requirement)
      .set({ status: "withdrawn", updatedAt: new Date() })
      .where(and(eq(requirement.id, requirementId), eq(requirement.orgId, orgId), inArray(requirement.status, ["draft", "published"])))
      .returning();
    if (!row) throw badRequest("Only a draft or open requirement can be withdrawn");
    const open = await tx
      .update(enquiry)
      .set({ status: "closed" })
      .where(and(eq(enquiry.requirementId, requirementId), inArray(enquiry.status, ["sent", "viewed", "responded"])))
      .returning({ professionalUserId: enquiry.professionalUserId });
    await tx
      .update(proposal)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(proposal.requirementId, requirementId), inArray(proposal.status, ["submitted", "revision_requested"])));
    for (const e of open) await enqueue(tx, { type: "requirement.withdrawn", payload: { requirementId, professionalUserId: e.professionalUserId } });
    await audit(tx, { actorId: userId, action: "requirement.withdraw", targetType: "requirement", targetId: requirementId });
    return row;
  });
}

/** Enquiries sent for a requirement, with each professional's response. */
export async function listRequirementEnquiries(userId: string, orgId: string, requirementId: string) {
  assertUuid(requirementId, "Requirement");
  const rows = await withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    return tx
      .select({ enquiry, name: user.name, proposal })
      .from(enquiry)
      .innerJoin(user, eq(user.id, enquiry.professionalUserId))
      .leftJoin(proposal, and(eq(proposal.requirementId, enquiry.requirementId), eq(proposal.professionalUserId, enquiry.professionalUserId)))
      .where(and(eq(enquiry.requirementId, requirementId), eq(enquiry.orgId, orgId)))
      .orderBy(desc(enquiry.matchScore), asc(user.name));
  });
  const profiles = await profileIdsForUsers(rows.map((r) => r.enquiry.professionalUserId));
  return rows.map((r) => ({ ...r, profileId: profiles.get(r.enquiry.professionalUserId) ?? null }));
}

/** One reminder per enquiry per day, only while the professional hasn't answered. */
export async function remindEnquiry(userId: string, orgId: string, enquiryId: string) {
  assertUuid(enquiryId, "Enquiry");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const e = await tx.query.enquiry.findFirst({ where: and(eq(enquiry.id, enquiryId), eq(enquiry.orgId, orgId)) });
    if (!e) throw notFound("Enquiry not found");
    if (e.status !== "sent" && e.status !== "viewed") throw badRequest("This professional has already responded");
    if (e.remindedAt && Date.now() - e.remindedAt.getTime() < DAY) throw badRequest("You can send one reminder a day");
    await tx.update(enquiry).set({ remindedAt: new Date() }).where(eq(enquiry.id, e.id));
    await enqueue(tx, { type: "enquiry.reminder", payload: { enquiryId: e.id, professionalUserId: e.professionalUserId } });
  });
}

export const revisionInput = z.object({ note: z.string().trim().min(5, "Tell the professional what to change").max(1000) });
const MAX_REVISIONS = 3;

export async function requestRevision(userId: string, orgId: string, proposalId: string, input: z.input<typeof revisionInput>) {
  const { note } = revisionInput.parse(input);
  assertUuid(proposalId, "Proposal");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const p = await tx.query.proposal.findFirst({ where: and(eq(proposal.id, proposalId), eq(proposal.orgId, orgId)) });
    if (!p) throw notFound("Proposal not found");
    if (p.status !== "submitted") throw badRequest("Only a proposal waiting for your decision can be sent back");
    if (p.revisionCount >= MAX_REVISIONS) throw badRequest(`A proposal can be revised at most ${MAX_REVISIONS} times`);
    const [row] = await tx
      .update(proposal)
      .set({ status: "revision_requested", revisionNote: note, revisionCount: p.revisionCount + 1, updatedAt: new Date() })
      .where(eq(proposal.id, p.id))
      .returning();
    await enqueue(tx, { type: "proposal.revision_requested", payload: { proposalId: p.id, professionalUserId: p.professionalUserId } });
    return row;
  });
}

/** The professional answers a revision request with an updated proposal. */
export async function reviseProposal(proUserId: string, proposalId: string, input: z.input<typeof proposalInput>) {
  const d = proposalInput.parse(input);
  assertUuid(proposalId, "Proposal");
  return withScope({ userId: proUserId }, async (tx) => {
    const p = await tx.query.proposal.findFirst({ where: and(eq(proposal.id, proposalId), eq(proposal.professionalUserId, proUserId)) });
    if (!p) throw notFound("Proposal not found");
    if (p.status !== "revision_requested") throw badRequest("This proposal isn't waiting for changes");
    const req = await tx.query.requirement.findFirst({ where: eq(requirement.id, p.requirementId) });
    if (!req || req.status !== "published") throw badRequest("This requirement is no longer open");
    const [row] = await tx
      .update(proposal)
      .set({
        feePaise: rupeesToPaise(d.feeRupees),
        proposedStart: new Date(d.proposedStart),
        maxParticipants: d.maxParticipants,
        inclusions: d.inclusions,
        message: d.message,
        freeCancellationDays: d.freeCancellationDays,
        status: "submitted",
        revisionNote: null,
        updatedAt: new Date(),
      })
      .where(eq(proposal.id, p.id))
      .returning();
    await enqueue(tx, { type: "proposal.submitted", payload: { proposalId: p.id, requirementId: req.id, orgId: req.orgId, createdBy: req.createdBy, revised: true } });
    return row;
  });
}

/**
 * Side-by-side comparison: one column per professional who was sent an
 * enquiry, whether or not they've proposed yet.
 */
export async function compareProposals(userId: string, orgId: string, requirementId: string) {
  const { requirement: req, categoryName } = await getRequirement(userId, orgId, requirementId);
  const rows = await listRequirementEnquiries(userId, orgId, requirementId);
  const columns = rows
    .filter((r) => r.enquiry.status !== "declined" || r.proposal)
    .map((r) => ({
      enquiryId: r.enquiry.id,
      enquiryStatus: r.enquiry.status,
      enquirySentAt: r.enquiry.createdAt,
      remindedAt: r.enquiry.remindedAt,
      canRemind:
        !r.proposal &&
        (r.enquiry.status === "sent" || r.enquiry.status === "viewed") &&
        (!r.enquiry.remindedAt || Date.now() - r.enquiry.remindedAt.getTime() >= DAY),
      professionalUserId: r.enquiry.professionalUserId,
      profileId: r.profileId,
      name: r.name,
      matchScore: r.enquiry.matchScore,
      proposal: r.proposal,
      respondedInMs: r.proposal ? r.proposal.createdAt.getTime() - r.enquiry.createdAt.getTime() : null,
    }))
    .sort((a, b) => Number(Boolean(b.proposal)) - Number(Boolean(a.proposal)) || (b.matchScore ?? 0) - (a.matchScore ?? 0));
  const declined = rows.filter((r) => r.enquiry.status === "declined" && !r.proposal).map((r) => r.name);
  return { requirement: req, categoryName, columns, declined };
}

/** Proposals across all requirements that are waiting for the company. */
export async function listOrgProposals(userId: string, orgId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    return tx
      .select({ proposal, title: requirement.title, requirementId: requirement.id, requirementStatus: requirement.status, name: user.name })
      .from(proposal)
      .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
      .innerJoin(user, eq(user.id, proposal.professionalUserId))
      .where(eq(proposal.orgId, orgId))
      .orderBy(desc(proposal.updatedAt));
  });
}

export type BookingPolicy = {
  freeCancelUntil: Date;
  canReschedule: boolean;
  rescheduleBlockedReason: string | null;
  canCancel: boolean;
  cancelIsLate: boolean;
  canComplete: boolean;
};

export const MAX_RESCHEDULES = 2;

/**
 * Cancellation and rescheduling rules (default policy: set per proposal,
 * normally free up to 7 days before). Pure, so it is easy to test.
 * - Cancel any time before the session; inside the window it is marked late
 *   (a fee may apply once payments go live).
 * - Reschedule only outside the window, at most twice.
 * - Mark completed once the session has started.
 */
export function bookingPolicy(b: { status: string; scheduledStart: Date; rescheduleCount: number }, freeCancellationDays: number, now = new Date()): BookingPolicy {
  const freeCancelUntil = new Date(b.scheduledStart.getTime() - freeCancellationDays * DAY);
  const open = b.status === "pending" || b.status === "confirmed";
  const started = now >= b.scheduledStart;
  let rescheduleBlockedReason: string | null = null;
  if (!open) rescheduleBlockedReason = `This booking is ${b.status}`;
  else if (started) rescheduleBlockedReason = "The session time has passed";
  else if (now > freeCancelUntil) rescheduleBlockedReason = `Changes must be made at least ${freeCancellationDays} days before the session. Contact the professional directly.`;
  else if (b.rescheduleCount >= MAX_RESCHEDULES) rescheduleBlockedReason = `A booking can be rescheduled at most ${MAX_RESCHEDULES} times`;
  return {
    freeCancelUntil,
    canReschedule: rescheduleBlockedReason === null,
    rescheduleBlockedReason,
    canCancel: open && !started,
    cancelIsLate: now > freeCancelUntil,
    canComplete: open && started,
  };
}

async function loadOrgBooking(tx: Parameters<Parameters<typeof withScope>[1]>[0], orgId: string, bookingId: string) {
  const [row] = await tx
    .select({ booking, proposal, title: requirement.title, requirementId: requirement.id, deliveryMode: requirement.deliveryMode, name: user.name, email: user.email })
    .from(booking)
    .innerJoin(proposal, eq(proposal.id, booking.proposalId))
    .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
    .innerJoin(user, eq(user.id, booking.professionalUserId))
    .where(and(eq(booking.id, bookingId), eq(booking.orgId, orgId)));
  if (!row) throw notFound("Booking not found");
  return row;
}

export async function getOrgBooking(userId: string, orgId: string, bookingId: string) {
  assertUuid(bookingId, "Booking");
  const row = await withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    return loadOrgBooking(tx, orgId, bookingId);
  });
  const profiles = await profileIdsForUsers([row.booking.professionalUserId]);
  return { ...row, profileId: profiles.get(row.booking.professionalUserId) ?? null, policy: bookingPolicy(row.booking, row.proposal.freeCancellationDays) };
}

export async function listOrgBookings(userId: string, orgId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    return tx
      .select({ booking, title: requirement.title, name: user.name, feePaise: proposal.feePaise, participants: proposal.maxParticipants })
      .from(booking)
      .innerJoin(proposal, eq(proposal.id, booking.proposalId))
      .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
      .innerJoin(user, eq(user.id, booking.professionalUserId))
      .where(eq(booking.orgId, orgId))
      .orderBy(desc(booking.scheduledStart));
  });
}

export const rescheduleInput = z.object({
  newStart: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(500).default(""),
});

export async function rescheduleBooking(userId: string, orgId: string, bookingId: string, input: z.input<typeof rescheduleInput>) {
  const d = rescheduleInput.parse(input);
  assertUuid(bookingId, "Booking");
  const newStart = new Date(d.newStart);
  if (newStart.getTime() < Date.now() + DAY) throw badRequest("Choose a new time at least a day from now");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const { booking: b, proposal: p } = await loadOrgBooking(tx, orgId, bookingId);
    const policy = bookingPolicy(b, p.freeCancellationDays);
    if (!policy.canReschedule) throw badRequest(policy.rescheduleBlockedReason ?? "This booking can't be rescheduled");
    const [row] = await tx
      .update(booking)
      .set({ scheduledStart: newStart, rescheduleCount: b.rescheduleCount + 1 })
      .where(eq(booking.id, b.id))
      .returning();
    await audit(tx, { actorId: userId, action: "booking.reschedule", targetType: "booking", targetId: b.id, metadata: { from: b.scheduledStart.toISOString(), to: newStart.toISOString(), reason: d.reason } });
    await enqueue(tx, { type: "booking.rescheduled", payload: { bookingId: b.id, professionalUserId: b.professionalUserId, from: b.scheduledStart.toISOString(), to: newStart.toISOString(), reason: d.reason } });
    return row;
  });
}

export const cancelInput = z.object({ reason: z.string().trim().min(5, "Add a short reason for the professional").max(500) });

export async function cancelBooking(userId: string, orgId: string, bookingId: string, input: z.input<typeof cancelInput>) {
  const { reason } = cancelInput.parse(input);
  assertUuid(bookingId, "Booking");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const { booking: b, proposal: p } = await loadOrgBooking(tx, orgId, bookingId);
    const policy = bookingPolicy(b, p.freeCancellationDays);
    if (!policy.canCancel) throw badRequest("This booking can no longer be cancelled");
    const [row] = await tx
      .update(booking)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: userId, cancelReason: reason, cancelledLate: policy.cancelIsLate })
      .where(eq(booking.id, b.id))
      .returning();
    const { refundPaise } = await onBookingCancelled(tx, b.id, policy.cancelIsLate, userId);
    await audit(tx, { actorId: userId, action: "booking.cancel", targetType: "booking", targetId: b.id, metadata: { late: policy.cancelIsLate, reason, refundPaise } });
    await enqueue(tx, { type: "booking.cancelled", payload: { bookingId: b.id, professionalUserId: b.professionalUserId, reason, late: policy.cancelIsLate } });
    return { ...row, refundPaise };
  });
}

export async function completeBooking(userId: string, orgId: string, bookingId: string) {
  assertUuid(bookingId, "Booking");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const { booking: b, proposal: p } = await loadOrgBooking(tx, orgId, bookingId);
    if (!bookingPolicy(b, p.freeCancellationDays).canComplete) throw badRequest("A booking can be marked complete once the session has started");
    const [row] = await tx.update(booking).set({ status: "completed", completedAt: new Date() }).where(eq(booking.id, b.id)).returning();
    await audit(tx, { actorId: userId, action: "booking.complete", targetType: "booking", targetId: b.id });
    return row;
  });
}

export const locationInput = z.object({ location: z.string().trim().min(2, "Enter where the session happens").max(300) });

export async function updateBookingLocation(userId: string, orgId: string, bookingId: string, input: z.input<typeof locationInput>) {
  const { location } = locationInput.parse(input);
  assertUuid(bookingId, "Booking");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const { booking: b } = await loadOrgBooking(tx, orgId, bookingId);
    if (b.status === "cancelled" || b.status === "completed") throw badRequest(`This booking is ${b.status}`);
    const [row] = await tx.update(booking).set({ location }).where(eq(booking.id, b.id)).returning();
    return row;
  });
}

/** Everything the company dashboard shows, in one scoped transaction. */
export async function companyDashboard(userId: string, orgId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const reqs = await tx
      .select({
        requirement,
        categoryName: category.name,
        enquiries: sql<number>`(select count(*)::int from ${enquiry} e where e.requirement_id = ${requirement.id})`,
        proposals: sql<number>`(select count(*)::int from ${proposal} p where p.requirement_id = ${requirement.id} and p.status not in ('withdrawn'))`,
        toReview: sql<number>`(select count(*)::int from ${proposal} p where p.requirement_id = ${requirement.id} and p.status = 'submitted')`,
        bookingId: sql<string | null>`(select b.id from ${booking} b join ${proposal} p on p.id = b.proposal_id where p.requirement_id = ${requirement.id} limit 1)`,
      })
      .from(requirement)
      .innerJoin(category, eq(category.id, requirement.categoryId))
      .where(eq(requirement.orgId, orgId))
      .orderBy(desc(requirement.updatedAt));
    const upcoming = await tx
      .select({ booking, title: requirement.title, name: user.name, participants: proposal.maxParticipants, deliveryMode: requirement.deliveryMode })
      .from(booking)
      .innerJoin(proposal, eq(proposal.id, booking.proposalId))
      .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
      .innerJoin(user, eq(user.id, booking.professionalUserId))
      .where(and(eq(booking.orgId, orgId), inArray(booking.status, ["pending", "confirmed"]), gte(booking.scheduledStart, new Date(Date.now() - DAY))))
      .orderBy(asc(booking.scheduledStart))
      .limit(5);
    return {
      stats: {
        openRequirements: reqs.filter((r) => r.requirement.status === "published").length,
        drafts: reqs.filter((r) => r.requirement.status === "draft").length,
        proposalsToReview: reqs.reduce((n, r) => n + r.toReview, 0),
        upcomingSessions: upcoming.length,
      },
      requirements: reqs,
      upcoming,
    };
  });
}
