/**
 * Homestays and hospitals (M6): organisations of kind "homestay" or "hospital"
 * with a public listing that appears in a directory only after our team has
 * verified it against a per-type document checklist.
 *
 * - Members and roles work exactly like companies (organizations module). This
 *   module reads `organization` only for its name and slug; membership checks
 *   go through the organizations service.
 * - Verification documents live in `org_document` under row-level security
 *   (withScope with the org, or audited staff bypass) and in private storage.
 * - Contact email and phone are for verification only; the directory never shows them.
 * - Hospitals: no outcome claims, prices only ever "indicative", "not medical advice".
 */
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  ACCREDITATIONS,
  CANCELLATION_POLICIES,
  HOMESTAY_FEATURES,
  HOSPITAL_SERVES,
  listing,
  listingPhoto,
  orgDocument,
  organization,
  type ListingKind,
} from "@/db/schema";
import { getDb, withScope } from "@/db/client";
import { assertUuid, badRequest, notFound } from "@/lib/errors";
import { storeListingPhoto, storeOrgDocument } from "@/lib/storage";
import { audit, enqueue } from "@/modules/platform/outbox";
import { createOrganization, isActiveMember, listMemberships, ORG_ADMINS, ORG_ALL, renameOrganization, requireOrgRole } from "@/modules/organizations/service";

// ---------- Reference data ----------

export type ChecklistDoc = { key: string; label: string; hint: string; required: boolean };

/** What we check before a listing goes live. Staff tick each item when approving. */
export const DOC_CHECKLIST: Record<ListingKind, ChecklistDoc[]> = {
  homestay: [
    { key: "registration", label: "Homestay or tourism registration", hint: "Your state's homestay or tourism department certificate, or the local equivalent.", required: true },
    { key: "owner_id", label: "Owner's photo ID", hint: "PAN, passport, driving licence or Aadhaar with all but the last 4 digits masked.", required: true },
    { key: "property_proof", label: "Proof you own or lease the property", hint: "A recent electricity bill, property tax receipt or lease agreement.", required: true },
  ],
  hospital: [
    { key: "registration", label: "Clinical establishment registration", hint: "Registration under your state's Clinical Establishments Act, or the equivalent licence.", required: true },
    { key: "authorisation", label: "Letter authorising you to represent the hospital", hint: "On letterhead, signed by the medical superintendent or an authorised signatory.", required: true },
    { key: "accreditation", label: "Accreditation certificate (NABH, JCI or NABL)", hint: "Optional. Accreditations are shown publicly only after we check the certificate.", required: false },
  ],
};

export const FEATURE_LABEL: Record<(typeof HOMESTAY_FEATURES)[number], string> = {
  step_free: "Step-free access",
  ground_floor_room: "Ground-floor room",
  near_hospital: "Within 3 km of a hospital",
  diet_kitchen: "Kitchen for special diets",
  caregiver_room: "Room for a caregiver",
  quiet_hours: "Quiet hours",
  wifi_workspace: "Wi-Fi and a desk",
  parking: "Parking",
  meeting_space: "Space for team sessions",
};

export const SERVES_LABEL: Record<(typeof HOSPITAL_SERVES)[number], string> = {
  domestic: "Patients from India",
  international: "International patients",
  both: "Patients from India and abroad",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Not submitted",
  pending: "Waiting for review",
  verified: "Verified",
  changes_requested: "Changes requested",
  rejected: "Not approved",
};

export const KIND_LABEL: Record<ListingKind, string> = { homestay: "Homestay", hospital: "Hospital" };
const MIN_PHOTOS: Record<ListingKind, number> = { homestay: 3, hospital: 1 };
const MAX_PHOTOS = 12;

const listOf = (max: number, each = 60) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(",") : v),
    z.array(z.string().trim().max(each)).transform((a) => [...new Set(a.filter(Boolean))]).pipe(z.array(z.string()).max(max)),
  );

// ---------- Creating ----------

export const createListingInput = z.object({
  kind: z.enum(["homestay", "hospital"]),
  name: z.string().trim().min(2, "Enter a name of at least 2 characters").max(120),
  city: z.string().trim().min(2, "Enter the city").max(80),
});

/** Creates the organisation (caller becomes owner) and its draft listing in one transaction. */
export async function createListingOrg(actor: { id: string; email: string; emailVerified: boolean }, input: z.input<typeof createListingInput>) {
  const d = createListingInput.parse(input);
  return createOrganization(actor, { name: d.name, kind: d.kind }, async (tx, org) => {
    await tx.insert(listing).values({ orgId: org.id, kind: d.kind, city: d.city, contactEmail: actor.email });
  });
}

