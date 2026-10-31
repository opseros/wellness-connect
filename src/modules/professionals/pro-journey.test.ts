import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { categoryBySlug, makeProfessional, makeUser } from "@/test/factories";
import type { DB } from "@/db/client";
import { credential, user } from "@/db/schema";
import { sentEmails } from "@/lib/email";
import { createOrganization } from "@/modules/organizations/service";
import { decideCredential, suspendUser, type StaffActor } from "@/modules/admin/service";
import { processOutbox } from "@/modules/platform/outbox";
import "@/modules/platform/handlers";
import {
  acceptProposal,
  createRequirement,
  declineEnquiry,
  getMatches,
  getMyEnquiry,
  listMyBookings,
  listMyEnquiries,
  listMyProposals,
  sendEnquiries,
  submitProposal,
  summarizeEarnings,
  withdrawProposal,
} from "@/modules/marketplace/service";
import {
  addService,
  getProDashboard,
  getPublicProfile,
  listOwnCredentials,
  listOwnServices,
  profileChecklist,
  resubmitCredential,
  setServiceActive,
  submitCredential,
  updateService,
  upsertProfessionalProfile,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let ops: StaffActor;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  const o = await makeUser(db, "ops@opseros.com");
  ops = { id: o.id, platformRole: "ops", twoFactorEnabled: true };
});
afterAll(() => t.close());

const bio = "I run evidence-based mindfulness programs for teams across Bengaluru and online.";

