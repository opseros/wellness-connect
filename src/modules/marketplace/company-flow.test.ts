import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { categoryBySlug, makeProfessional, makeUser } from "@/test/factories";
import { withScope, type DB } from "@/db/client";
import { booking, invitation, membership, outbox, requirement, user } from "@/db/schema";
import { sentEmails } from "@/lib/email";
import { processOutbox } from "@/modules/platform/outbox";
import "@/modules/platform/handlers";
import {
  acceptInvitation,
  changeMemberRole,
  createOrganization,
  inviteMember,
  listInvitations,
  listMembers,
  previewInvitation,
  removeMember,
  revokeInvitation,
  updateOrgSettings,
} from "@/modules/organizations/service";
import {
  acceptProposal,
  bookingPolicy,
  cancelBooking,
  companyDashboard,
  compareProposals,
  completeBooking,
  createRequirement,
  getMyEnquiry,
  getOrgBooking,
  getRequirement,
  listMyEnquiries,
  remindEnquiry,
  requestRevision,
  rescheduleBooking,
  reviseProposal,
  sendEnquiries,
  submitProposal,
  updateRequirement,
  withdrawRequirement,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let catId: string;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  catId = (await categoryBySlug(db, "yoga-mindfulness")).id;
});
afterAll(() => t.close());

const owner = async (email: string, name = "Owner") => {
  const u = await makeUser(db, email, name);
  return { ...u, emailVerified: true };
};
const tokenFrom = (to: string) => {
  const mail = [...sentEmails].reverse().find((e) => e.to === to);
  return mail?.text.match(/\/invite\/([A-Za-z0-9_-]+)/)?.[1] ?? "";
};
const brief = (over: Record<string, unknown> = {}) => ({
  title: "Mindfulness workshop: Q1 kickoff",
  categoryId: catId,
  city: "Bengaluru",
  deliveryMode: "in_person" as const,
  participants: 80,
  budgetMinRupees: 30_000,
  budgetMaxRupees: 50_000,
  ...over,
});
const inDays = (d: number, hour = 10) => {
  const x = new Date(Date.now() + d * 86_400_000);
  x.setUTCHours(hour - 5, 30, 0, 0); // hour in IST
  return x.toISOString();
};

