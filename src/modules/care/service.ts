/**
 * Care & Travel (M8). Travellers ask up to three verified hospitals for a
 * quote, compare the replies, optionally share reports with the hospitals
 * they choose, accept one quote and plan the trip with a recovery stay.
 * Companies can ask hospitals for health check-up quotes (headcount only).
 *
 * Health data rules (see also the RLS migration 0016):
 * - Requests carry only treatment, age range, country, travel month,
 *   companions, practical needs and an optional note (no phone/email).
 * - Hospitals see who the traveller is only after their quote is accepted.
 * - Reports are encrypted (src/lib/file-crypto.ts), shared per hospital with
 *   recorded consent, every open is logged, and they are deleted 90 days after
 *   the trip (180 days after upload if no trip is planned) unless kept.
 * - Company health check-ups never take reports or individual health details.
 * - Homestay hosts never see any of this: a trip only links to a stay.
 * - Patient-facing actions are behind careTravelEnabled() until M10.
 */
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  AGE_RANGES,
  CARE_NEEDS,
  carePackage,
  careQuote,
  careReport,
  careReportAccess,
  careReportShare,
  careRequest,
  careTrip,
  user,
  type ChecklistItem,
} from "@/db/schema";
import { getDb, withScope } from "@/db/client";
import { assertUuid, badRequest, forbidden, notFound } from "@/lib/errors";
import { decryptFile, encryptFile } from "@/lib/file-crypto";
import { deletePrivateFile, MAX_UPLOAD_BYTES, putPrivateFile, readPrivateFile } from "@/lib/storage";
import { audit, enqueue } from "@/modules/platform/outbox";
import { hospitalsByIds, listDirectory } from "@/modules/listings/service";
import { assertCompanyOrg, isActiveMember, ORG_ADMINS, ORG_ALL, ORG_BUYERS, requireOrgRole } from "@/modules/organizations/service";
import { getMyStay } from "@/modules/stays/service";
import { isoDay, todayIst } from "@/modules/stays/policy";

const DAY = 86_400_000;
const REPORT_DAYS_AFTER_TRIP = 90;
const REPORT_DAYS_WITHOUT_TRIP = 180;
export const CONSENT_TEXT =
  "I agree to share this report with this hospital so it can give me a quote and plan my treatment. The hospital may open it until I withdraw consent or the report is deleted; each opening is logged and shown to me.";

/**
 * Patient-facing Care & Travel (quote requests, reports) stays off in
 * production until the M10 privacy work is done and CARE_TRAVEL=on is set.
 * Previews and development have it on so the flows can be tested.
 */
export function careTravelEnabled() {
  return process.env.CARE_TRAVEL === "on" || process.env.VERCEL_ENV !== "production";
}
function assertEnabled() {
  if (!careTravelEnabled()) throw forbidden("Care & Travel requests open soon");
}

export const AGE_LABEL: Record<(typeof AGE_RANGES)[number], string> = { "18-29": "18–29", "30-39": "30–39", "40-49": "40–49", "50-59": "50–59", "60-69": "60–69", "70+": "70 or over" };
export const NEED_LABEL: Record<(typeof CARE_NEEDS)[number], string> = {
  visa_letter: "Medical visa letter",
  interpreter: "Interpreter",
  airport_pickup: "Airport pick-up",
  recovery_stay: "Recovery stay nearby",
};
export const QUOTE_STATUS_LABEL: Record<string, string> = {
  requested: "Waiting for the hospital",
  reports_requested: "Hospital asked for reports",
  quoted: "Quote received",
  declined: "Declined",
  accepted: "Accepted",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};

const noContact = (v: string) => !/[\w.+-]+@[\w-]+\.[\w.]+/.test(v) && !/(\+?\d[\d\s-]{8,}\d)/.test(v);
const rupees = (max: number) => z.coerce.number().int().min(0).max(max);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

// ---------- Packages (hospital) ----------

export const packageInput = z
  .object({
    title: z.string().trim().min(3, "Give the package a name").max(120),
    specialty: z.string().trim().min(2, "Choose the specialty").max(60),
    description: z.string().trim().max(1500).default(""),
    includes: z.preprocess((v) => (typeof v === "string" ? v.split(",") : v), z.array(z.string().trim().max(80)).transform((a) => a.filter(Boolean)).pipe(z.array(z.string()).max(15))).default([]),
    hospitalNights: z.coerce.number().int().min(0).max(60).default(0),
    recoveryNights: z.coerce.number().int().min(0).max(90).default(0),
    priceMinRupees: rupees(10_000_000),
    priceMaxRupees: rupees(10_000_000),
    forCompanies: z.boolean().default(false),
  })
  .refine((v) => v.priceMaxRupees >= v.priceMinRupees, { message: "The maximum price must be at least the minimum", path: ["priceMaxRupees"] })
  .refine((v) => v.priceMinRupees > 0, { message: "Enter an indicative price", path: ["priceMinRupees"] });

