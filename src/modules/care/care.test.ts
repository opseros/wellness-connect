import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { makeUser, setFeature } from "@/test/factories";
import { withScope, type DB } from "@/db/client";
import { careQuote, careReport, careReportAccess, careRequest, listing, membership, organization } from "@/db/schema";
import { readPrivateFile } from "@/lib/storage";
import { createListingOrg } from "@/modules/listings/service";
import { listHostStays, requestStay } from "@/modules/stays/service";
import { isoDay, todayIst } from "@/modules/stays/policy";
import {
  acceptQuote,
  buildTimeline,
  createCareRequest,
  createHealthCheckRequest,
  createPackage,
  deleteReport,
  getCareRequest,
  linkTripStay,
  listHospitalQuotes,
  listPublicPackages,
  openOwnReport,
  openSharedReport,
  purgeExpiredReports,
  replyToQuote,
  revokeReportShare,
  setReportKeep,
  shareReport,
  toggleChecklist,
  updateTrip,
  uploadReport,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
type U = { id: string; email: string; emailVerified: boolean; name: string };
let deskA: U, deskB: U, deskC: U, traveller: U, other: U, host: U, hr: U;
let hospA: string, hospB: string, hospC: string, unverified: string, homestay: string, company: string;
let requestId: string;
let reportId: string;

const plus = (d: number) => isoDay(new Date(new Date(`${todayIst()}T00:00:00Z`).getTime() + d * 86_400_000));
const pdf = (text: string) => new File([new TextEncoder().encode(`%PDF-1.4 ${text}`)], "report.pdf", { type: "application/pdf" });
const u = async (email: string, name: string): Promise<U> => ({ ...(await makeUser(db, email, name)), emailVerified: true });
async function hospital(owner: U, name: string, verified = true) {
  const id = (await createListingOrg(owner, { kind: "hospital", name, city: "Bengaluru" })).id;
  await db.update(listing).set({ status: verified ? "verified" : "draft", specialties: ["Orthopaedics"], contactEmail: `desk@${name.split(" ")[0].toLowerCase()}.in`, contactPhone: "+91 80 4000 0000" }).where(eq(listing.orgId, id));
  return id;
}
const ask = (hospitalIds: string[], extra: Record<string, unknown> = {}) =>
  createCareRequest(traveller.id, { treatment: "Total knee replacement", specialty: "Orthopaedics", ageRange: "60-69", travellingFrom: "Kenya", arriveMonth: "2027-03", companions: 1, needs: ["visa_letter", "recovery_stay"], note: "Advised by my doctor at home.", hospitalIds, ...extra });

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  await setFeature(db, "hospitals", true);
  [deskA, deskB, deskC, traveller, other, host, hr] = await Promise.all([
    u("desk@aranya.in", "Ravi Desk"),
    u("desk@lotus.in", "Meera Desk"),
    u("desk@sunrise.in", "Arjun Desk"),
    u("grace@example.test", "Grace Wanjiru"),
    u("other@example.test", "Other Traveller"),
    u("host@example.test", "Asha Host"),
    u("hr@northwind.in", "Priya HR"),
  ]);
  hospA = await hospital(deskA, "Aranya Hospital");
  hospB = await hospital(deskB, "Lotus Hospital");
  hospC = await hospital(deskC, "Sunrise Hospital");
  unverified = await hospital(other, "Draft Hospital", false);
  homestay = (await createListingOrg(host, { kind: "homestay", name: "Aranya Garden Stay", city: "Bengaluru" })).id;
  await db.update(listing).set({ status: "verified", rooms: 2, priceFromPaise: 3_000_00, features: ["near_hospital"], minNights: 1 }).where(eq(listing.orgId, homestay));
  const [o] = await db.insert(organization).values({ name: "Northwind", slug: "northwind" }).returning();
  company = o.id;
  await db.insert(membership).values({ orgId: company, userId: hr.id, role: "owner", status: "active" });
});
afterAll(() => t.close());

