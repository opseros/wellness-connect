import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { categoryBySlug, makeProfessional, makeUser } from "@/test/factories";
import { withScope, type DB } from "@/db/client";
import { membership, organization, orgDocument, proposal, requirement, stay, stayLedgerEntry } from "@/db/schema";
import { createRequirement, listOrgRequirements, getMatches, sendEnquiries } from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let alice: { id: string }, bob: { id: string };
let orgA: string, orgB: string, catId: string;

async function makeOrg(owner: string, name: string) {
  const [o] = await db.insert(organization).values({ name, slug: name.toLowerCase() }).returning();
  await db.insert(membership).values({ orgId: o.id, userId: owner, role: "owner", status: "active" });
  return o.id;
}

const draft = (title: string) => ({
  title,
  categoryId: catId,
  city: "Bengaluru",
  deliveryMode: "in_person" as const,
  participants: 50,
  budgetMinRupees: 30_000,
  budgetMaxRupees: 50_000,
});

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  alice = await makeUser(db);
  bob = await makeUser(db);
  orgA = await makeOrg(alice.id, "Alpha");
  orgB = await makeOrg(bob.id, "Beta");
  catId = (await categoryBySlug(db, "yoga-mindfulness")).id;
});
afterAll(() => t.close());

describe("tenant isolation (row-level security)", () => {
  it("an org only sees its own requirements", async () => {
    await createRequirement(alice.id, orgA, draft("Alpha secret draft"));
    await createRequirement(bob.id, orgB, draft("Beta draft"));
    const a = await listOrgRequirements(alice.id, orgA);
    expect(a.map((r) => r.title)).toEqual(["Alpha secret draft"]);
  });

  it("the database itself hides another org's drafts, even with a raw query", async () => {
    const rows = await withScope({ userId: bob.id, orgId: orgB }, (tx) => tx.select().from(requirement));
    expect(rows.map((r) => r.title)).toEqual(["Beta draft"]);
  });

  it("no scope set means no tenant rows at all", async () => {
    const rows = await db.select().from(requirement);
    expect(rows).toHaveLength(0);
  });

  it("cannot write into another org", async () => {
    await expect(
      withScope({ userId: bob.id, orgId: orgB }, (tx) =>
        tx.insert(requirement).values({ ...{ orgId: orgA, createdBy: bob.id, title: "Injected", categoryId: catId, deliveryMode: "virtual", participants: 1, budgetMinPaise: 1, budgetMaxPaise: 2 } }),
      ),
    ).rejects.toThrow();
  });

  it("app-level role check blocks non-members even before RLS", async () => {
    await expect(listOrgRequirements(bob.id, orgA)).rejects.toMatchObject({ status: 403 });
    await expect(createRequirement(bob.id, orgA, draft("nope"))).rejects.toMatchObject({ status: 403 });
  });

  it("even published requirements are private until a professional is sent an enquiry", async () => {
    const pub = await createRequirement(alice.id, orgA, { ...draft("Alpha published"), publish: true });
    const pro = await makeProfessional(db, { categoryId: catId });
    const before = await withScope({ userId: pro.user.id }, (tx) => tx.select().from(requirement));
    expect(before).toHaveLength(0);
    await sendEnquiries(alice.id, orgA, pub.id, [pro.user.id]);
    const after = await withScope({ userId: pro.user.id }, (tx) => tx.select().from(requirement));
    expect(after.map((r) => r.id)).toEqual([pub.id]);
  });

  it("a professional sees only their own proposals", async () => {
    const pub = (await listOrgRequirements(alice.id, orgA)).find((r) => r.status === "published")!;
    const p1 = await makeProfessional(db, { categoryId: catId });
    const p2 = await makeProfessional(db, { categoryId: catId });
    await withScope({ userId: null, bypass: true }, (tx) =>
      tx.insert(proposal).values([
        { requirementId: pub.id, orgId: orgA, professionalUserId: p1.user.id, feePaise: 1, proposedStart: new Date(), maxParticipants: 1 },
        { requirementId: pub.id, orgId: orgA, professionalUserId: p2.user.id, feePaise: 2, proposedStart: new Date(), maxParticipants: 1 },
      ]),
    );
    const mine = await withScope({ userId: p1.user.id }, (tx) => tx.select().from(proposal));
    expect(mine).toHaveLength(1);
    expect(mine[0].professionalUserId).toBe(p1.user.id);
    const org = await withScope({ userId: alice.id, orgId: orgA }, (tx) => tx.select().from(proposal).where(eq(proposal.orgId, orgA)));
    expect(org).toHaveLength(2);
  });

  it("matching for another org's requirement is refused", async () => {
    const pub = (await listOrgRequirements(alice.id, orgA)).find((r) => r.status === "published")!;
    await expect(getMatches(bob.id, orgB, pub.id)).rejects.toMatchObject({ status: 404 });
  });

  it("homestay/hospital verification documents stay inside their organisation", async () => {
    await withScope({ userId: alice.id, orgId: orgA }, (tx) =>
      tx.insert(orgDocument).values({ orgId: orgA, docType: "registration", name: "Licence", blobPath: "x.pdf", uploadedBy: alice.id }),
    );
    expect(await withScope({ userId: bob.id, orgId: orgB }, (tx) => tx.select().from(orgDocument))).toHaveLength(0);
    await expect(
      withScope({ userId: bob.id, orgId: orgB }, (tx) => tx.insert(orgDocument).values({ orgId: orgA, docType: "registration", name: "Fake", blobPath: "y.pdf", uploadedBy: bob.id })),
    ).rejects.toThrow();
  });

  it("homestay stays are visible only to the host's org and the guest; guests can't read the ledger split", async () => {
    const g = await makeUser(db);
    const [st] = await withScope({ userId: null, bypass: true }, (tx) =>
      tx
        .insert(stay)
        .values({ orgId: orgA, guestUserId: g.id, checkIn: "2027-03-15", checkOut: "2027-03-17", nights: 2, purpose: "rest", respondBy: new Date(), nightly: [], gstParts: [], subtotalPaise: 100, gstPaise: 5, totalPaise: 105, commissionPaise: 12, payablePaise: 88, cancellationPolicy: "moderate", idempotencyKey: "iso-stay" })
        .returning(),
    );
    await withScope({ userId: null, bypass: true }, (tx) => tx.insert(stayLedgerEntry).values({ stayId: st.id, orgId: orgA, guestUserId: g.id, entryType: "platform_commission", amountPaise: 12 }));
    expect(await withScope({ userId: bob.id, orgId: orgB }, (tx) => tx.select().from(stay))).toHaveLength(0);
    expect(await withScope({ userId: alice.id, orgId: orgA }, (tx) => tx.select().from(stay))).toHaveLength(1);
    expect(await withScope({ userId: g.id }, (tx) => tx.select().from(stay))).toHaveLength(1);
    expect(await withScope({ userId: g.id }, (tx) => tx.select().from(stayLedgerEntry))).toHaveLength(0);
    expect(await withScope({ userId: alice.id, orgId: orgA }, (tx) => tx.select().from(stayLedgerEntry))).toHaveLength(1);
  });
});
