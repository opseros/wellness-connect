import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { booking, enquiry, proposal, requirement } from "@/db/schema";
import { withScope } from "@/db/client";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
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