describe("a new professional, from sign-up to answering an enquiry", () => {
  it("completes the checklist, gets verified, is matched and proposes", async () => {
    const cat = await categoryBySlug(db, "yoga-mindfulness");
    const pro = await makeUser(db, "meera@example.test", "Meera Iyer");

    // 1. Profile
    const profile = await upsertProfessionalProfile(pro.id, {
      headline: "Mindfulness coach",
      bio,
      city: "Bengaluru",
      yearsExperience: 7,
      languages: ["English", "Kannada"],
      deliveryModes: ["in_person", "virtual"],
      categoryIds: [cat.id],
    });
    let dash = (await getProDashboard(pro.id))!;
    expect(dash.items.filter((i) => !i.done).map((i) => i.key)).toEqual(["service", "credential", "verified"]);

    // 2. Service, edited and validated
    const svc = await addService(pro.id, {
      categoryId: cat.id,
      title: "Mindful mornings",
      deliveryModes: ["in_person"],
      durationMinutes: 60,
      priceMinRupees: 20_000,
      priceMaxRupees: 30_000,
    });
    await expect(
      updateService(pro.id, svc.id, { categoryId: cat.id, title: "Bad", deliveryModes: ["virtual"], durationMinutes: 60, priceMinRupees: 50_000, priceMaxRupees: 10 }),
    ).rejects.toThrow();
    const edited = await updateService(pro.id, svc.id, {
      categoryId: cat.id,
      title: "Mindful mornings for teams",
      deliveryModes: ["in_person", "virtual"],
      durationMinutes: 90,
      priceMinRupees: 30_000,
      priceMaxRupees: 45_000,
    });
    expect(edited.priceMaxPaise).toBe(4_500_000);

    // 3. Credential: info requested, resubmitted, approved
    const cred = await submitCredential(pro.id, { name: "MBSR teacher certificate", issuer: "Brown University", blobPath: "credentials/x/1.pdf" });
    expect((await getProDashboard(pro.id))!.profile.verificationStatus).toBe("pending");
    await expect(resubmitCredential(pro.id, cred.id, { blobPath: "credentials/x/2.pdf" })).rejects.toMatchObject({ status: 400 });
    await decideCredential(ops, cred.id, { decision: "info_requested", note: "The scan is cut off; upload the full page." });
    const [listed] = await listOwnCredentials(pro.id);
    expect(listed).toMatchObject({ status: "info_requested", reviewNote: "The scan is cut off; upload the full page." });
    expect(listed).not.toHaveProperty("blobPath");
    await resubmitCredential(pro.id, cred.id, { blobPath: "credentials/x/2.pdf" });
    expect((await db.query.credential.findFirst({ where: eq(credential.id, cred.id) }))?.status).toBe("pending");
    await decideCredential(ops, cred.id, { decision: "approved" });
    await processOutbox();
    expect(sentEmails.filter((e) => e.to === pro.email).map((e) => e.text).join()).toContain("/pro/credentials");

    dash = (await getProDashboard(pro.id))!;
    expect(dash.percent).toBe(100);
    expect(dash.discoverable).toBe(true);

    // 4. Discoverable: public profile and matching
    const someone = await makeUser(db);
    const pub = await getPublicProfile(someone.id, profile.id);
    expect(pub.services.map((s) => s.service.title)).toEqual(["Mindful mornings for teams"]);
    expect(pub.credentials).toEqual([{ name: "MBSR teacher certificate", issuer: "Brown University" }]);

    const buyer = await makeUser(db, "hr@zeta-labs.in", "Rohan");
    const org = await createOrganization({ ...buyer, emailVerified: true }, { name: "Zeta Labs" });
    const req = await createRequirement(buyer.id, org.id, {
      title: "Team mindfulness series",
      categoryId: cat.id,
      city: "Bengaluru",
      deliveryMode: "in_person",
      participants: 40,
      budgetMinRupees: 30_000,
      budgetMaxRupees: 50_000,
      publish: true,
    });
    const m = await getMatches(buyer.id, org.id, req.id);
    expect(m.matches.map((x) => x.candidate.userId)).toContain(pro.id);
    await sendEnquiries(buyer.id, org.id, req.id, [pro.id]);

    // 5. Inbox → open (marks viewed) → propose
    const [inbox] = await listMyEnquiries(pro.id);
    expect(inbox).toMatchObject({ title: "Team mindfulness series", orgName: "Zeta Labs", status: "sent" });
    const opened = await getMyEnquiry(pro.id, inbox.id);
    expect(opened.enquiry.status).toBe("viewed");
    expect(opened.canPropose).toBe(true);
    const outsider = await makeUser(db);
    await expect(getMyEnquiry(outsider.id, inbox.id)).rejects.toMatchObject({ status: 404 });

    const prop = await submitProposal(pro.id, req.id, { feeRupees: 42_000, proposedStart: "2027-02-01T10:00:00+05:30", maxParticipants: 40 });
    await processOutbox();
    expect(sentEmails.some((e) => e.to === buyer.email && e.subject === "New proposal for your wellness requirement")).toBe(true);
    expect((await getMyEnquiry(pro.id, inbox.id)).canPropose).toBe(false);

    // 6. Accepted: the closed requirement stays visible to the professional
    await acceptProposal(buyer.id, org.id, prop.id, "zeta-accept-0001");
    const [mine] = await listMyProposals(pro.id);
    expect(mine).toMatchObject({ title: "Team mindfulness series", orgName: "Zeta Labs", bookingStatus: "pending" });
    expect((await listMyEnquiries(pro.id))[0].requirementStatus).toBe("closed");
    const bookings = await listMyBookings(pro.id);
    expect(summarizeEarnings(bookings)).toEqual({ awaitingPaymentPaise: 3_780_000, earnedPaise: 0, paidOutPaise: 0, duePaise: 0, bookingCount: 1 }); // ₹42,000 less 10% commission
  });
});