async function assertHospital(orgId: string) {
  const h = (await hospitalsByIds([orgId])).get(orgId);
  if (!h) throw notFound("Hospital not found");
  return h;
}

const packageValues = (d: z.output<typeof packageInput>) => ({
  title: d.title,
  specialty: d.specialty,
  description: d.description,
  includes: d.includes,
  hospitalNights: d.hospitalNights,
  recoveryNights: d.recoveryNights,
  priceMinPaise: d.priceMinRupees * 100,
  priceMaxPaise: d.priceMaxRupees * 100,
  forCompanies: d.forCompanies,
});

export async function createPackage(userId: string, orgId: string, input: z.input<typeof packageInput>) {
  const d = packageInput.parse(input);
  await requireOrgRole(userId, orgId, ORG_ADMINS);
  await assertHospital(orgId);
  const [row] = await getDb().insert(carePackage).values({ orgId, ...packageValues(d) }).returning();
  return row;
}

export async function updatePackage(userId: string, orgId: string, packageId: string, input: z.input<typeof packageInput>) {
  const d = packageInput.parse(input);
  assertUuid(packageId, "Package");
  await requireOrgRole(userId, orgId, ORG_ADMINS);
  const [row] = await getDb()
    .update(carePackage)
    .set({ ...packageValues(d), updatedAt: new Date() })
    .where(and(eq(carePackage.id, packageId), eq(carePackage.orgId, orgId)))
    .returning();
  if (!row) throw notFound("Package not found");
  return row;
}

export async function setPackageActive(userId: string, orgId: string, packageId: string, active: boolean) {
  assertUuid(packageId, "Package");
  await requireOrgRole(userId, orgId, ORG_ADMINS);
  const [row] = await getDb().update(carePackage).set({ active, updatedAt: new Date() }).where(and(eq(carePackage.id, packageId), eq(carePackage.orgId, orgId))).returning();
  if (!row) throw notFound("Package not found");
  return row;
}

export async function listOwnPackages(userId: string, orgId: string) {
  await requireOrgRole(userId, orgId, ORG_ALL);
  return getDb().select().from(carePackage).where(eq(carePackage.orgId, orgId)).orderBy(desc(carePackage.active), asc(carePackage.title));
}

/** Active packages of a verified hospital (public). */
export async function listPublicPackages(orgId: string) {
  const h = (await hospitalsByIds([orgId])).get(orgId);
  if (!h?.verified) return [];
  return getDb().select().from(carePackage).where(and(eq(carePackage.orgId, orgId), eq(carePackage.active, true))).orderBy(asc(carePackage.priceMinPaise));
}

/** Health check-up packages across verified hospitals, for companies. */
export async function listCompanyPackages() {
  const rows = await getDb().select().from(carePackage).where(and(eq(carePackage.active, true), eq(carePackage.forCompanies, true))).orderBy(asc(carePackage.priceMinPaise));
  const hs = await hospitalsByIds(rows.map((r) => r.orgId));
  return rows.filter((r) => hs.get(r.orgId)?.verified).map((r) => ({ ...r, hospital: hs.get(r.orgId)! }));
}

// ---------- Requests (traveller and company) ----------

const hospitalIds = z.array(z.string().uuid()).min(1, "Choose at least one hospital").max(3, "Choose up to three hospitals").transform((a) => [...new Set(a)]);
const note = z.string().trim().max(600).refine(noContact, "Leave out phone numbers and email addresses; the hospital gets your contact details when you accept its quote").default("");

export const careRequestInput = z.object({
  treatment: z.string().trim().min(3, "Say what treatment you're looking for").max(120),
  specialty: z.string().trim().max(60).default(""),
  ageRange: z.enum(AGE_RANGES, { message: "Choose an age range" }),
  travellingFrom: z.string().trim().min(2, "Where are you travelling from?").max(80),
  arriveMonth: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}$/)]).default(""),
  companions: z.coerce.number().int().min(0).max(5).default(0),
  needs: z.array(z.enum(CARE_NEEDS)).default([]),
  interpreterLanguage: z.string().trim().max(40).default(""),
  note,
  hospitalIds,
});

async function verifiedHospitals(ids: string[], requesterId: string) {
  const hs = await hospitalsByIds(ids);
  for (const id of ids) {
    const h = hs.get(id);
    if (!h?.verified) throw badRequest("Choose verified hospitals only");
    if (await isActiveMember(requesterId, id)) throw badRequest("You can't ask your own hospital for a quote");
  }
  return hs;
}