// ---------- Workspace ----------

export type ReadinessItem = { key: string; label: string; done: boolean; required: boolean };

function readiness(l: typeof listing.$inferSelect, docs: { docType: string; status: string }[], photos: number): ReadinessItem[] {
  const hasDoc = (k: string) => docs.some((d) => d.docType === k && d.status !== "rejected");
  const profileDone =
    l.kind === "homestay"
      ? Boolean(l.about.length >= 40 && l.city && l.rooms && l.priceFromPaise)
      : Boolean(l.about.length >= 40 && l.city && l.specialties.length > 0);
  return [
    { key: "profile", label: l.kind === "homestay" ? "About, city, rooms and price from" : "About, city and at least one specialty", done: profileDone, required: true },
    {
      key: "photos",
      label: MIN_PHOTOS[l.kind] > 1 ? `At least ${MIN_PHOTOS[l.kind]} photos` : "At least 1 photo",
      done: photos >= MIN_PHOTOS[l.kind],
      required: true,
    },
    ...DOC_CHECKLIST[l.kind].map((c) => ({ key: c.key, label: c.label, done: hasDoc(c.key), required: c.required })),
  ];
}

/** The workspace for members of a homestay or hospital; 404 for anyone else. */
export async function getListingWorkspace(userId: string, orgId: string) {
  assertUuid(orgId, "Organization");
  return withScope({ userId, orgId }, async (tx) => {
    const m = await requireOrgRole(userId, orgId, ORG_ALL, tx).catch(() => {
      throw notFound("Organization not found");
    });
    const org = await tx.query.organization.findFirst({ where: eq(organization.id, orgId) });
    const l = await tx.query.listing.findFirst({ where: eq(listing.orgId, orgId) });
    if (!org || !l) throw notFound("Organization not found");
    const docs = await tx
      .select({ id: orgDocument.id, docType: orgDocument.docType, name: orgDocument.name, status: orgDocument.status, reviewNote: orgDocument.reviewNote, createdAt: orgDocument.createdAt })
      .from(orgDocument)
      .where(eq(orgDocument.orgId, orgId))
      .orderBy(desc(orgDocument.createdAt));
    const photos = await tx.select().from(listingPhoto).where(eq(listingPhoto.orgId, orgId)).orderBy(asc(listingPhoto.position), asc(listingPhoto.createdAt));
    const items = readiness(l, docs, photos.length);
    return {
      org,
      listing: l,
      role: m.role,
      canEdit: ORG_ADMINS.includes(m.role),
      docs,
      photos,
      checklist: DOC_CHECKLIST[l.kind],
      readiness: items,
      ready: items.every((i) => i.done || !i.required),
      canSubmit: (l.status === "draft" || l.status === "changes_requested") && items.every((i) => i.done || !i.required),
    };
  });
}

const rupees = z.coerce.number().int().min(0).max(1_000_000);
const optInt = (max: number) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(0).max(max).nullable());

export const listingInput = z.object({
  name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(140).default(""),
  about: z.string().trim().max(3000).default(""),
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.string().trim().max(80).default(""),
  area: z.string().trim().max(120).default(""),
  contactEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid contact email")]).default(""),
  contactPhone: z.string().trim().max(20).regex(/^[+\d\s-]*$/, "Use digits, spaces, + or - in the phone number").default(""),
  website: z.union([z.literal(""), z.string().trim().url("Website must start with https://").max(200)]).default(""),
  languages: listOf(10, 40).default([]),
  // Homestay
  rooms: optInt(50).default(null),
  maxGuests: optInt(200).default(null),
  priceFromRupees: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), rupees.nullable()).default(null),
  features: z.array(z.enum(HOMESTAY_FEATURES)).default([]),
  houseRules: z.string().trim().max(1500).default(""),
  cancellationPolicy: z.enum(CANCELLATION_POLICIES).default("moderate"),
  minNights: z.coerce.number().int().min(1).max(30).default(1),
  checkInTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Check-in time like 14:00").default("14:00"),
  checkOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Check-out time like 11:00").default("11:00"),
  // Hospital
  specialties: listOf(20).default([]),
  accreditations: z.array(z.enum(ACCREDITATIONS)).default([]),
  beds: optInt(10_000).default(null),
  serves: z.enum(HOSPITAL_SERVES).default("both"),
  internationalDesk: z.boolean().default(false),
  visaLetter: z.boolean().default(false),
});

