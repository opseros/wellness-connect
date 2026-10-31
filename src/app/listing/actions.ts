"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { withMessage } from "@/lib/flash";
import { requireUser } from "@/modules/identity/session";
import { inviteMember, removeMember } from "@/modules/organizations/service";
import { addPhoto, removeDocument, removePhoto, submitListing, updateListing, uploadDocument } from "@/modules/listings/service";
import { hostCancelStay, respondToStay, updateCalendar } from "@/modules/stays/service";
import { createPackage, replyToQuote, setPackageActive, updatePackage } from "@/modules/care/service";

// Every action re-checks the session; the services check the role again.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const orgOf = (f: FormData) => str(f, "orgId");

async function run(orgId: string, anchor: string, ok: string, fn: () => Promise<unknown>) {
  const base = `/listing/${orgId}${anchor}`;
  let target: string;
  try {
    await fn();
    revalidatePath(`/listing/${orgId}`);
    target = withMessage(base, "msg", ok);
  } catch (e) {
    const text =
      e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong. Please try again.";
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    target = withMessage(base, "error", text);
  }
  redirect(target);
}

export async function saveListingAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  await run(orgId, "#details", "Details saved.", () =>
    updateListing(me.id, orgId, {
      name: str(form, "name"),
      tagline: str(form, "tagline"),
      about: str(form, "about"),
      city: str(form, "city"),
      state: str(form, "state"),
      area: str(form, "area"),
      contactEmail: str(form, "contactEmail"),
      contactPhone: str(form, "contactPhone"),
      website: str(form, "website"),
      languages: str(form, "languages"),
      rooms: str(form, "rooms"),
      maxGuests: str(form, "maxGuests"),
      priceFromRupees: str(form, "priceFromRupees"),
      features: form.getAll("features").map(String) as never,
      houseRules: str(form, "houseRules"),
      cancellationPolicy: (str(form, "cancellationPolicy") || "moderate") as never,
      minNights: str(form, "minNights") || 1,
      checkInTime: str(form, "checkInTime") || "14:00",
      checkOutTime: str(form, "checkOutTime") || "11:00",
      specialties: str(form, "specialties"),
      accreditations: form.getAll("accreditations").map(String) as never,
      beds: str(form, "beds"),
      serves: (str(form, "serves") || "both") as never,
      internationalDesk: form.get("internationalDesk") === "on",
      visaLetter: form.get("visaLetter") === "on",
    }),
  );
}

export async function uploadDocumentAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  await run(orgId, "#documents", "Uploaded. Only your team and our verification staff can open it.", () =>
    uploadDocument(me.id, orgId, { docType: str(form, "docType"), name: str(form, "name") }, form.get("file")),
  );
}

export async function removeDocumentAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  await run(orgId, "#documents", "Document removed.", () => removeDocument(me.id, orgId, str(form, "documentId")));
}

export async function addPhotoAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  await run(orgId, "#photos", "Photo added.", () => addPhoto(me.id, orgId, form.get("file"), str(form, "caption")));
}

export async function removePhotoAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  await run(orgId, "#photos", "Photo removed.", () => removePhoto(me.id, orgId, str(form, "photoId")));
}

export async function submitListingAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  await run(orgId, "", "Sent for verification. We usually review within 2 working days and will email you.", () => submitListing(me.id, orgId));
}

export async function inviteAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  await run(orgId, "#team", "Invitation sent.", () => inviteMember(me.id, orgId, { email: str(form, "email"), role: str(form, "role") as "admin" | "member" }));
}

export async function removeMemberAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  await run(orgId, "#team", "Removed from the team.", () => removeMember(me.id, orgId, str(form, "membershipId")));
}

// ---------- Stays (M7) ----------

export async function calendarAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  const month = str(form, "month");
  const base = `/calendar${month ? `?month=${month}` : ""}`;
  await runAt(`/listing/${orgId}${base}`, "Calendar updated.", () =>
    updateCalendar(me.id, orgId, {
      from: str(form, "from"),
      to: str(form, "to") || str(form, "from"),
      action: str(form, "action") as "price" | "clear_price" | "block" | "unblock",
      priceRupees: str(form, "priceRupees") ? Number(str(form, "priceRupees")) : undefined,
    }),
  );
}

export async function respondStayAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  const accept = str(form, "accept") === "1";
  await runAt(`/listing/${orgId}/bookings`, accept ? "Accepted. The guest has 48 hours to pay; the rooms are held until then." : "Declined. The guest has been told.", () =>
    respondToStay(me.id, orgId, str(form, "stayId"), { accept, note: str(form, "note") }),
  );
}

export async function hostCancelStayAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  await runAt(`/listing/${orgId}/bookings`, "Stay cancelled. The guest is refunded in full.", () => hostCancelStay(me.id, orgId, str(form, "stayId"), { reason: str(form, "reason") }));
}

async function runAt(path: string, ok: string, fn: () => Promise<unknown>) {
  let target: string;
  try {
    await fn();
    revalidatePath(path.split("?")[0]);
    target = withMessage(path, "msg", ok);
  } catch (e) {
    const text = e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong. Please try again.";
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    target = withMessage(path, "error", text);
  }
  redirect(target);
}

// ---------- Care & Travel: hospital desk (M8) ----------

const pkg = (form: FormData) => ({
  title: str(form, "title"),
  specialty: str(form, "specialty"),
  description: str(form, "description"),
  includes: str(form, "includes"),
  hospitalNights: str(form, "hospitalNights") || 0,
  recoveryNights: str(form, "recoveryNights") || 0,
  priceMinRupees: str(form, "priceMinRupees"),
  priceMaxRupees: str(form, "priceMaxRupees"),
  forCompanies: form.get("forCompanies") === "on",
});

export async function savePackageAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  const id = str(form, "packageId");
  await runAt(`/listing/${orgId}/packages`, id ? "Package saved." : "Package added.", () => (id ? updatePackage(me.id, orgId, id, pkg(form)) : createPackage(me.id, orgId, pkg(form))));
}

export async function togglePackageAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  const active = str(form, "active") === "1";
  await runAt(`/listing/${orgId}/packages`, active ? "Package shown." : "Package hidden.", () => setPackageActive(me.id, orgId, str(form, "packageId"), active));
}

export async function replyQuoteAction(form: FormData) {
  const me = await requireUser();
  const orgId = orgOf(form);
  const action = str(form, "action") as "quote" | "decline" | "ask_reports";
  const label = action === "quote" ? "Quote sent. The traveller has been emailed." : action === "decline" ? "Declined. The traveller has been told." : "Asked for reports. The traveller decides whether to share them.";
  await runAt(`/listing/${orgId}/requests`, label, () =>
    replyToQuote(
      me.id,
      orgId,
      str(form, "quoteId"),
      action === "quote"
        ? { action, packageId: str(form, "packageId"), priceMinRupees: str(form, "priceMinRupees"), priceMaxRupees: str(form, "priceMaxRupees"), hospitalNights: str(form, "hospitalNights") || 0, earliestDate: str(form, "earliestDate"), validUntil: str(form, "validUntil"), message: str(form, "message") }
        : { action, message: str(form, "message") },
    ),
  );
}