describe("company settings, members and invitations", () => {
  it("validates settings and only lets admins change them", async () => {
    const o = await owner("priya@northwind.in", "Priya");
    const org = await createOrganization(o, { name: "Northwind Labs" });
    await expect(updateOrgSettings(o.id, org.id, { name: "Northwind Labs", gstin: "12345" })).rejects.toThrow();
    const row = await updateOrgSettings(o.id, org.id, { name: "Northwind Labs", city: "Bengaluru", address: "4th floor, MG Road", billingEmail: "AP@northwind.in", gstin: "29abcde1234f1z5" });
    expect(row).toMatchObject({ gstin: "29ABCDE1234F1Z5", billingEmail: "ap@northwind.in" });
    const stranger = await makeUser(db);
    await expect(updateOrgSettings(stranger.id, org.id, { name: "Hacked" })).rejects.toMatchObject({ status: 403 });
  });

  it("invites by email; only the invited, verified address can accept, once", async () => {
    const o = await owner("asha@zeta.in", "Asha");
    const org = await createOrganization(o, { name: "Zeta" });
    await inviteMember(o.id, org.id, { email: "Consultant@Agency.com", role: "wellness_manager" });
    const token = tokenFrom("consultant@agency.com");
    expect(token.length).toBeGreaterThan(30);
    // Only the hash is stored.
    const [stored] = await db.select().from(invitation).where(eq(invitation.orgId, org.id));
    expect(stored.tokenHash).not.toContain(token);
    expect(await previewInvitation(token)).toMatchObject({ orgName: "Zeta", role: "wellness_manager" });

    const wrong = await owner("someone@else.com");
    await expect(acceptInvitation(wrong, token)).rejects.toMatchObject({ status: 403 });
    const invited = await owner("consultant@agency.com", "Kiran");
    await expect(acceptInvitation({ ...invited, emailVerified: false }, token)).rejects.toMatchObject({ status: 403 });
    expect(await acceptInvitation(invited, token)).toMatchObject({ orgId: org.id, role: "wellness_manager" });
    await expect(acceptInvitation(invited, token)).rejects.toMatchObject({ status: 404 });
    expect((await listMembers(o.id, org.id)).map((m) => m.email)).toContain("consultant@agency.com");

    // Revoked invitations stop working; members can't invite.
    await inviteMember(o.id, org.id, { email: "late@agency.com" });
    const t2 = tokenFrom("late@agency.com");
    const [open] = await listInvitations(o.id, org.id);
    await revokeInvitation(o.id, org.id, open.id);
    expect(await previewInvitation(t2)).toBeNull();
    await expect(inviteMember(invited.id, org.id, { email: "x@y.com" })).rejects.toMatchObject({ status: 403 });
    await expect(previewInvitation("not-a-real-token")).resolves.toBeNull();
  });

  it("role rules: only owners handle admins; nobody edits themselves or an owner", async () => {
    const o = await owner("ravi@kappa.in", "Ravi");
    const org = await createOrganization(o, { name: "Kappa" });
    const admin = await makeUser(db, "admin@kappa.in");
    const member = await makeUser(db, "member@kappa.in");
    const pending = await makeUser(db, "pending@kappa.in");
    const [ma] = await db.insert(membership).values({ orgId: org.id, userId: admin.id, role: "admin", status: "active" }).returning();
    const [mm] = await db.insert(membership).values({ orgId: org.id, userId: member.id, role: "member", status: "active" }).returning();
    const [mp] = await db.insert(membership).values({ orgId: org.id, userId: pending.id, role: "member", status: "pending" }).returning();
    const ownerRow = (await db.select().from(membership).where(eq(membership.userId, o.id)))[0];

    await expect(changeMemberRole(admin.id, org.id, mm.id, { role: "admin" })).rejects.toMatchObject({ status: 403 });
    await changeMemberRole(admin.id, org.id, mm.id, { role: "wellness_manager" });
    await expect(changeMemberRole(admin.id, org.id, ma.id, { role: "member" })).rejects.toMatchObject({ status: 400 });
    await expect(changeMemberRole(admin.id, org.id, ownerRow.id, { role: "member" })).rejects.toMatchObject({ status: 403 });
    await expect(removeMember(admin.id, org.id, ownerRow.id)).rejects.toMatchObject({ status: 403 });
    // Approving a join request is choosing a role for it.
    expect((await changeMemberRole(admin.id, org.id, mp.id, { role: "member" })).status).toBe("active");
    await removeMember(o.id, org.id, ma.id);
    expect((await listMembers(o.id, org.id)).map((m) => m.email)).not.toContain("admin@kappa.in");
  });
});