describe("packages", () => {
  it("hospitals list packages; only active packages of verified hospitals are public", async () => {
    await createPackage(deskA.id, hospA, { title: "Total knee replacement (one knee)", specialty: "Orthopaedics", includes: "Airport pick-up, 10 physiotherapy sessions", hospitalNights: 5, recoveryNights: 10, priceMinRupees: 250000, priceMaxRupees: 320000 });
    await expect(createPackage(traveller.id, hospA, { title: "X package", specialty: "Ortho", priceMinRupees: 1, priceMaxRupees: 2 })).rejects.toMatchObject({ status: 403 });
    await createPackage(other.id, unverified, { title: "Hidden package", specialty: "Ortho", priceMinRupees: 1000, priceMaxRupees: 2000 });
    expect((await listPublicPackages(hospA)).map((p) => p.includes)).toEqual([["Airport pick-up", "10 physiotherapy sessions"]]);
    expect(await listPublicPackages(unverified)).toEqual([]);
  });
});

describe("quote requests: minimum data, each hospital sees only its own", () => {
  it("validates hospitals, count and contact details; off in production until switched on", async () => {
    await expect(ask([hospA, unverified])).rejects.toThrow(/verified hospitals/);
    await expect(ask([hospA, hospB, hospC, unverified])).rejects.toBeTruthy();
    await expect(ask([hospA], { note: "Email me at grace@example.test" })).rejects.toThrow(/phone numbers and email/);
    const env = { v: process.env.VERCEL_ENV, c: process.env.CARE_TRAVEL };
    process.env.VERCEL_ENV = "production";
    delete process.env.CARE_TRAVEL;
    await expect(ask([hospA])).rejects.toMatchObject({ status: 403 });
    process.env.CARE_TRAVEL = "on";
    await expect(ask([hospA])).resolves.toBeTruthy();
    process.env.VERCEL_ENV = env.v;
    if (env.c === undefined) delete process.env.CARE_TRAVEL;
    else process.env.CARE_TRAVEL = env.c;
  });

  it("A and B see their own quote, not each other's; C (not chosen) sees nothing; no names before acceptance", async () => {
    requestId = (await ask([hospA, hospB])).id;
    const a = await listHospitalQuotes(deskA.id, hospA);
    const mine = a.quotes.find((q) => q.requestId === requestId)!;
    expect(mine.request).toMatchObject({ treatment: "Total knee replacement", ageRange: "60-69", travellingFrom: "Kenya" });
    expect(mine.patient).toBeNull();
    expect(JSON.stringify(a)).not.toContain("Grace");
    const rawA = await withScope({ userId: deskA.id, orgId: hospA }, (tx) => tx.select().from(careQuote).where(eq(careQuote.requestId, requestId)));
    expect(rawA.map((q) => q.orgId)).toEqual([hospA]);
    const rawC = await withScope({ userId: deskC.id, orgId: hospC }, (tx) => tx.select().from(careRequest).where(eq(careRequest.id, requestId)));
    expect(rawC).toHaveLength(0);
    await expect(listHospitalQuotes(traveller.id, hospA)).rejects.toMatchObject({ status: 403 });
  });
});