/** Owners and admins edit the listing. Changing accreditations clears their "checked" mark until staff check again. */
export async function updateListing(userId: string, orgId: string, input: z.input<typeof listingInput>) {
  const d = listingInput.parse(input);
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_ADMINS, tx);
    const l = await tx.query.listing.findFirst({ where: eq(listing.orgId, orgId) });
    if (!l) throw notFound("Listing not found");
    const homestay = l.kind === "homestay";
    const accreditations = homestay ? [] : d.accreditations;
    const sameAccreditations = [...accreditations].sort().join() === [...l.accreditations].sort().join();
    await renameOrganization(orgId, d.name, tx);
    const [row] = await tx
      .update(listing)
      .set({
        tagline: d.tagline,
        about: d.about,
        city: d.city,
        state: d.state,
        area: d.area,
        contactEmail: d.contactEmail,
        contactPhone: d.contactPhone,
        website: d.website,
        languages: d.languages,
        rooms: homestay ? d.rooms : null,
        maxGuests: homestay ? d.maxGuests : null,
        priceFromPaise: homestay && d.priceFromRupees !== null ? d.priceFromRupees * 100 : null,
        features: homestay ? d.features : [],
        houseRules: homestay ? d.houseRules : "",
        cancellationPolicy: d.cancellationPolicy,
        minNights: d.minNights,
        checkInTime: d.checkInTime,
        checkOutTime: d.checkOutTime,
        specialties: homestay ? [] : d.specialties,
        accreditations,
        accreditationVerified: sameAccreditations ? l.accreditationVerified : false,
        beds: homestay ? null : d.beds,
        serves: d.serves,
        internationalDesk: homestay ? false : d.internationalDesk,
        visaLetter: homestay ? false : d.visaLetter,
        updatedAt: new Date(),
      })
      .where(eq(listing.orgId, orgId))
      .returning();
    return row;
  });
}

export const documentInput = z.object({ docType: z.string().min(1), name: z.string().trim().max(120).default("") });

export async function uploadDocument(userId: string, orgId: string, input: z.input<typeof documentInput>, file: unknown) {
  const d = documentInput.parse(input);
  assertUuid(orgId, "Organization");
  // Check access before storing anything.
  const kind = await withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_ADMINS, tx);
    const l = await tx.query.listing.findFirst({ where: eq(listing.orgId, orgId), columns: { kind: true } });
    if (!l) throw notFound("Listing not found");
    return l.kind;
  });
  const item = DOC_CHECKLIST[kind].find((c) => c.key === d.docType);
  if (!item) throw badRequest("Choose which document this is");
  const blobPath = await storeOrgDocument(orgId, file);
  return withScope({ userId, orgId }, async (tx) => {
    const [row] = await tx
      .insert(orgDocument)
      .values({ orgId, docType: item.key, name: d.name || item.label, blobPath, uploadedBy: userId })
      .returning({ id: orgDocument.id, docType: orgDocument.docType, name: orgDocument.name, status: orgDocument.status });
    await audit(tx, { actorId: userId, action: "org_document.upload", targetType: "organization", targetId: orgId, metadata: { docType: item.key } });
    return row;
  });
}

/** Documents still waiting for review can be removed; reviewed ones stay as the record. */
export async function removeDocument(userId: string, orgId: string, documentId: string) {
  assertUuid(documentId, "Document");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_ADMINS, tx);
    const [row] = await tx
      .delete(orgDocument)
      .where(and(eq(orgDocument.id, documentId), eq(orgDocument.orgId, orgId), eq(orgDocument.status, "pending")))
      .returning({ id: orgDocument.id });
    if (!row) throw notFound("Only documents waiting for review can be removed");
  });
}

/** A member opens one of their organisation's own documents (RLS scoped). */
export async function openOwnDocument(userId: string, orgId: string, documentId: string) {
  assertUuid(documentId, "Document");
  return withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_ALL, tx);
    const doc = await tx.query.orgDocument.findFirst({ where: and(eq(orgDocument.id, documentId), eq(orgDocument.orgId, orgId)) });
    if (!doc) throw notFound("Document not found");
    return doc.blobPath;
  });
}