describe("requirement → matches → enquiries → revision → booking", () => {
  it("runs the company flow end to end", async () => {
    const o = await owner("hr@acme.in", "Priya");
    const org = await createOrganization(o, { name: "Acme" });
    await updateOrgSettings(o.id, org.id, { name: "Acme", city: "Bengaluru", address: "Acme Tower, Indiranagar" });
    const ananya = await makeProfessional(db, { categoryId: catId, name: "Ananya", years: 9 });
    const karthik = await makeProfessional(db, { categoryId: catId, name: "Karthik", years: 6 });

    // Draft, edit, publish.
    const draft = await createRequirement(o.id, org.id, brief({ title: "Draft title" }));
    expect(draft.status).toBe("draft");
    await expect(sendEnquiries(o.id, org.id, draft.id, [ananya.user.id])).rejects.toMatchObject({ status: 400 });
    const pub = await updateRequirement(o.id, org.id, draft.id, { ...brief(), publish: true });
    expect(pub).toMatchObject({ status: "published", title: "Mindfulness workshop: Q1 kickoff" });
    expect((await updateRequirement(o.id, org.id, draft.id, { ...brief({ participants: 90 }), publish: false })).status).toBe("published");

    // Requirements are private: a professional without an enquiry can't read it.
    const outsider = await makeUser(db);
    const peek = await withScope({ userId: outsider.id }, (tx) => tx.select().from(requirement));
    expect(peek).toHaveLength(0);

    await sendEnquiries(o.id, org.id, draft.id, [ananya.user.id, karthik.user.id]);
    const [ea] = await listMyEnquiries(ananya.user.id);
    await remindEnquiry(o.id, org.id, ea.id);
    await expect(remindEnquiry(o.id, org.id, ea.id)).rejects.toMatchObject({ status: 400 }); // once a day

    const pa = await submitProposal(ananya.user.id, draft.id, { feeRupees: 45_000, proposedStart: inDays(30), maxParticipants: 100 });
    const cmp = await compareProposals(o.id, org.id, draft.id);
    expect(cmp.columns.map((c) => [c.name, Boolean(c.proposal)])).toEqual([["Ananya", true], ["Karthik", false]]);
    expect(cmp.columns[0].matchScore).toBeGreaterThan(0);
    expect(cmp.columns[0].profileId).toBe(ananya.profile.id);

    // Revision round trip.
    await expect(requestRevision(o.id, org.id, pa.id, { note: "no" })).rejects.toThrow();
    await requestRevision(o.id, org.id, pa.id, { note: "Can you bring the fee closer to ₹40,000?" });
    await expect(acceptProposal(o.id, org.id, pa.id, "acme-accept-1")).rejects.toMatchObject({ status: 409 });
    expect((await getMyEnquiry(ananya.user.id, ea.id)).proposal?.revisionNote).toContain("₹40,000");
    const revised = await reviseProposal(ananya.user.id, pa.id, { feeRupees: 40_000, proposedStart: inDays(30), maxParticipants: 100 });
    expect(revised).toMatchObject({ status: "submitted", feePaise: 4_000_000, revisionNote: null, revisionCount: 1 });

    const pk = await submitProposal(karthik.user.id, draft.id, { feeRupees: 32_000, proposedStart: inDays(30, 14), maxParticipants: 80 });
    const b = await acceptProposal(o.id, org.id, pa.id, "acme-accept-1");
    expect(b.location).toBe("Acme Tower, Indiranagar, Bengaluru");

    const events = await withScope({ userId: null, bypass: true }, (tx) => tx.select().from(outbox));
    expect(events.filter((e) => e.type === "proposal.not_selected").map((e) => (e.payload as { proposalId: string }).proposalId)).toEqual([pk.id]);
    await processOutbox();
    expect(sentEmails.some((e) => e.to === karthik.user.email && e.subject === "Update on your proposal")).toBe(true);
    expect(sentEmails.some((e) => e.to === ananya.user.email && e.subject === "A company asked you to revise your proposal")).toBe(true);
    expect(sentEmails.some((e) => e.to === o.email && e.subject === "A professional revised their proposal")).toBe(true);

    // Booking: reschedule within policy, then cancel.
    const detail = await getOrgBooking(o.id, org.id, b.id);
    expect(detail.policy).toMatchObject({ canReschedule: true, canCancel: true, cancelIsLate: false, canComplete: false });
    await rescheduleBooking(o.id, org.id, b.id, { newStart: inDays(35), reason: "All-hands moved" });
    await rescheduleBooking(o.id, org.id, b.id, { newStart: inDays(36) });
    await expect(rescheduleBooking(o.id, org.id, b.id, { newStart: inDays(37) })).rejects.toMatchObject({ status: 400 }); // max 2
    await expect(rescheduleBooking(o.id, org.id, b.id, { newStart: new Date(Date.now() + 3_600_000).toISOString() })).rejects.toMatchObject({ status: 400 });
    await expect(completeBooking(o.id, org.id, b.id)).rejects.toMatchObject({ status: 400 });
    await expect(cancelBooking(o.id, org.id, b.id, { reason: "x" })).rejects.toThrow();
    const cancelled = await cancelBooking(o.id, org.id, b.id, { reason: "Budget freeze this quarter" });
    expect(cancelled).toMatchObject({ status: "cancelled", cancelledLate: false });

    const dash = await companyDashboard(o.id, org.id);
    expect(dash.requirements[0]).toMatchObject({ enquiries: 2, proposals: 2 });
    expect(dash.stats.upcomingSessions).toBe(0);
  });

  it("withdrawing a requirement closes enquiries and tells professionals", async () => {
    const o = await owner("hr@lambda.in");
    const org = await createOrganization(o, { name: "Lambda" });
    const pro = await makeProfessional(db, { categoryId: catId });
    const r = await createRequirement(o.id, org.id, { ...brief(), publish: true });
    await sendEnquiries(o.id, org.id, r.id, [pro.user.id]);
    await withdrawRequirement(o.id, org.id, r.id);
    const [e] = await listMyEnquiries(pro.user.id);
    expect(e).toMatchObject({ status: "closed", requirementStatus: "withdrawn" });
    await expect(submitProposal(pro.user.id, r.id, { feeRupees: 1000, proposedStart: inDays(20), maxParticipants: 5 })).rejects.toMatchObject({ status: 400 });
    await expect(withdrawRequirement(o.id, org.id, r.id)).rejects.toMatchObject({ status: 400 });
  });

  it("another company can't read or change any of it", async () => {
    const a = await owner("hr@one.in");
    const orgA = await createOrganization(a, { name: "One" });
    const b = await owner("hr@two.in");
    const orgB = await createOrganization(b, { name: "Two" });
    const pro = await makeProfessional(db, { categoryId: catId });
    const r = await createRequirement(a.id, orgA.id, { ...brief(), publish: true });
    await sendEnquiries(a.id, orgA.id, r.id, [pro.user.id]);
    const p = await submitProposal(pro.user.id, r.id, { feeRupees: 40_000, proposedStart: inDays(30), maxParticipants: 80 });
    const bk = await acceptProposal(a.id, orgA.id, p.id, "one-accept-0001");

    // Bob, owner of org Two: wrong org in the URL is refused by role check...
    await expect(getRequirement(b.id, orgA.id, r.id)).rejects.toMatchObject({ status: 403 });
    // ...and his own org scope can't see org One's rows at all (RLS).
    await expect(getRequirement(b.id, orgB.id, r.id)).rejects.toMatchObject({ status: 404 });
    await expect(compareProposals(b.id, orgB.id, r.id)).rejects.toMatchObject({ status: 404 });
    await expect(getOrgBooking(b.id, orgB.id, bk.id)).rejects.toMatchObject({ status: 404 });
    await expect(cancelBooking(b.id, orgB.id, bk.id, { reason: "sabotage attempt" })).rejects.toMatchObject({ status: 404 });
    await expect(requestRevision(b.id, orgB.id, p.id, { note: "please change it" })).rejects.toMatchObject({ status: 404 });
    const raw = await withScope({ userId: b.id, orgId: orgB.id }, async (tx) => ({
      bookings: await tx.select().from(booking),
      reqs: await tx.select().from(requirement),
    }));
    expect(raw).toEqual({ bookings: [], reqs: [] });
    // A plain member of org One can't use the marketplace.
    const m = await makeUser(db);
    await db.insert(membership).values({ orgId: orgA.id, userId: m.id, role: "member", status: "active" });
    await expect(companyDashboard(m.id, orgA.id)).rejects.toMatchObject({ status: 403 });
    void user;
  });
});