export async function createCareRequest(userId: string, input: z.input<typeof careRequestInput>) {
  assertEnabled();
  const d = careRequestInput.parse(input);
  await verifiedHospitals(d.hospitalIds, userId);
  return withScope({ userId }, async (tx) => {
    const [r] = await tx
      .insert(careRequest)
      .values({
        requesterUserId: userId,
        kind: "treatment",
        treatment: d.treatment,
        specialty: d.specialty,
        ageRange: d.ageRange,
        travellingFrom: d.travellingFrom,
        arriveMonth: d.arriveMonth || null,
        companions: d.companions,
        needs: d.needs,
        interpreterLanguage: d.needs.includes("interpreter") ? d.interpreterLanguage : "",
        note: d.note,
      })
      .returning();
    const quotes = await tx.insert(careQuote).values(d.hospitalIds.map((orgId) => ({ requestId: r.id, orgId, requesterUserId: userId }))).returning();
    for (const q of quotes) await enqueue(tx, { type: "care.requested", payload: { quoteId: q.id, orgId: q.orgId } });
    return r;
  });
}

export const healthCheckInput = z.object({
  treatment: z.string().trim().min(3, "Say what check-up you need").max(120).default("Annual health check-up"),
  headcount: z.coerce.number().int().min(1, "How many people?").max(5000),
  ageBand: z.string().trim().max(40).default(""),
  arriveMonth: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}$/)]).default(""),
  note,
  hospitalIds,
});

/** A company asks hospitals for a health check-up quote. Headcount only: no individual health details, no reports. */
export async function createHealthCheckRequest(userId: string, orgId: string, input: z.input<typeof healthCheckInput>) {
  assertEnabled();
  const d = healthCheckInput.parse(input);
  await requireOrgRole(userId, orgId, ORG_BUYERS);
  await assertCompanyOrg(orgId);
  await verifiedHospitals(d.hospitalIds, userId);
  return withScope({ userId, orgId }, async (tx) => {
    const [r] = await tx
      .insert(careRequest)
      .values({ requesterUserId: userId, requesterOrgId: orgId, kind: "health_check", treatment: d.treatment, headcount: d.headcount, ageRange: d.ageBand || null, travellingFrom: "India", arriveMonth: d.arriveMonth || null, note: d.note })
      .returning();
    const quotes = await tx.insert(careQuote).values(d.hospitalIds.map((h) => ({ requestId: r.id, orgId: h, requesterUserId: userId, requesterOrgId: orgId }))).returning();
    for (const q of quotes) await enqueue(tx, { type: "care.requested", payload: { quoteId: q.id, orgId: q.orgId } });
    return r;
  });
}

export async function listMyCareRequests(userId: string) {
  const rows = await withScope({ userId }, async (tx) => {
    const reqs = await tx.select().from(careRequest).where(eq(careRequest.requesterUserId, userId)).orderBy(desc(careRequest.createdAt));
    const quotes = reqs.length ? await tx.select().from(careQuote).where(inArray(careQuote.requestId, reqs.map((r) => r.id))) : [];
    return reqs.map((r) => ({ ...r, quotes: quotes.filter((q) => q.requestId === r.id) }));
  });
  const hs = await hospitalsByIds(rows.flatMap((r) => r.quotes.map((q) => q.orgId)));
  return rows.map((r) => ({ ...r, quotes: r.quotes.map((q) => ({ ...q, hospitalName: hs.get(q.orgId)?.name ?? "Hospital" })) }));
}

/** Everything the traveller sees about one request: quotes to compare, reports and consent, trip plan. */
export async function getCareRequest(userId: string, requestId: string) {
  assertUuid(requestId, "Request");
  const data = await withScope({ userId }, async (tx) => {
    const r = await tx.query.careRequest.findFirst({ where: and(eq(careRequest.id, requestId), eq(careRequest.requesterUserId, userId)) });
    if (!r) throw notFound("Request not found");
    const quotes = await tx.select().from(careQuote).where(eq(careQuote.requestId, r.id)).orderBy(asc(careQuote.createdAt));
    const reports = await tx.select().from(careReport).where(eq(careReport.requestId, r.id)).orderBy(asc(careReport.createdAt));
    const ids = reports.map((x) => x.id);
    const shares = ids.length ? await tx.select().from(careReportShare).where(inArray(careReportShare.reportId, ids)) : [];
    const access = ids.length ? await tx.select().from(careReportAccess).where(inArray(careReportAccess.reportId, ids)).orderBy(desc(careReportAccess.openedAt)) : [];
    const trip = await tx.query.careTrip.findFirst({ where: eq(careTrip.requestId, r.id) });
    return { request: r, quotes, reports, shares, access, trip };
  });
  const pkgIds = data.quotes.map((q) => q.packageId).filter((x): x is string => Boolean(x));
  const pkgs = pkgIds.length ? await getDb().select().from(carePackage).where(inArray(carePackage.id, pkgIds)) : [];
  const hs = await hospitalsByIds(data.quotes.map((q) => q.orgId));
  const accepted = data.quotes.find((q) => q.status === "accepted");
  const hospital = (orgId: string) => {
    const h = hs.get(orgId);
    return h ? { orgId, name: h.name, slug: h.slug, city: h.city, contact: accepted?.orgId === orgId ? h.contact : null } : null;
  };
  return {
    ...data,
    reports: data.reports.map(({ blobPath, ...r }) => ({
      ...r,
      available: Boolean(blobPath),
      sharedWith: data.shares.filter((s) => s.reportId === r.id && !s.revokedAt).map((s) => s.orgId),
      opens: data.access.filter((a) => a.reportId === r.id).map((a) => ({ orgId: a.orgId, hospitalName: hs.get(a.orgId)?.name ?? "Hospital", openedAt: a.openedAt })),
    })),
    quotes: data.quotes.map((q) => ({ ...q, hospital: hospital(q.orgId), package: pkgs.find((p) => p.id === q.packageId) ?? null })),
    accepted: accepted ? { ...accepted, hospital: hospital(accepted.orgId), package: pkgs.find((p) => p.id === accepted.packageId) ?? null } : null,
    enabled: careTravelEnabled(),
  };
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { key: "passport", label: "Passport valid for 6 months after you return", done: false },
  { key: "visa", label: "Medical visa (ask the hospital for an invitation letter)", done: false },
  { key: "reports", label: "Reports shared with the hospital, or brought with you", done: false },
  { key: "insurance", label: "Travel insurance that covers your treatment trip", done: false },
  { key: "flights", label: "Flights booked", done: false },
  { key: "stay", label: "Recovery stay booked near the hospital", done: false },
  { key: "companion", label: "Companion's documents and visa", done: false },
  { key: "money", label: "Payment plan agreed with the hospital (paid to them directly)", done: false },
];