describe("professional rules", () => {
  it("services belong to their owner and can be paused", async () => {
    const cat = await categoryBySlug(db, "corporate-nutrition");
    const a = await makeProfessional(db, { categoryId: cat.id });
    const b = await makeProfessional(db, { categoryId: cat.id });
    const [svcA] = await listOwnServices(a.user.id);
    await expect(setServiceActive(b.user.id, svcA.service.id, false)).rejects.toMatchObject({ status: 404 });
    await setServiceActive(a.user.id, svcA.service.id, false);
    expect((await listOwnServices(a.user.id))[0].service.active).toBe(false);
  });

  it("public profiles hide unverified, hidden, suspended and removed professionals", async () => {
    const cat = await categoryBySlug(db, "corporate-nutrition");
    const viewer = await makeUser(db);
    const pending = await makeProfessional(db, { categoryId: cat.id, verified: false });
    await expect(getPublicProfile(viewer.id, pending.profile.id)).rejects.toMatchObject({ status: 404 });
    expect((await getPublicProfile(pending.user.id, pending.profile.id)).isPublic).toBe(false); // owner preview

    const ok = await makeProfessional(db, { categoryId: cat.id });
    expect((await getPublicProfile(viewer.id, ok.profile.id)).isPublic).toBe(true);
    const boss = await makeUser(db);
    await db.update(user).set({ platformRole: "super_admin" }).where(eq(user.id, boss.id));
    await suspendUser({ id: boss.id, platformRole: "super_admin", twoFactorEnabled: true }, ok.user.id, { reason: "Fake credentials" });
    await expect(getPublicProfile(viewer.id, ok.profile.id)).rejects.toMatchObject({ status: 404 });
  });

  it("declined enquiries can't be proposed on, and only waiting proposals can be withdrawn", async () => {
    const cat = await categoryBySlug(db, "yoga-mindfulness");
    const p1 = await makeProfessional(db, { categoryId: cat.id });
    const p2 = await makeProfessional(db, { categoryId: cat.id });
    const buyer = await makeUser(db, "hr@kappa.in");
    const org = await createOrganization({ ...buyer, emailVerified: true }, { name: "Kappa" });
    const req = await createRequirement(buyer.id, org.id, {
      title: "Yoga Fridays",
      categoryId: cat.id,
      city: "Bengaluru",
      deliveryMode: "virtual",
      participants: 20,
      budgetMinRupees: 30_000,
      budgetMaxRupees: 50_000,
      publish: true,
    });
    await sendEnquiries(buyer.id, org.id, req.id, [p1.user.id, p2.user.id]);
    const [e1] = await listMyEnquiries(p1.user.id);
    await declineEnquiry(p1.user.id, e1.id);
    await expect(declineEnquiry(p1.user.id, e1.id)).rejects.toMatchObject({ status: 400 });
    await expect(submitProposal(p1.user.id, req.id, { feeRupees: 30_000, proposedStart: "2027-03-01T10:00:00+05:30", maxParticipants: 20 })).rejects.toMatchObject({
      status: 400,
    });

    const prop = await submitProposal(p2.user.id, req.id, { feeRupees: 30_000, proposedStart: "2027-03-01T10:00:00+05:30", maxParticipants: 20 });
    await expect(withdrawProposal(p1.user.id, prop.id)).rejects.toMatchObject({ status: 400 });
    expect((await withdrawProposal(p2.user.id, prop.id)).status).toBe("withdrawn");
    await expect(withdrawProposal(p2.user.id, prop.id)).rejects.toMatchObject({ status: 400 });
  });

  it("the checklist only calls a profile discoverable when everything is done", () => {
    const base = { headline: "Coach", bio, city: "Pune", languages: ["English"], deliveryModes: ["virtual"], verificationStatus: "verified", discoverable: true };
    expect(profileChecklist({ profile: base, categoryCount: 1, activeServiceCount: 1, credentialCount: 1 }).discoverable).toBe(true);
    expect(profileChecklist({ profile: { ...base, bio: "short" }, categoryCount: 1, activeServiceCount: 1, credentialCount: 1 }).percent).toBe(83);
    expect(profileChecklist({ profile: { ...base, discoverable: false }, categoryCount: 1, activeServiceCount: 1, credentialCount: 1 }).discoverable).toBe(false);
  });
});