describe("reports: encrypted, consented, logged", () => {
  it("is stored encrypted and shared only with the hospital the traveller chose", async () => {
    const qB = (await listHospitalQuotes(deskB.id, hospB)).quotes.find((q) => q.requestId === requestId)!;
    await replyToQuote(deskB.id, hospB, qB.id, { action: "ask_reports", message: "Please share your latest X-ray." });
    const rep = await uploadReport(traveller.id, requestId, pdf("KNEE X-RAY FINDINGS"));
    reportId = rep.id;
    const row = await withScope({ userId: traveller.id }, (tx) => tx.query.careReport.findFirst({ where: eq(careReport.id, reportId) }));
    const stored = await readPrivateFile(row!.blobPath!);
    expect(stored!.toString("latin1")).not.toContain("KNEE X-RAY");
    expect((await openOwnReport(traveller.id, reportId)).body.toString()).toContain("KNEE X-RAY FINDINGS");
    await expect(shareReport(traveller.id, reportId, { orgId: hospB, consent: false as unknown as true })).rejects.toBeTruthy();
    await expect(shareReport(traveller.id, reportId, { orgId: hospC, consent: true })).rejects.toThrow(/still working/);
    await shareReport(traveller.id, reportId, { orgId: hospB, consent: true });
    await expect(openSharedReport(deskA.id, hospA, reportId)).rejects.toMatchObject({ status: 404 });
    expect((await openSharedReport(deskB.id, hospB, reportId)).body.toString()).toContain("KNEE X-RAY FINDINGS");
    const view = await getCareRequest(traveller.id, requestId);
    expect(view.reports[0].opens.map((o) => o.hospitalName)).toEqual(["Lotus Hospital"]);
    expect(view.reports[0].sharedWith).toEqual([hospB]);
    // The access log can't be edited.
    const changed = await withScope({ userId: null, bypass: true }, (tx) => tx.update(careReportAccess).set({ userId: deskA.id }).returning());
    expect(changed).toHaveLength(0);
    const log = await withScope({ userId: traveller.id }, (tx) => tx.select().from(careReportAccess));
    expect(log.map((l) => l.userId)).toEqual([deskB.id]);
    await revokeReportShare(traveller.id, reportId, hospB);
    await expect(openSharedReport(deskB.id, hospB, reportId)).rejects.toMatchObject({ status: 404 });
    await expect(openOwnReport(other.id, reportId)).rejects.toMatchObject({ status: 404 });
  });
});

describe("compare, accept, plan the trip, book a stay", () => {
  it("both hospitals quote without reports from A; accepting A closes B and reveals the traveller to A only", async () => {
    const qA = (await listHospitalQuotes(deskA.id, hospA)).quotes.find((q) => q.requestId === requestId)!;
    const qB = (await listHospitalQuotes(deskB.id, hospB)).quotes.find((q) => q.requestId === requestId)!;
    const pkg = (await listPublicPackages(hospA))[0];
    await expect(replyToQuote(deskA.id, hospA, qA.id, { action: "quote", priceMinRupees: 260000, priceMaxRupees: 300000, validUntil: plus(-1) })).rejects.toThrow(/valid until/);
    await replyToQuote(deskA.id, hospA, qA.id, { action: "quote", packageId: pkg.id, priceMinRupees: 260000, priceMaxRupees: 300000, hospitalNights: 5, earliestDate: plus(31), validUntil: plus(30), message: "Surgeon available." });
    await replyToQuote(deskB.id, hospB, qB.id, { action: "quote", priceMinRupees: 240000, priceMaxRupees: 310000, hospitalNights: 6, validUntil: plus(30) });
    const view = await getCareRequest(traveller.id, requestId);
    expect(view.quotes.map((q) => q.status)).toEqual(["quoted", "quoted"]);
    expect(view.quotes.every((q) => q.hospital?.contact === null)).toBe(true);
    await shareReport(traveller.id, reportId, { orgId: hospB, consent: true });
    expect((await openSharedReport(deskB.id, hospB, reportId)).body.length).toBeGreaterThan(0);
    await expect(acceptQuote(other.id, requestId, qA.id)).rejects.toMatchObject({ status: 404 });
    await acceptQuote(traveller.id, requestId, qA.id);
    const after = await getCareRequest(traveller.id, requestId);
    expect(after.quotes.find((q) => q.orgId === hospB)?.status).toBe("not_selected");
    await expect(openSharedReport(deskB.id, hospB, reportId)).rejects.toMatchObject({ status: 404 });
    expect(after.accepted?.hospital?.contact?.email).toBe("desk@aranya.in");
    const aList = await listHospitalQuotes(deskA.id, hospA);
    expect(aList.quotes.find((q) => q.requestId === requestId)?.patient).toMatchObject({ name: "Grace Wanjiru", email: traveller.email });
    // Lotus wasn't chosen: even if a report had been shared with it, it can't open it now.
    await shareReport(traveller.id, reportId, { orgId: hospA, consent: true });
    expect((await openSharedReport(deskA.id, hospA, reportId)).body.length).toBeGreaterThan(0);
    const bList = await listHospitalQuotes(deskB.id, hospB);
    expect(bList.quotes.find((q) => q.requestId === requestId)?.patient).toBeNull();
    expect(after.trip?.arriveOn).toBe(plus(31));
  });

  it("dates set the report deletion date; checklist; timeline; a linked stay tells the host nothing medical", async () => {
    const v = await getCareRequest(traveller.id, requestId);
    const trip = v.trip!;
    await updateTrip(traveller.id, trip.id, { arriveOn: plus(30), departOn: plus(45) });
    const rep = await withScope({ userId: traveller.id }, (tx) => tx.query.careReport.findFirst({ where: eq(careReport.id, reportId) }));
    expect(isoDay(rep!.deleteAfter)).toBe(plus(135));
    await toggleChecklist(traveller.id, trip.id, "passport", true);
    const steps = buildTimeline({ arriveOn: plus(30), departOn: plus(45) }, { earliestDate: plus(31), hospitalNights: 5 }, 10, "Aranya Hospital");
    expect(steps.map((s) => s.title)).toEqual(["Arrive", "Consultation and admission at Aranya Hospital", "Discharge", "Recovery stay", "Fly home"]);
    expect(steps[2].date).toBe(plus(36));
    const s = await requestStay(traveller, homestay, { checkIn: plus(36), checkOut: plus(45), purpose: "care", accessNeeds: ["step_free"] });
    await linkTripStay(traveller.id, trip.id, s.id);
    await expect(linkTripStay(other.id, trip.id, s.id)).rejects.toMatchObject({ status: 404 });
    const hostView = JSON.stringify(await listHostStays(host.id, homestay));
    expect(hostView).not.toMatch(/knee|Orthopaedics|Kenya|60-69|X-ray/i);
    expect((await getCareRequest(traveller.id, requestId)).trip?.checklist.find((c) => c.key === "passport")?.done).toBe(true);
  });
});