/** Reports stop being visible to hospitals that are no longer working on the request. */
async function unshareFrom(tx: Parameters<Parameters<typeof withScope>[1]>[0], requestId: string, orgIds: string[]) {
  if (!orgIds.length) return;
  const reps = await tx.select({ id: careReport.id }).from(careReport).where(eq(careReport.requestId, requestId));
  if (!reps.length) return;
  await tx
    .update(careReportShare)
    .set({ revokedAt: new Date() })
    .where(and(inArray(careReportShare.reportId, reps.map((x) => x.id)), inArray(careReportShare.orgId, orgIds), isNull(careReportShare.revokedAt)));
}

/** Accepting one quote closes the others and starts the trip plan. The chosen hospital now sees who you are. */
export async function acceptQuote(userId: string, requestId: string, quoteId: string) {
  assertEnabled();
  assertUuid(quoteId, "Quote");
  return withScope({ userId }, async (tx) => {
    const r = await tx.query.careRequest.findFirst({ where: and(eq(careRequest.id, requestId), eq(careRequest.requesterUserId, userId)) });
    if (!r) throw notFound("Request not found");
    if (r.status !== "open") throw badRequest("This request is no longer open");
    const [q] = await tx.select().from(careQuote).where(and(eq(careQuote.id, quoteId), eq(careQuote.requestId, r.id))).for("update");
    if (!q) throw notFound("Quote not found");
    if (q.status !== "quoted") throw badRequest("You can only accept a quote the hospital has sent");
    if (q.validUntil && q.validUntil < todayIst()) throw badRequest("This quote has expired. Ask the hospital for a new one.");
    const now = new Date();
    await tx.update(careQuote).set({ status: "accepted", acceptedAt: now }).where(eq(careQuote.id, q.id));
    const others = await tx
      .update(careQuote)
      .set({ status: "not_selected" })
      .where(and(eq(careQuote.requestId, r.id), inArray(careQuote.status, ["requested", "reports_requested", "quoted"]), sql`${careQuote.id} <> ${q.id}`))
      .returning({ id: careQuote.id, orgId: careQuote.orgId });
    await tx.update(careRequest).set({ status: "accepted", updatedAt: now }).where(eq(careRequest.id, r.id));
    // Hospitals not chosen (or that declined earlier) can no longer open the traveller's reports.
    const notChosen = await tx.select({ orgId: careQuote.orgId }).from(careQuote).where(and(eq(careQuote.requestId, r.id), sql`${careQuote.id} <> ${q.id}`));
    await unshareFrom(tx, r.id, notChosen.map((x) => x.orgId));
    if (r.kind === "treatment") {
      const checklist = DEFAULT_CHECKLIST.filter((c) => c.key !== "companion" || r.companions > 0);
      await tx.insert(careTrip).values({ requestId: r.id, ownerUserId: userId, quoteId: q.id, arriveOn: q.earliestDate, checklist });
    }
    await enqueue(tx, { type: "care.accepted", payload: { quoteId: q.id, orgId: q.orgId } });
    for (const o of others) await enqueue(tx, { type: "care.not_selected", payload: { quoteId: o.id, orgId: o.orgId } });
    await audit(tx, { actorId: userId, action: "care.quote_accept", targetType: "care_quote", targetId: q.id });
    return { requestId: r.id, quoteId: q.id };
  });
}