export async function addPhoto(userId: string, orgId: string, file: unknown, caption = "") {
  assertUuid(orgId, "Organization");
  const count = await withScope({ userId, orgId }, async (tx) => {
    await requireOrgRole(userId, orgId, ORG_ADMINS, tx);
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(listingPhoto).where(eq(listingPhoto.orgId, orgId));
    return r.n;
  });
  if (count >= MAX_PHOTOS) throw badRequest(`You can add up to ${MAX_PHOTOS} photos`);
  const blobPath = await storeListingPhoto(orgId, file);
  const [row] = await getDb()
    .insert(listingPhoto)
    .values({ orgId, blobPath, caption: caption.trim().slice(0, 140), position: count })
    .returning();
  return row;
}

export async function removePhoto(userId: string, orgId: string, photoId: string) {
  assertUuid(photoId, "Photo");
  await requireOrgRole(userId, orgId, ORG_ADMINS);
  const [row] = await getDb().delete(listingPhoto).where(and(eq(listingPhoto.id, photoId), eq(listingPhoto.orgId, orgId))).returning({ id: listingPhoto.id });
  if (!row) throw notFound("Photo not found");
}

/** Sends the listing to our team. Everything required on the checklist must be there. */
export async function submitListing(userId: string, orgId: string) {
  const w = await getListingWorkspace(userId, orgId);
  if (!w.canEdit) throw notFound("Organization not found");
  if (w.listing.status === "pending") throw badRequest("Already waiting for review");
  if (w.listing.status === "verified") throw badRequest("Already verified");
  if (w.listing.status === "rejected") throw badRequest("This listing was not approved. Contact support if something has changed.");
  const missing = w.readiness.filter((i) => i.required && !i.done);
  if (missing.length) throw badRequest(`Still needed: ${missing.map((i) => i.label.toLowerCase()).join("; ")}`);
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(listing)
      .set({ status: "pending", submittedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(listing.orgId, orgId), inArray(listing.status, ["draft", "changes_requested"])))
      .returning();
    if (!row) throw badRequest("Already submitted");
    await audit(tx, { actorId: userId, action: "listing.submit", targetType: "organization", targetId: orgId });
    return row;
  });
}

// ---------- Review (platform staff; called only from the admin module) ----------

export const listingReviewInput = z
  .object({
    decision: z.enum(["approved", "changes_requested", "rejected"]),
    note: z.string().trim().max(1000).default(""),
    checked: z.array(z.string()).default([]),
  })
  .refine((v) => v.decision === "approved" || v.note.length >= 5, { message: "Add a note explaining what's needed", path: ["note"] });

/** Staff checklist: the documents plus a look at the details and photos. */
export function staffChecklist(kind: ListingKind, docs: { docType: string }[]) {
  return [
    { key: "details", label: "Name, address and details match the documents", required: true },
    { key: "photos", label: kind === "homestay" ? "Photos show the real property and rooms" : "Photos show the hospital", required: true },
    ...DOC_CHECKLIST[kind].map((c) => ({
      key: c.key,
      label: `${c.label}: valid, readable and in the listing's name`,
      required: c.required || docs.some((d) => d.docType === c.key),
    })),
  ];
}

/**
 * Approve: listing goes live; pending documents become approved; accreditations
 * are marked checked only if an accreditation certificate was ticked.
 * Every decision is audited and the organisation's admins are emailed.
 */
export async function reviewListing(reviewerId: string, orgId: string, input: z.input<typeof listingReviewInput>) {
  const d = listingReviewInput.parse(input);
  assertUuid(orgId, "Organization");
  return withScope({ bypass: true, userId: reviewerId }, async (tx) => {
    const l = await tx.query.listing.findFirst({ where: eq(listing.orgId, orgId) });
    if (!l) throw notFound("Listing not found");
    if (l.status !== "pending" && !(l.status === "verified" && d.decision !== "approved")) {
      throw badRequest("Only listings waiting for review can be decided");
    }
    const docs = await tx.select({ id: orgDocument.id, docType: orgDocument.docType, status: orgDocument.status }).from(orgDocument).where(eq(orgDocument.orgId, orgId));
    const now = new Date();
    if (d.decision === "approved") {
      const missing = staffChecklist(l.kind, docs).filter((c) => c.required && !d.checked.includes(c.key));
      if (missing.length) throw badRequest(`Tick every check before approving: ${missing.map((m) => m.label).join("; ")}`);
      await tx
        .update(orgDocument)
        .set({ status: "approved", reviewedBy: reviewerId, reviewedAt: now })
        .where(and(eq(orgDocument.orgId, orgId), eq(orgDocument.status, "pending")));
    }
    const accreditationChecked = d.decision === "approved" && d.checked.includes("accreditation") && docs.some((x) => x.docType === "accreditation");
    const [row] = await tx
      .update(listing)
      .set({
        status: d.decision === "approved" ? "verified" : d.decision,
        reviewedAt: now,
        reviewedBy: reviewerId,
        reviewNote: d.note || null,
        verifiedAt: d.decision === "approved" ? now : l.verifiedAt,
        accreditationVerified: d.decision === "approved" ? accreditationChecked && l.accreditations.length > 0 : l.accreditationVerified,
        updatedAt: now,
      })
      .where(eq(listing.orgId, orgId))
      .returning();
    await audit(tx, { actorId: reviewerId, action: `listing.${d.decision}`, targetType: "organization", targetId: orgId, metadata: { note: d.note, checked: d.checked } });
    await enqueue(tx, { type: "listing.reviewed", payload: { orgId, decision: d.decision } });
    return row;
  });
}