describe("retention and company check-ups", () => {
  it("deletes reports after their date unless kept; a deleted report can't be opened", async () => {
    const keepId = (await uploadReport(traveller.id, requestId, pdf("KEEP ME"))).id;
    await setReportKeep(traveller.id, keepId, true);
    await withScope({ userId: null, bypass: true }, (tx) => tx.update(careReport).set({ deleteAfter: new Date(Date.now() - 1000) }).where(eq(careReport.requestId, requestId)));
    expect((await purgeExpiredReports()).deleted).toBe(1);
    await expect(openOwnReport(traveller.id, reportId)).rejects.toMatchObject({ status: 404 });
    expect((await openOwnReport(traveller.id, keepId)).body.toString()).toContain("KEEP ME");
    await deleteReport(traveller.id, keepId);
    await expect(openOwnReport(traveller.id, keepId)).rejects.toMatchObject({ status: 404 });
  });

  it("companies ask for health check-ups by headcount, and can never attach reports", async () => {
    await expect(createHealthCheckRequest(traveller.id, company, { headcount: 40, hospitalIds: [hospA] })).rejects.toMatchObject({ status: 403 });
    const r = await createHealthCheckRequest(hr.id, company, { treatment: "Executive health check", headcount: 40, ageBand: "25–55", hospitalIds: [hospA, hospB] });
    expect(r).toMatchObject({ kind: "health_check", headcount: 40, requesterOrgId: company });
    await expect(uploadReport(hr.id, r.id, pdf("employee data"))).rejects.toThrow(/never take reports/);
    const a = await listHospitalQuotes(deskA.id, hospA);
    expect(a.quotes.find((q) => q.requestId === r.id)?.request.headcount).toBe(40);
  });
});