/** Withdraw an open request: hospitals stop seeing it as open; shared reports are unshared. */
export async function withdrawCareRequest(userId: string, requestId: string) {
  assertUuid(requestId, "Request");
  return withScope({ userId }, async (tx) => {
    const r = await tx.query.careRequest.findFirst({ where: and(eq(careRequest.id, requestId), eq(careRequest.requesterUserId, userId)) });
    if (!r) throw notFound("Request not found");
    if (r.status !== "open") throw badRequest("Only open requests can be withdrawn");
    await tx.update(careRequest).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(careRequest.id, r.id));
    await tx.update(careQuote).set({ status: "withdrawn" }).where(and(eq(careQuote.requestId, r.id), inArray(careQuote.status, ["requested", "reports_requested", "quoted"])));
    const reps = await tx.select({ id: careReport.id }).from(careReport).where(eq(careReport.requestId, r.id));
    if (reps.length) await tx.update(careReportShare).set({ revokedAt: new Date() }).where(and(inArray(careReportShare.reportId, reps.map((x) => x.id)), isNull(careReportShare.revokedAt)));
  });
}

// ---------- Reports (traveller) ----------

const REPORT_TYPES: Record<string, true> = { "application/pdf": true, "image/jpeg": true, "image/png": true };

/** Upload a report to this request. It is encrypted before storage and shared with no one until you choose. */
export async function uploadReport(userId: string, requestId: string, file: unknown, name = "") {
  assertEnabled();
  assertUuid(requestId, "Request");
  if (!(file instanceof File) || file.size === 0) throw badRequest("Attach a file");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Files must be 4 MB or smaller");
  if (!REPORT_TYPES[file.type]) throw badRequest("Upload a PDF, JPG or PNG");
  const r = await withScope({ userId }, (tx) => tx.query.careRequest.findFirst({ where: and(eq(careRequest.id, requestId), eq(careRequest.requesterUserId, userId)) }));
  if (!r) throw notFound("Request not found");
  if (r.kind !== "treatment") throw badRequest("Health check-up requests for companies never take reports");
  if (r.status !== "open" && r.status !== "accepted") throw badRequest("This request is closed");
  const trip = await withScope({ userId }, (tx) => tx.query.careTrip.findFirst({ where: eq(careTrip.requestId, r.id) }));
  const id = crypto.randomUUID();
  const sealed = encryptFile(Buffer.from(await file.arrayBuffer()));
  const blobPath = await putPrivateFile(`care-reports/${r.id}/${id}.bin`, new Blob([new Uint8Array(sealed)]), "application/octet-stream");
  const deleteAfter = trip?.departOn ? new Date(new Date(`${trip.departOn}T23:59:59+05:30`).getTime() + REPORT_DAYS_AFTER_TRIP * DAY) : new Date(Date.now() + REPORT_DAYS_WITHOUT_TRIP * DAY);
  return withScope({ userId }, async (tx) => {
    const [row] = await tx
      .insert(careReport)
      .values({ id, requestId: r.id, ownerUserId: userId, name: (name || file.name).slice(0, 120), contentType: file.type, sizeBytes: file.size, blobPath, deleteAfter })
      .returning({ id: careReport.id, name: careReport.name, deleteAfter: careReport.deleteAfter });
    await audit(tx, { actorId: userId, action: "care_report.upload", targetType: "care_report", targetId: row.id });
    return row;
  });
}

async function ownReport(tx: Parameters<Parameters<typeof withScope>[1]>[0], userId: string, reportId: string) {
  assertUuid(reportId, "Report");
  const rep = await tx.query.careReport.findFirst({ where: and(eq(careReport.id, reportId), eq(careReport.ownerUserId, userId)) });
  if (!rep) throw notFound("Report not found");
  return rep;
}

export const shareInput = z.object({ orgId: z.string().uuid(), consent: z.literal(true, { message: "Tick the box to confirm you agree to share this report" }) });

/** Share a report with one of the hospitals on the request, recording consent. */
export async function shareReport(userId: string, reportId: string, input: z.input<typeof shareInput>) {
  assertEnabled();
  const d = shareInput.parse(input);
  return withScope({ userId }, async (tx) => {
    const rep = await ownReport(tx, userId, reportId);
    if (!rep.blobPath) throw badRequest("This report has been deleted");
    const q = await tx.query.careQuote.findFirst({ where: and(eq(careQuote.requestId, rep.requestId), eq(careQuote.orgId, d.orgId)) });
    if (!q || ["declined", "withdrawn", "not_selected"].includes(q.status)) throw badRequest("Share reports only with hospitals still working on your request");
    await tx
      .insert(careReportShare)
      .values({ reportId: rep.id, orgId: d.orgId, ownerUserId: userId, consentText: CONSENT_TEXT })
      .onConflictDoUpdate({ target: [careReportShare.reportId, careReportShare.orgId], set: { revokedAt: null, consentedAt: new Date(), consentText: CONSENT_TEXT } });
    await audit(tx, { actorId: userId, action: "care_report.share", targetType: "care_report", targetId: rep.id, metadata: { orgId: d.orgId } });
    await enqueue(tx, { type: "care.report_shared", payload: { quoteId: q.id, orgId: d.orgId } });
  });
}

