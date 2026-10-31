import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { makeUser } from "@/test/factories";
import { withScope, type DB } from "@/db/client";
import { auditLog, membership, orgDocument, stay } from "@/db/schema";
import { processOutbox } from "@/modules/platform/outbox";
import "@/modules/platform/handlers";
import { sentEmails } from "@/lib/email";
import { listBuyerOrgs } from "@/modules/organizations/service";
import { createRequirement } from "@/modules/marketplace/service";
import { categoryBySlug } from "@/test/factories";
import {
  decideListing,
  editOrganization,
  getListingForReview,
  getOrganizationDetail,
  listListingQueue,
  listOrganizations,
  openOrgDocument,
  removeOrganization,
  suspendOrganization,
  unsuspendOrganization,
  type StaffActor,
} from "@/modules/admin/service";
import { ORG_SUSPENDED } from "@/modules/organizations/service";
import {
  addPhoto,
  createListingOrg,
  directoryCounts,
  getBookableHomestay,
  getListingWorkspace,
  getPublicListing,
  listDirectory,
  listingsForUser,
  openListingPhoto,
  openOwnDocument,
  submitListing,
  updateListing,
  uploadDocument,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let host: { id: string; email: string; emailVerified: boolean };
let hospitalAdmin: { id: string; email: string; emailVerified: boolean };
let stranger: { id: string };
let ops: StaffActor;
let stayId: string, stayslug: string, hospId: string, hospSlug: string;

const pdf = () => new File([new Uint8Array([37, 80, 68, 70, 45])], "doc.pdf", { type: "application/pdf" });
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" });
const ABOUT = "A quiet garden home ten minutes from the hospital, with a ground-floor room and a kitchen for special diets.";

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  host = await makeUser(db, "host@example.test", "Asha Host");
  hospitalAdmin = await makeUser(db, "desk@aranya.test", "Ravi Desk");
  stranger = await makeUser(db);
  const staff = await makeUser(db, "ops@opseros.com");
  ops = { id: staff.id, platformRole: "ops", twoFactorEnabled: true };
});
afterAll(() => t.close());