// ---------- Directory (public) ----------

const visible = (kind: ListingKind) => and(eq(listing.kind, kind), eq(listing.status, "verified"));

export const directoryInput = z.object({
  city: z.string().trim().max(80).optional(),
  q: z.string().trim().max(80).optional(),
  feature: z.enum(HOMESTAY_FEATURES).optional(),
  specialty: z.string().trim().max(60).optional(),
  international: z.coerce.boolean().optional(),
});

function firstPhotoSql() {
  return sql<string | null>`(select p.id from ${listingPhoto} p where p.org_id = ${listing.orgId} order by p.position, p.created_at limit 1)`;
}

/** Verified listings only, newest verified first. */
export async function listDirectory(kind: ListingKind, filters: z.input<typeof directoryInput> = {}) {
  const f = directoryInput.parse(filters);
  const where: (SQL | undefined)[] = [visible(kind)];
  if (f.city) where.push(ilike(listing.city, `${f.city.replace(/[%_]/g, "")}%`));
  if (f.q) {
    const q = `%${f.q.replace(/[%_]/g, "")}%`;
    where.push(or(ilike(organization.name, q), ilike(listing.tagline, q), ilike(listing.area, q), sql`array_to_string(${listing.specialties}, ',') ilike ${q}`));
  }
  if (f.feature) where.push(sql`${f.feature} = any(${listing.features})`);
  if (f.specialty) where.push(sql`exists (select 1 from unnest(${listing.specialties}) s where s ilike ${f.specialty.replace(/[%_]/g, "")})`);
  if (f.international) where.push(inArray(listing.serves, ["international", "both"]));
  const rows = await getDb()
    .select({ listing, name: organization.name, slug: organization.slug, photoId: firstPhotoSql() })
    .from(listing)
    .innerJoin(organization, eq(organization.id, listing.orgId))
    .where(and(...where))
    .orderBy(desc(listing.verifiedAt))
    .limit(60);
  return rows.map((r) => ({ ...r, listing: publicFields(r.listing) }));
}

/** Strip what the public never sees. */
function publicFields(l: typeof listing.$inferSelect) {
  const { contactEmail: _e, contactPhone: _p, reviewNote: _n, reviewedBy: _r, ...rest } = l;
  void _e; void _p; void _n; void _r;
  return { ...rest, accreditations: l.accreditationVerified ? l.accreditations : [] };
}

/** A listing page: public when verified; members of the organisation can preview it before that. */
export async function getPublicListing(viewerId: string | null, kind: ListingKind, slug: string) {
  const db = getDb();
  const [row] = await db
    .select({ listing, org: organization })
    .from(listing)
    .innerJoin(organization, eq(organization.id, listing.orgId))
    .where(and(eq(organization.slug, slug), eq(listing.kind, kind)));
  if (!row) throw notFound("Not found");
  const isMember = await isActiveMember(viewerId, row.org.id);
  const isPublic = row.listing.status === "verified";
  if (!isPublic && !isMember) throw notFound("Not found");
  const photos = await db
    .select({ id: listingPhoto.id, caption: listingPhoto.caption })
    .from(listingPhoto)
    .where(eq(listingPhoto.orgId, row.org.id))
    .orderBy(asc(listingPhoto.position), asc(listingPhoto.createdAt));
  return { listing: publicFields(row.listing), name: row.org.name, orgId: row.org.id, slug: row.org.slug, photos, isMember, isPublic };
}