export async function revokeReportShare(userId: string, reportId: string, orgId: string) {
  assertUuid(orgId, "Hospital");
  return withScope({ userId }, async (tx) => {
    const rep = await ownReport(tx, userId, reportId);
    await tx.update(careReportShare).set({ revokedAt: new Date() }).where(and(eq(careReportShare.reportId, rep.id), eq(careReportShare.orgId, orgId), isNull(careReportShare.revokedAt)));
    await audit(tx, { actorId: userId, action: "care_report.revoke", targetType: "care_report", targetId: rep.id, metadata: { orgId } });
  });
}

export async function setReportKeep(userId: string, reportId: string, keep: boolean) {
  return withScope({ userId }, async (tx) => {
    const rep = await ownReport(tx, userId, reportId);
    await tx.update(careReport).set({ keep }).where(eq(careReport.id, rep.id));
  });
}

/** Delete now: the file is destroyed and every share ends. The access log remains. */
export async function deleteReport(userId: string, reportId: string) {
  const rep = await withScope({ userId }, (tx) => ownReport(tx, userId, reportId));
  if (rep.blobPath) await deletePrivateFile(rep.blobPath);
  return withScope({ userId }, async (tx) => {
    await tx.update(careReport).set({ blobPath: null, deletedAt: new Date() }).where(eq(careReport.id, rep.id));
    await tx.update(careReportShare).set({ revokedAt: new Date() }).where(and(eq(careReportShare.reportId, rep.id), isNull(careReportShare.revokedAt)));
    await audit(tx, { actorId: userId, action: "care_report.delete", targetType: "care_report", targetId: rep.id });
  });
}

/** The traveller downloads their own report (decrypted). */
export async function openOwnReport(userId: string, reportId: string) {
  const rep = await withScope({ userId }, (tx) => ownReport(tx, userId, reportId));
  return readReport(rep);
}

async function readReport(rep: typeof careReport.$inferSelect) {
  if (!rep.blobPath) throw notFound("This report has been deleted");
  const stored = await readPrivateFile(rep.blobPath);
  if (!stored) throw notFound("Report not found");
  return { body: decryptFile(stored), contentType: rep.contentType, name: rep.name };
}

/** Retention: delete reports past their date (unless kept). Platform job (cron), like the outbox. */
export async function purgeExpiredReports() {
  const due = await withScope({ userId: null, bypass: true }, (tx) =>
    tx.select().from(careReport).where(and(lt(careReport.deleteAfter, new Date()), eq(careReport.keep, false), isNull(careReport.deletedAt))),
  );
  for (const rep of due) {
    if (rep.blobPath) await deletePrivateFile(rep.blobPath);
    await withScope({ userId: null, bypass: true }, async (tx) => {
      await tx.update(careReport).set({ blobPath: null, deletedAt: new Date() }).where(eq(careReport.id, rep.id));
      await tx.update(careReportShare).set({ revokedAt: new Date() }).where(and(eq(careReportShare.reportId, rep.id), isNull(careReportShare.revokedAt)));
      await audit(tx, { actorId: null, action: "care_report.retention_delete", targetType: "care_report", targetId: rep.id });
    });
  }
  return { deleted: due.length };
}

// ---------- Hospital desk ----------

/** The hospital's quote requests. The requester is anonymous until they accept this hospital's quote. */
export async function listHospitalQuotes(userId: string, orgId: string) {
  await assertHospital(orgId);
  const rows = await withScope({ userId, orgId }, async (tx) => {
    const m = await requireOrgRole(userId, orgId, ORG_ALL, tx);
    const quotes = await tx.select().from(careQuote).where(eq(careQuote.orgId, orgId)).orderBy(desc(careQuote.createdAt));
    const reqs = quotes.length ? await tx.select().from(careRequest).where(inArray(careRequest.id, quotes.map((q) => q.requestId))) : [];
    const reports = reqs.length ? await tx.select({ id: careReport.id, requestId: careReport.requestId, name: careReport.name, blobPath: careReport.blobPath }).from(careReport).where(inArray(careReport.requestId, reqs.map((r) => r.id))) : [];
    return { canEdit: ORG_ADMINS.includes(m.role), quotes, reqs, reports };
  });
  const acceptedIds = rows.quotes.filter((q) => q.status === "accepted").map((q) => q.requesterUserId);
  const people = acceptedIds.length ? await getDb().select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, acceptedIds)) : [];
  const packages = await getDb().select().from(carePackage).where(eq(carePackage.orgId, orgId));
  return {
    canEdit: rows.canEdit,
    packages,
    quotes: rows.quotes.map((q) => {
      const r = rows.reqs.find((x) => x.id === q.requestId)!;
      return {
        ...q,
        request: r,
        reports: rows.reports.filter((x) => x.requestId === q.requestId && x.blobPath).map(({ blobPath: _b, ...x }) => (void _b, x)),
        patient: q.status === "accepted" ? (people.find((p) => p.id === q.requesterUserId) ?? null) : null,
      };
    }),
  };
}

