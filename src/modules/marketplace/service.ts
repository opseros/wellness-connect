import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { booking, category, enquiry, organization, proposal, requirement } from "@/db/schema";
import { withScope } from "@/db/client";
import { assertUuid, badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { enqueue, audit } from "@/modules/platform/outbox";
import { ORG_BUYERS, requireOrgRole } from "@/modules/organizations/service";
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
    const eligible = new Set(matches.map((m) => m.candidate.userId));
    const rejected = professionalUserIds.filter((id) => !eligible.has(id));
    if (rejected.length) throw badRequest("Some professionals don't meet this requirement's must-haves");
    const rows = await tx
      .insert(enquiry)
      .values(professionalUserIds.map((pid) => ({ requirementId, orgId, professionalUserId: pid })))
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
    if (p.status !== "submitted") throw conflict(`Proposal is ${p.status}`);
    await tx.update(proposal).set({ status: "accepted", updatedAt: new Date() }).where(eq(proposal.id, p.id));
    await tx
      .update(proposal)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(proposal.requirementId, p.requirementId), ne(proposal.id, p.id), eq(proposal.status, "submitted")));
    await tx.update(requirement).set({ status: "closed", updatedAt: new Date() }).where(eq(requirement.id, p.requirementId));
    const [b] = await tx
      .insert(booking)
      .values({ proposalId: p.id, orgId, professionalUserId: p.professionalUserId, scheduledStart: p.proposedStart, idempotencyKey })
      .returning();
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
    return tx
      .select({ booking, title: requirement.title, orgName: organization.name, feePaise: proposal.feePaise, currency: proposal.currency, participants: proposal.maxParticipants })
      .from(booking)
      .innerJoin(proposal, eq(proposal.id, booking.proposalId))
      .innerJoin(requirement, eq(requirement.id, proposal.requirementId))
      .innerJoin(organization, eq(organization.id, booking.orgId))
      .where(eq(booking.professionalUserId, proUserId))
      .orderBy(desc(booking.scheduledStart));
  });
}

/**
 * Earnings from agreed fees. Until payments go live (M4) this is the value of
 * booked work, not money paid out; the page says so.
 */
export function summarizeEarnings(rows: { booking: { status: string }; feePaise: number }[]) {
  const sum = (pred: (s: string) => boolean) => rows.filter((r) => pred(r.booking.status)).reduce((t, r) => t + r.feePaise, 0);
  return {
    completedPaise: sum((s) => s === "completed"),
    upcomingPaise: sum((s) => s === "pending" || s === "confirmed" || s === "in_progress"),
    cancelledPaise: sum((s) => s === "cancelled"),
    bookingCount: rows.filter((r) => r.booking.status !== "cancelled").length,
  };
}