/** Photo file path if the viewer may see it: anyone for verified listings, else members (staff via admin). */
export async function openListingPhoto(viewerId: string | null, photoId: string, isStaff = false) {
  assertUuid(photoId, "Photo");
  const db = getDb();
  const [row] = await db
    .select({ blobPath: listingPhoto.blobPath, orgId: listingPhoto.orgId, status: listing.status })
    .from(listingPhoto)
    .innerJoin(listing, eq(listing.orgId, listingPhoto.orgId))
    .where(eq(listingPhoto.id, photoId));
  if (!row) throw notFound("Photo not found");
  const isPublic = row.status === "verified";
  if (!isPublic && !isStaff && !(await isActiveMember(viewerId, row.orgId))) throw notFound("Photo not found");
  return { blobPath: row.blobPath, isPublic };
}

/** Counts for the home page tabs. */
export async function directoryCounts() {
  const rows = await getDb()
    .select({ kind: listing.kind, n: sql<number>`count(*)::int` })
    .from(listing)
    .where(eq(listing.status, "verified"))
    .groupBy(listing.kind);
  const get = (k: string) => rows.find((r) => r.kind === k)?.n ?? 0;
  return { homestays: get("homestay"), hospitals: get("hospital") };
}

/** The homestays and hospitals this user belongs to (app home and navigation). */
export async function listingsForUser(userId: string) {
  const mine = (await listMemberships(userId)).filter((r) => r.membership.status === "active" && (r.organization.kind === "homestay" || r.organization.kind === "hospital"));
  if (!mine.length) return [];
  const rows = await getDb().select({ orgId: listing.orgId, status: listing.status, kind: listing.kind }).from(listing).where(inArray(listing.orgId, mine.map((m) => m.organization.id)));
  return mine.flatMap((m) => {
    const l = rows.find((r) => r.orgId === m.organization.id);
    return l ? [{ orgId: m.organization.id, name: m.organization.name, slug: m.organization.slug, kind: l.kind, status: l.status, role: m.membership.role }] : [];
  });
}

export const ACCREDITATIONS_LIST = ACCREDITATIONS;

/** What the stays module needs to quote and book a homestay. Null unless it's a verified homestay. */
export async function getBookableHomestay(orgId: string) {
  assertUuid(orgId, "Homestay");
  const [row] = await getDb()
    .select({ listing, name: organization.name, slug: organization.slug })
    .from(listing)
    .innerJoin(organization, eq(organization.id, listing.orgId))
    .where(and(eq(listing.orgId, orgId), eq(listing.kind, "homestay")));
  if (!row) return null;
  const l = row.listing;
  return {
    orgId: l.orgId,
    name: row.name,
    slug: row.slug,
    verified: l.status === "verified",
    city: l.city,
    rooms: l.rooms ?? 0,
    maxGuests: l.maxGuests,
    priceFromPaise: l.priceFromPaise,
    minNights: l.minNights,
    cancellationPolicy: l.cancellationPolicy,
    checkInTime: l.checkInTime,
    checkOutTime: l.checkOutTime,
  };
}

/** Names and slugs for a set of homestays (for stay lists). */
export async function homestayNames(orgIds: string[]) {
  if (!orgIds.length) return new Map<string, { name: string; slug: string; city: string; area: string }>();
  const rows = await getDb()
    .select({ orgId: listing.orgId, name: organization.name, slug: organization.slug, city: listing.city, area: listing.area })
    .from(listing)
    .innerJoin(organization, eq(organization.id, listing.orgId))
    .where(inArray(listing.orgId, [...new Set(orgIds)]));
  return new Map(rows.map((r) => [r.orgId, r]));
}

/**
 * Hospitals by id, for Care & Travel. `contact` (the desk email and phone) is
 * only for travellers whose quote the hospital has accepted; callers decide.
 */
export async function hospitalsByIds(orgIds: string[]) {
  if (!orgIds.length) return new Map<string, { orgId: string; name: string; slug: string; city: string; verified: boolean; contact: { email: string; phone: string; website: string } }>();
  const rows = await getDb()
    .select({ listing, name: organization.name, slug: organization.slug })
    .from(listing)
    .innerJoin(organization, eq(organization.id, listing.orgId))
    .where(and(inArray(listing.orgId, [...new Set(orgIds)]), eq(listing.kind, "hospital")));
  return new Map(
    rows.map((r) => [
      r.listing.orgId,
      { orgId: r.listing.orgId, name: r.name, slug: r.slug, city: r.listing.city, verified: r.listing.status === "verified", contact: { email: r.listing.contactEmail, phone: r.listing.contactPhone, website: r.listing.website } },
    ]),
  );
}