export const quoteReplyInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("quote"),
      packageId: z.union([z.literal(""), z.string().uuid()]).default(""),
      priceMinRupees: rupees(10_000_000),
      priceMaxRupees: rupees(10_000_000),
      hospitalNights: z.coerce.number().int().min(0).max(60).default(0),
      earliestDate: z.union([z.literal(""), ymd]).default(""),
      validUntil: ymd,
      message: z.string().trim().max(1500).default(""),
    })
    .refine((v) => v.priceMinRupees > 0 && v.priceMaxRupees >= v.priceMinRupees, { message: "Enter a price range (the maximum at least the minimum)", path: ["priceMaxRupees"] }),
  z.object({ action: z.literal("decline"), message: z.string().trim().min(5, "Tell the traveller why (at least 5 characters)").max(800) }),
  z.object({ action: z.literal("ask_reports"), message: z.string().trim().min(5, "Say which reports you need").max(800) }),
]);

/** Owners and admins of the hospital reply: a quote, a decline, or a request for reports. */
export async function replyToQuote(userId: string, orgId: string, quoteId: string, input: z.input<typeof quoteReplyInput>) {
  const d = quoteReplyInput.parse(input);
  assertUuid(quoteId, "Quote");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_ADMINS, tx);
    const [q] = await tx.select().from(careQuote).where(and(eq(careQuote.id, quoteId), eq(careQuote.orgId, orgId))).for("update");
    if (!q) throw notFound("Request not found");
    if (!["requested", "reports_requested", "quoted"].includes(q.status)) throw badRequest("This request is closed");
    const now = new Date();
    if (d.action === "quote") {
      if (d.validUntil < todayIst()) throw badRequest("The quote must be valid until today or later");
      if (d.packageId) {
        const p = await tx.query.carePackage.findFirst({ where: and(eq(carePackage.id, d.packageId), eq(carePackage.orgId, orgId)) });
        if (!p) throw badRequest("Choose one of your packages");
      }
      await tx
        .update(careQuote)
        .set({
          status: "quoted",
          packageId: d.packageId || null,
          priceMinPaise: d.priceMinRupees * 100,
          priceMaxPaise: d.priceMaxRupees * 100,
          hospitalNights: d.hospitalNights,
          earliestDate: d.earliestDate || null,
          validUntil: d.validUntil,
          message: d.message,
          respondedBy: userId,
          respondedAt: now,
        })
        .where(eq(careQuote.id, q.id));
      await enqueue(tx, { type: "care.quoted", payload: { quoteId: q.id, requesterUserId: q.requesterUserId, requestId: q.requestId } });
    } else {
      await tx
        .update(careQuote)
        .set({ status: d.action === "decline" ? "declined" : "reports_requested", message: d.message, respondedBy: userId, respondedAt: now })
        .where(eq(careQuote.id, q.id));
      await enqueue(tx, { type: d.action === "decline" ? "care.declined" : "care.reports_requested", payload: { quoteId: q.id, requesterUserId: q.requesterUserId, requestId: q.requestId } });
      if (d.action === "decline") {
        // A hospital that declines can't keep reading the traveller's reports (bypass: the shares belong to the traveller).
        await withScope({ userId: null, bypass: true }, (b) => unshareFrom(b, q.requestId, [orgId]));
      }
    }
    await audit(tx, { actorId: userId, action: `care.quote_${d.action}`, targetType: "care_quote", targetId: q.id });
  });
}

/** Someone at the hospital opens a shared report: decrypted for them and logged. Members of the hospital only. */
export async function openSharedReport(userId: string, orgId: string, reportId: string) {
  assertUuid(reportId, "Report");
  const rep = await withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_ALL, tx);
    // Row-level security returns the report only while it is shared with this hospital.
    const r = await tx.query.careReport.findFirst({ where: eq(careReport.id, reportId) });
    if (!r?.blobPath) throw notFound("Report not found");
    await tx.insert(careReportAccess).values({ reportId: r.id, orgId, ownerUserId: r.ownerUserId, userId });
    return r;
  });
  return readReport(rep);
}

export async function hospitalOpenRequestCount(userId: string, orgId: string) {
  return withScope({ userId, orgId }, async (tx) => {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(careQuote).where(and(eq(careQuote.orgId, orgId), eq(careQuote.status, "requested")));
    return r.n;
  });
}

// ---------- Trip plan ----------

export const tripInput = z
  .object({ arriveOn: z.union([z.literal(""), ymd]).default(""), departOn: z.union([z.literal(""), ymd]).default(""), notes: z.string().trim().max(2000).default("") })
  .refine((v) => !v.arriveOn || !v.departOn || v.departOn > v.arriveOn, { message: "Departure must be after arrival", path: ["departOn"] });

async function ownTrip(userId: string, tripId: string) {
  assertUuid(tripId, "Trip");
  const t = await withScope({ userId }, (tx) => tx.query.careTrip.findFirst({ where: and(eq(careTrip.id, tripId), eq(careTrip.ownerUserId, userId)) }));
  if (!t) throw notFound("Trip not found");
  return t;
}

