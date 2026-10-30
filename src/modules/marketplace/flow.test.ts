import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { categoryBySlug, makeProfessional, makeUser } from "@/test/factories";
import { withScope, type DB } from "@/db/client";
import { booking, ledgerEntry, outbox, proposal } from "@/db/schema";
import { createOrganization } from "@/modules/organizations/service";
import { acceptProposal, createRequirement, getMatches, sendEnquiries, submitProposal } from "./service";
import { processOutbox } from "@/modules/platform/outbox";
import "@/modules/platform/handlers";
import { sentEmails } from "@/lib/email";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});
afterAll(() => t.close());

describe("requirement → match → enquiry → proposal → booking", () => {
  it("runs end to end with hard filters, idempotency and the outbox", async () => {
    const buyer = await makeUser(db, "hr@acme-corp.in", "Priya");
    const org = await createOrganization({ ...buyer, emailVerified: true }, { name: "Acme Corp" });
    expect(org.domain).toBe("acme-corp.in");
    const cat = await categoryBySlug(db, "yoga-mindfulness");

    const ananya = await makeProfessional(db, { categoryId: cat.id, name: "Ananya", years: 9 });
    const karthik = await makeProfessional(db, { categoryId: cat.id, name: "Karthik", years: 6, priceMin: 28_000, priceMax: 38_000 });
    const unverified = await makeProfessional(db, { categoryId: cat.id, name: "Unverified", verified: false });
    const elsewhere = await makeProfessional(db, { categoryId: cat.id, name: "Mumbai", city: "Mumbai" });

    const req = await createRequirement(buyer.id, org.id, {
      title: "Mindfulness workshop: Q1 kickoff",
      categoryId: cat.id,
      city: "Bengaluru",
      deliveryMode: "in_person",
      participants: 80,
      budgetMinRupees: 30_000,
      budgetMaxRupees: 50_000,
      publish: true,
    });

    const m = await getMatches(buyer.id, org.id, req.id);
    expect(m.matches.map((x) => x.candidate.name)).toEqual(["Ananya", "Karthik"]);
    const excluded = Object.fromEntries(m.excluded.map((e) => [e.userId, e.reasons]));
    expect(excluded[unverified.user.id]).toContain("not_verified");
    expect(excluded[elsewhere.user.id]).toContain("location");

    await expect(sendEnquiries(buyer.id, org.id, req.id, [unverified.user.id])).rejects.toMatchObject({ status: 400 });
    const enq = await sendEnquiries(buyer.id, org.id, req.id, [ananya.user.id, karthik.user.id]);
    expect(enq).toHaveLength(2);

    // A professional who got no enquiry cannot propose.
    await expect(
      submitProposal(elsewhere.user.id, req.id, { feeRupees: 1000, proposedStart: "2027-01-15T10:00:00+05:30", maxParticipants: 80 }),
    ).rejects.toMatchObject({ status: 403 });

    const pa = await submitProposal(ananya.user.id, req.id, { feeRupees: 40_000, proposedStart: "2027-01-15T10:00:00+05:30", maxParticipants: 100 });
    await submitProposal(karthik.user.id, req.id, { feeRupees: 32_000, proposedStart: "2027-01-15T14:00:00+05:30", maxParticipants: 80 });
    expect(pa.feePaise).toBe(4_000_000);

    const b1 = await acceptProposal(buyer.id, org.id, pa.id, "accept-key-0001");
    const b2 = await acceptProposal(buyer.id, org.id, pa.id, "accept-key-0001");
    expect(b2.id).toBe(b1.id);

    const all = await withScope({ userId: null, bypass: true }, async (tx) => ({
      proposals: await tx.select().from(proposal),
      bookings: await tx.select().from(booking),
      events: await tx.select().from(outbox),
    }));
    expect(all.bookings).toHaveLength(1);
    expect(all.proposals.find((p) => p.id === pa.id)?.status).toBe("accepted");
    expect(all.proposals.find((p) => p.id !== pa.id)?.status).toBe("rejected");
    expect(all.events.map((e) => e.type).sort()).toEqual(["booking.created", "enquiry.sent", "enquiry.sent", "proposal.not_selected", "proposal.submitted", "proposal.submitted"]);

    const run = await processOutbox();
    expect(run).toEqual({ processed: 6, failed: 0 });
    expect(sentEmails.filter((e) => e.to === ananya.user.email).map((e) => e.subject)).toContain("Your proposal was accepted");
    expect((await processOutbox()).processed).toBe(0);
  });

  it("the ledger is append-only", async () => {
    const [b] = await withScope({ userId: null, bypass: true }, (tx) => tx.select().from(booking));
    await withScope({ userId: null, bypass: true }, (tx) =>
      tx.insert(ledgerEntry).values({ bookingId: b.id, orgId: b.orgId, entryType: "gross", amountPaise: 4_000_000 }),
    );
    await expect(withScope({ userId: null, bypass: true }, (tx) => tx.update(ledgerEntry).set({ amountPaise: 1 }))).rejects.toThrow();
    await expect(withScope({ userId: null, bypass: true }, (tx) => tx.delete(ledgerEntry))).rejects.toThrow();
  });
});