describe("booking policy", () => {
  const now = new Date("2027-01-01T00:00:00Z");
  const at = (days: number) => new Date(now.getTime() + days * 86_400_000);
  it("free cancellation and rescheduling only outside the window", () => {
    expect(bookingPolicy({ status: "pending", scheduledStart: at(10), rescheduleCount: 0 }, 7, now)).toMatchObject({ canReschedule: true, cancelIsLate: false, canCancel: true });
    const late = bookingPolicy({ status: "confirmed", scheduledStart: at(3), rescheduleCount: 0 }, 7, now);
    expect(late).toMatchObject({ canReschedule: false, cancelIsLate: true, canCancel: true, canComplete: false });
    expect(late.rescheduleBlockedReason).toContain("7 days");
    expect(bookingPolicy({ status: "pending", scheduledStart: at(10), rescheduleCount: 2 }, 7, now).canReschedule).toBe(false);
    expect(bookingPolicy({ status: "pending", scheduledStart: at(-1), rescheduleCount: 0 }, 7, now)).toMatchObject({ canCancel: false, canComplete: true });
    expect(bookingPolicy({ status: "cancelled", scheduledStart: at(10), rescheduleCount: 0 }, 7, now)).toMatchObject({ canCancel: false, canReschedule: false, canComplete: false });
    expect(bookingPolicy({ status: "pending", scheduledStart: at(2), rescheduleCount: 0 }, 0, now).cancelIsLate).toBe(false);
  });
});