/** Set travel dates. Reports on this request will be deleted 90 days after departure (unless kept). */
export async function updateTrip(userId: string, tripId: string, input: z.input<typeof tripInput>) {
  const d = tripInput.parse(input);
  const t = await ownTrip(userId, tripId);
  return withScope({ userId }, async (tx) => {
    const [row] = await tx.update(careTrip).set({ arriveOn: d.arriveOn || null, departOn: d.departOn || null, notes: d.notes, updatedAt: new Date() }).where(eq(careTrip.id, t.id)).returning();
    if (d.departOn) {
      const after = new Date(new Date(`${d.departOn}T23:59:59+05:30`).getTime() + REPORT_DAYS_AFTER_TRIP * DAY);
      await tx.update(careReport).set({ deleteAfter: after }).where(and(eq(careReport.requestId, t.requestId), isNull(careReport.deletedAt)));
    }
    return row;
  });
}

export async function toggleChecklist(userId: string, tripId: string, key: string, done: boolean) {
  const t = await ownTrip(userId, tripId);
  if (!t.checklist.some((c) => c.key === key)) throw badRequest("Unknown checklist item");
  return withScope({ userId }, (tx) =>
    tx.update(careTrip).set({ checklist: t.checklist.map((c) => (c.key === key ? { ...c, done } : c)), updatedAt: new Date() }).where(eq(careTrip.id, t.id)),
  );
}

/** Link (or unlink) one of your homestay stays. The host is never told it's part of a care trip beyond the stay's own reason. */
export async function linkTripStay(userId: string, tripId: string, stayId: string | null) {
  const t = await ownTrip(userId, tripId);
  if (stayId) await getMyStay(userId, stayId); // 404 unless it's yours
  return withScope({ userId }, (tx) => tx.update(careTrip).set({ stayId, updatedAt: new Date() }).where(eq(careTrip.id, t.id)));
}

export type TimelineStep = { date: string | null; title: string; detail: string };

/** A day-by-day outline from the dates the traveller set and what the hospital quoted. */
export function buildTimeline(trip: { arriveOn: string | null; departOn: string | null }, quote: { earliestDate: string | null; hospitalNights: number | null }, recoveryNights: number, hospitalName: string, stayName?: string | null): TimelineStep[] {
  const add = (d: string | null, n: number) => (d ? isoDay(new Date(new Date(`${d}T00:00:00Z`).getTime() + n * DAY)) : null);
  const admit = quote.earliestDate && trip.arriveOn && quote.earliestDate >= trip.arriveOn ? quote.earliestDate : add(trip.arriveOn, 1);
  const discharge = add(admit, quote.hospitalNights ?? 0);
  const steps: TimelineStep[] = [
    { date: trip.arriveOn, title: "Arrive", detail: "Airport pick-up if the hospital offers it. Check in to your stay." },
    { date: admit, title: `Consultation and admission at ${hospitalName}`, detail: "Final price is confirmed after the consultation." },
  ];
  if ((quote.hospitalNights ?? 0) > 0) steps.push({ date: discharge, title: "Discharge", detail: `${quote.hospitalNights} night${quote.hospitalNights === 1 ? "" : "s"} in hospital, as quoted.` });
  if (recoveryNights > 0 || stayName) steps.push({ date: discharge, title: "Recovery stay", detail: stayName ? `At ${stayName}.` : `About ${recoveryNights} nights near the hospital is suggested.` });
  steps.push({ date: trip.departOn, title: "Fly home", detail: "Ask the hospital for your discharge summary before you leave." });
  return steps;
}

/** Homestays near the hospital for the recovery part of the trip. */
export async function recoveryStaysNear(city: string) {
  const near = await listDirectory("homestay", { city, feature: "near_hospital" });
  return near.length ? near.slice(0, 6) : (await listDirectory("homestay", { city })).slice(0, 6);
}

export const careLabels = { AGE_LABEL, NEED_LABEL, QUOTE_STATUS_LABEL };
export { todayIst };

/** A company's health check-up requests (any buyer in the company can see them). */
export async function listCompanyHealthChecks(userId: string, orgId: string) {
  const rows = await withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_BUYERS, tx);
    const reqs = await tx.select().from(careRequest).where(and(eq(careRequest.requesterOrgId, orgId), eq(careRequest.kind, "health_check"))).orderBy(desc(careRequest.createdAt));
    const quotes = reqs.length ? await tx.select().from(careQuote).where(inArray(careQuote.requestId, reqs.map((r) => r.id))) : [];
    return reqs.map((r) => ({ ...r, quotes: quotes.filter((q) => q.requestId === r.id) }));
  });
  const hs = await hospitalsByIds(rows.flatMap((r) => r.quotes.map((q) => q.orgId)));
  return rows.map((r) => ({ ...r, mine: r.requesterUserId === userId, quotes: r.quotes.map((q) => ({ ...q, hospitalName: hs.get(q.orgId)?.name ?? "Hospital" })) }));
}