describe("homestay: sign up, verify, appear", () => {
  it("creates the organisation, owner membership and a draft listing", async () => {
    const org = await createListingOrg(host, { kind: "homestay", name: "Aranya Garden Stay", city: "Mysuru" });
    stayId = org.id;
    stayslug = org.slug;
    expect(org.kind).toBe("homestay");
    const w = await getListingWorkspace(host.id, stayId);
    expect(w.listing.status).toBe("draft");
    expect(w.role).toBe("owner");
    expect(w.canSubmit).toBe(false);
    expect(await listingsForUser(host.id)).toMatchObject([{ orgId: stayId, kind: "homestay", status: "draft" }]);
  });

  it("is not a company: no Company menu, no requirements", async () => {
    expect(await listBuyerOrgs(host.id)).toHaveLength(0);
    const cat = await categoryBySlug(db, "yoga-mindfulness");
    await expect(
      createRequirement(host.id, stayId, { title: "Retreat", categoryId: cat.id, city: "Mysuru", deliveryMode: "in_person", participants: 5, budgetMinRupees: 1000, budgetMaxRupees: 2000 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("outsiders can't see the workspace, upload, or read documents", async () => {
    await expect(getListingWorkspace(stranger.id, stayId)).rejects.toMatchObject({ status: 404 });
    await expect(uploadDocument(stranger.id, stayId, { docType: "registration" }, pdf())).rejects.toMatchObject({ status: 403 });
    await expect(getPublicListing(stranger.id, "homestay", stayslug)).rejects.toMatchObject({ status: 404 });
    await expect(getPublicListing(null, "homestay", stayslug)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses to submit until the checklist is complete", async () => {
    await expect(submitListing(host.id, stayId)).rejects.toMatchObject({ status: 400 });
    await updateListing(host.id, stayId, { name: "Aranya Garden Stay", city: "Mysuru", about: ABOUT, rooms: 3, maxGuests: 6, priceFromRupees: 3200, features: ["step_free", "diet_kitchen"], contactPhone: "+91 98450 00000" });
    await uploadDocument(host.id, stayId, { docType: "registration" }, pdf());
    await uploadDocument(host.id, stayId, { docType: "owner_id" }, pdf());
    await expect(uploadDocument(host.id, stayId, { docType: "accreditation" }, pdf())).rejects.toMatchObject({ status: 400 });
    await expect(uploadDocument(host.id, stayId, { docType: "property_proof" }, new File(["x"], "a.exe", { type: "application/x-msdownload" }))).rejects.toMatchObject({ status: 400 });
    await uploadDocument(host.id, stayId, { docType: "property_proof" }, pdf());
    await addPhoto(host.id, stayId, png());
    await addPhoto(host.id, stayId, png());
    let w = await getListingWorkspace(host.id, stayId);
    expect(w.readiness.find((i) => i.key === "photos")?.done).toBe(false);
    await expect(submitListing(host.id, stayId)).rejects.toThrow(/at least 3 photos/);
    await addPhoto(host.id, stayId, png());
    w = await getListingWorkspace(host.id, stayId);
    expect(w.canSubmit).toBe(true);
    const row = await submitListing(host.id, stayId);
    expect(row.status).toBe("pending");
    expect(await listDirectory("homestay")).toHaveLength(0);
  });

  it("documents are private to the organisation at the database level", async () => {
    const other = await createListingOrg({ ...(await makeUser(db)), emailVerified: true }, { kind: "homestay", name: "Other Stay", city: "Ooty" });
    const leaked = await withScope({ userId: stranger.id, orgId: other.id }, (tx) => tx.select().from(orgDocument));
    expect(leaked).toHaveLength(0);
    expect(await db.select().from(orgDocument)).toHaveLength(0); // no scope = no rows
    const docs = await withScope({ userId: host.id, orgId: stayId }, (tx) => tx.select().from(orgDocument));
    expect(docs).toHaveLength(3);
    await expect(openOwnDocument(stranger.id, stayId, docs[0].id)).rejects.toMatchObject({ status: 403 });
    expect(await openOwnDocument(host.id, stayId, docs[0].id)).toBe(docs[0].blobPath);
  });

  it("unverified photos are private; staff can open documents (audited)", async () => {
    const w = await getListingWorkspace(host.id, stayId);
    await expect(openListingPhoto(null, w.photos[0].id)).rejects.toMatchObject({ status: 404 });
    await expect(openListingPhoto(stranger.id, w.photos[0].id)).rejects.toMatchObject({ status: 404 });
    expect((await openListingPhoto(host.id, w.photos[0].id)).isPublic).toBe(false);
    const review = await getListingForReview(ops, stayId);
    await openOrgDocument(ops, review.docs[0].id);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "org_document.view"))).toHaveLength(1);
  });

  it("staff must tick every check to approve; then it appears, without contact details", async () => {
    expect((await listListingQueue(ops)).map((r) => r.orgId)).toEqual([stayId]);
    await expect(decideListing(ops, stayId, { decision: "approved", checked: ["details", "photos", "registration"] })).rejects.toThrow(/Tick every check/);
    await expect(decideListing(ops, stayId, { decision: "changes_requested", note: "" })).rejects.toBeTruthy();
    sentEmails.length = 0;
    await decideListing(ops, stayId, { decision: "approved", checked: ["details", "photos", "registration", "owner_id", "property_proof"] });
    await processOutbox();
    expect(sentEmails.some((e) => e.to === host.email && /verified/.test(e.subject))).toBe(true);
    const dir = await listDirectory("homestay", { city: "mys" });
    expect(dir.map((d) => d.name)).toEqual(["Aranya Garden Stay"]);
    expect(dir[0].listing).not.toHaveProperty("contactPhone");
    expect(dir[0].listing).not.toHaveProperty("contactEmail");
    expect(dir[0].photoId).toBeTruthy();
    expect(await listDirectory("homestay", { feature: "caregiver_room" })).toHaveLength(0);
    expect(await listDirectory("homestay", { feature: "step_free" })).toHaveLength(1);
    expect((await getPublicListing(null, "homestay", stayslug)).isPublic).toBe(true);
    expect((await openListingPhoto(null, dir[0].photoId!)).isPublic).toBe(true);
    expect(await directoryCounts()).toEqual({ homestays: 1, hospitals: 0 });
    const docs = await withScope({ userId: host.id, orgId: stayId }, (tx) => tx.select().from(orgDocument));
    expect(docs.every((d) => d.status === "approved")).toBe(true);
  });
});

describe("hospital: accreditation shown only once checked", () => {
  it("goes through changes requested, then verified with checked accreditation", async () => {
    const org = await createListingOrg(hospitalAdmin, { kind: "hospital", name: "Aranya Multispeciality Hospital", city: "Bengaluru" });
    hospId = org.id;
    hospSlug = org.slug;
    await updateListing(hospitalAdmin.id, hospId, {
      name: "Aranya Multispeciality Hospital",
      city: "Bengaluru",
      about: "Multispeciality hospital with an international patient desk, orthopaedics and cardiac care.",
      specialties: "Orthopaedics, Cardiology, Orthopaedics",
      accreditations: ["NABH", "JCI"],
      serves: "both",
      internationalDesk: true,
      visaLetter: true,
      rooms: 9, // ignored for hospitals
    });
    let w = await getListingWorkspace(hospitalAdmin.id, hospId);
    expect(w.listing.specialties).toEqual(["Orthopaedics", "Cardiology"]);
    expect(w.listing.rooms).toBeNull();
    await uploadDocument(hospitalAdmin.id, hospId, { docType: "registration" }, pdf());
    await uploadDocument(hospitalAdmin.id, hospId, { docType: "authorisation" }, pdf());
    await addPhoto(hospitalAdmin.id, hospId, png());
    w = await getListingWorkspace(hospitalAdmin.id, hospId);
    expect(w.canSubmit).toBe(true); // accreditation certificate is optional
    await submitListing(hospitalAdmin.id, hospId);
    await decideListing(ops, hospId, { decision: "changes_requested", note: "Please upload your NABH certificate." });
    await expect(getPublicListing(null, "hospital", hospSlug)).rejects.toMatchObject({ status: 404 });
    await uploadDocument(hospitalAdmin.id, hospId, { docType: "accreditation" }, pdf());
    await submitListing(hospitalAdmin.id, hospId);
    // The accreditation certificate is now on file, so its check is required too.
    await expect(decideListing(ops, hospId, { decision: "approved", checked: ["details", "photos", "registration", "authorisation"] })).rejects.toThrow(/Tick every check/);
    await decideListing(ops, hospId, { decision: "approved", checked: ["details", "photos", "registration", "authorisation", "accreditation"] });
    const page = await getPublicListing(null, "hospital", hospSlug);
    expect(page.listing.accreditations).toEqual(["NABH", "JCI"]);
    expect((await listDirectory("hospital", { specialty: "cardiology", international: true })).map((d) => d.name)).toEqual(["Aranya Multispeciality Hospital"]);
  });

  it("changing accreditations hides them again until staff check", async () => {
    await updateListing(hospitalAdmin.id, hospId, {
      name: "Aranya Multispeciality Hospital",
      city: "Bengaluru",
      about: "Multispeciality hospital with an international patient desk, orthopaedics and cardiac care.",
      specialties: ["Orthopaedics", "Cardiology"],
      accreditations: ["NABH", "JCI", "NABL"],
    });
    expect((await getPublicListing(null, "hospital", hospSlug)).listing.accreditations).toEqual([]);
  });

  it("staff can take a verified listing down; team members other than admins can't edit", async () => {
    const member = await makeUser(db);
    await db.insert(membership).values({ orgId: hospId, userId: member.id, role: "member", status: "active" });
    expect((await getListingWorkspace(member.id, hospId)).canEdit).toBe(false);
    await expect(updateListing(member.id, hospId, { name: "X Hospital", city: "Bengaluru" })).rejects.toMatchObject({ status: 403 });
    await decideListing(ops, hospId, { decision: "rejected", note: "Registration expired." });
    expect(await listDirectory("hospital")).toHaveLength(0);
    await expect(submitListing(hospitalAdmin.id, hospId)).rejects.toMatchObject({ status: 400 });
  });
});

describe("staff: edit, suspend and remove an organisation", () => {
  let superAdmin: StaffActor;
  beforeAll(async () => {
    const s = await makeUser(db, "boss@opseros.com");
    superAdmin = { id: s.id, platformRole: "super_admin", twoFactorEnabled: true };
  });

  it("queues and the organisations list keep homestays and hospitals apart", async () => {
    expect(new Set((await listListingQueue(ops, "all", "homestay")).map((r) => r.kind))).toEqual(new Set(["homestay"]));
    expect(new Set((await listListingQueue(ops, "all", "hospital")).map((r) => r.kind))).toEqual(new Set(["hospital"]));
    const kinds = (await listOrganizations(ops)).map((o) => o.kind);
    expect(kinds).toEqual(expect.arrayContaining(["homestay", "hospital"]));
  });

  it("only super admins can change an organisation", async () => {
    await expect(suspendOrganization(ops, stayId, { reason: "Guest complaints" })).rejects.toMatchObject({ status: 403 });
    await expect(editOrganization(ops, stayId, { name: "Hacked" })).rejects.toMatchObject({ status: 403 });
    await expect(removeOrganization(ops, stayId, "Aranya Garden Stay")).rejects.toMatchObject({ status: 403 });
  });

  it("edits details without touching verification, and logs which fields changed", async () => {
    await expect(editOrganization(superAdmin, stayId, { name: "Aranya Garden Stay", contactEmail: "not-an-email" })).rejects.toThrow(/valid contact email/);
    await editOrganization(superAdmin, stayId, { name: "Aranya Garden Homestay", contactEmail: "stay@aranya.test", area: "Gokulam" });
    const d = await getOrganizationDetail(ops, stayId);
    expect(d.org.name).toBe("Aranya Garden Homestay");
    expect(d.listing).toMatchObject({ status: "verified", contactEmail: "stay@aranya.test", area: "Gokulam" });
    const [log] = await db.select().from(auditLog).where(eq(auditLog.action, "organization.edit"));
    expect(log.metadata).toMatchObject({ fields: ["name", "area", "contactEmail"] });
  });

  it("suspension hides the listing, stops bookings and closes the workspace until lifted", async () => {
    await expect(suspendOrganization(superAdmin, stayId, { reason: "no" })).rejects.toThrow(/at least 5/);
    await suspendOrganization(superAdmin, stayId, { reason: "Safety complaint under review" });
    await expect(suspendOrganization(superAdmin, stayId, { reason: "Safety complaint under review" })).rejects.toMatchObject({ status: 400 });
    expect(await listDirectory("homestay")).toHaveLength(0);
    expect((await directoryCounts()).homestays).toBe(0);
    await expect(getPublicListing(null, "homestay", stayslug)).rejects.toMatchObject({ status: 404 });
    expect((await getBookableHomestay(stayId))?.verified).toBe(false);
    await expect(getListingWorkspace(host.id, stayId)).rejects.toThrow(ORG_SUSPENDED);
    await expect(updateListing(host.id, stayId, { name: "Back again", city: "Mysuru" })).rejects.toThrow(ORG_SUSPENDED);
    expect(await listingsForUser(host.id)).toMatchObject([{ orgId: stayId, suspended: true }]);
    expect((await listOrganizations(ops, "", "suspended")).map((o) => o.id)).toEqual([stayId]);

    await unsuspendOrganization(superAdmin, stayId);
    expect((await listDirectory("homestay")).map((d) => d.name)).toEqual(["Aranya Garden Homestay"]);
    expect((await getListingWorkspace(host.id, stayId)).listing.status).toBe("verified");
  });

  it("removal waits for open stays, needs the exact name, then closes it for good", async () => {
    const guest = await makeUser(db);
    const [s] = await withScope({ bypass: true, userId: superAdmin.id }, (tx) =>
      tx
        .insert(stay)
        .values({ orgId: stayId, guestUserId: guest.id, checkIn: "2030-01-10", checkOut: "2030-01-12", nights: 2, purpose: "rest", respondBy: new Date(Date.now() + 86400000), nightly: [], gstParts: [], subtotalPaise: 0, gstPaise: 0, totalPaise: 0, commissionPaise: 0, payablePaise: 0, cancellationPolicy: "moderate", idempotencyKey: "rm-test" })
        .returning(),
    );
    expect((await getOrganizationDetail(superAdmin, stayId)).openWork).toBe("1 open stay");
    await expect(removeOrganization(superAdmin, stayId, "Aranya Garden Homestay")).rejects.toThrow(/1 open stay/);
    await withScope({ bypass: true, userId: superAdmin.id }, (tx) => tx.update(stay).set({ status: "declined" }).where(eq(stay.id, s.id)));

    await expect(removeOrganization(superAdmin, stayId, "aranya")).rejects.toThrow(/exactly/);
    await removeOrganization(superAdmin, stayId, "Aranya Garden Homestay");
    expect(await db.select().from(membership).where(eq(membership.orgId, stayId))).toHaveLength(0);
    await expect(getListingWorkspace(host.id, stayId)).rejects.toMatchObject({ status: 404 });
    await expect(getPublicListing(host.id, "homestay", stayslug)).rejects.toMatchObject({ status: 404 });
    expect(await listingsForUser(host.id)).toHaveLength(0);
    expect((await listOrganizations(ops, "", "removed")).map((o) => o.id)).toEqual([stayId]);
    expect((await listOrganizations(ops, "", "active")).map((o) => o.id)).not.toContain(stayId);
    await expect(editOrganization(superAdmin, stayId, { name: "Revived" })).rejects.toMatchObject({ status: 404 });
    // The stay record is kept.
    expect(await withScope({ bypass: true, userId: superAdmin.id }, (tx) => tx.select().from(stay).where(eq(stay.id, s.id)))).toHaveLength(1);
  });
});
