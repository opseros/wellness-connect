"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { withMessage } from "@/lib/flash";
import { requireUser } from "@/modules/identity/session";
import {
  acceptInvitation,
  changeMemberRole,
  inviteMember,
  removeMember,
  revokeInvitation,
  updateOrgSettings,
} from "@/modules/organizations/service";
import {
  acceptProposal,
  cancelBooking,
  completeBooking,
  createRequirement,
  remindEnquiry,
  requestRevision,
  rescheduleBooking,
  sendEnquiries,
  updateBookingLocation,
  updateRequirement,
  withdrawRequirement,
} from "@/modules/marketplace/service";

// Each action re-checks the session; services check the role and RLS scopes the data.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(str(f, k) || 0);

function errorText(e: unknown) {
  if (e instanceof AppError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Check the form";
  console.error(e);
  return "Something went wrong. Please try again.";
}

/** Run, then redirect with ?msg= on success or ?error= on failure. `ok.to` may depend on the result. */
async function run<T>(onError: string, fn: () => Promise<T>, ok: (r: T) => { to: string; msg: string }) {
  let target: string;
  try {
    const r = await fn();
    const o = ok(r);
    revalidatePath("/company", "layout");
    target = withMessage(o.to, "msg", o.msg);
  } catch (e) {
    target = withMessage(onError, "error", errorText(e));
  }
  redirect(target);
}

/** IST date + time fields → ISO string with offset. */
function istDateTime(f: FormData, dateKey = "date", timeKey = "time") {
  const date = str(f, dateKey);
  const time = str(f, timeKey) || "10:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new AppError(400, "invalid_input", "Choose a date and time");
  return `${date}T${time}:00+05:30`;
}

function requirementFromForm(f: FormData) {
  return {
    title: str(f, "title"),
    categoryId: str(f, "categoryId"),
    city: str(f, "city"),
    deliveryMode: str(f, "deliveryMode") as "in_person" | "virtual" | "hybrid",
    participants: num(f, "participants"),
    budgetMinRupees: num(f, "budgetMinRupees"),
    budgetMaxRupees: num(f, "budgetMaxRupees"),
    preferredDate: str(f, "preferredDate") || undefined,
    mustBeVerified: f.get("mustBeVerified") === "on",
    mustLanguages: str(f, "mustLanguages").split(",").map((s) => s.trim()).filter(Boolean),
    minYearsExperience: num(f, "minYearsExperience"),
    details: str(f, "details"),
    publish: str(f, "intent") === "publish",
  };
}

export type RequirementFormState = { error: string; values: Record<string, string | string[]>; attempt: number } | null;

/**
 * Used with useActionState so a validation error keeps what the person typed.
 * On success it redirects (matches page when published, list for a draft).
 */
export async function saveRequirementAction(prev: RequirementFormState, form: FormData): Promise<RequirementFormState> {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const id = str(form, "requirementId");
  const base = `/company/${orgId}/requirements`;
  let target: string;
  try {
    const input = requirementFromForm(form);
    const r = id ? await updateRequirement(me.id, orgId, id, input) : await createRequirement(me.id, orgId, input);
    revalidatePath("/company", "layout");
    target =
      r.status === "published"
        ? withMessage(`${base}/${r.id}`, "msg", id ? "Saved. Matches are updated." : "Published. Here are the professionals who meet every must-have.")
        : withMessage(base, "msg", "Draft saved.");
  } catch (e) {
    const values: Record<string, string | string[]> = {};
    for (const k of new Set(form.keys())) if (!k.startsWith("$")) values[k] = k === "mustBeVerified" ? "on" : str(form, k);
    if (!form.has("mustBeVerified")) values.mustBeVerified = "off";
    return { error: errorText(e), values, attempt: (prev?.attempt ?? 0) + 1 };
  }
  redirect(target);
}

export async function withdrawRequirementAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const id = str(form, "requirementId");
  await run(`/company/${orgId}/requirements/${id}`, () => withdrawRequirement(me.id, orgId, id), () => ({
    to: `/company/${orgId}/requirements`,
    msg: "Requirement withdrawn. Professionals you contacted have been told.",
  }));
}

export async function sendEnquiriesAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const id = str(form, "requirementId");
  const picked = form.getAll("pro").map(String);
  const back = `/company/${orgId}/requirements/${id}`;
  await run(
    back,
    async () => {
      if (!picked.length) throw new AppError(400, "invalid_input", "Select at least one professional");
      return sendEnquiries(me.id, orgId, id, picked);
    },
    (rows) => ({ to: `${back}#enquiries`, msg: `Enquiry sent to ${rows.length} professional${rows.length === 1 ? "" : "s"}. We'll email you when they respond.` }),
  );
}

export async function remindAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  await run(str(form, "back"), () => remindEnquiry(me.id, orgId, str(form, "enquiryId")), () => ({ to: str(form, "back"), msg: "Reminder sent." }));
}

export async function acceptProposalAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const proposalId = str(form, "proposalId");
  // Deterministic key: a double click or retry returns the same booking.
  await run(str(form, "back"), () => acceptProposal(me.id, orgId, proposalId, `accept-${proposalId}`), (b) => ({
    to: `/company/${orgId}/bookings/${b.id}`,
    msg: "Proposal accepted. The professional has been notified, and the others were told you chose someone else.",
  }));
}

export async function requestRevisionAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  await run(str(form, "back"), () => requestRevision(me.id, orgId, str(form, "proposalId"), { note: str(form, "note") }), () => ({
    to: str(form, "back"),
    msg: "Sent back for changes. We'll email you when the revised proposal arrives.",
  }));
}

export async function rescheduleAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const id = str(form, "bookingId");
  const back = `/company/${orgId}/bookings/${id}`;
  await run(back, () => rescheduleBooking(me.id, orgId, id, { newStart: istDateTime(form), reason: str(form, "reason") }), () => ({
    to: back,
    msg: "Rescheduled. The professional has been emailed the new time.",
  }));
}

export async function cancelBookingAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const id = str(form, "bookingId");
  const back = `/company/${orgId}/bookings/${id}`;
  await run(back, () => cancelBooking(me.id, orgId, id, { reason: str(form, "reason") }), (b) => ({
    to: back,
    msg: b.cancelledLate ? "Cancelled inside the free-cancellation window; a fee may apply." : "Cancelled at no charge. The professional has been told.",
  }));
}

export async function completeBookingAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const id = str(form, "bookingId");
  const back = `/company/${orgId}/bookings/${id}`;
  await run(back, () => completeBooking(me.id, orgId, id), () => ({ to: back, msg: "Marked as completed." }));
}

export async function locationAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const id = str(form, "bookingId");
  const back = `/company/${orgId}/bookings/${id}`;
  await run(back, () => updateBookingLocation(me.id, orgId, id, { location: str(form, "location") }), () => ({ to: back, msg: "Location saved." }));
}

export async function saveSettingsAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const back = `/company/${orgId}/settings`;
  await run(
    back,
    () =>
      updateOrgSettings(me.id, orgId, {
        name: str(form, "name"),
        city: str(form, "city"),
        address: str(form, "address"),
        billingEmail: str(form, "billingEmail"),
        gstin: str(form, "gstin"),
      }),
    () => ({ to: back, msg: "Company details saved." }),
  );
}

export async function memberRoleAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const back = `/company/${orgId}/settings#members`;
  const approving = str(form, "approving") === "1";
  await run(back, () => changeMemberRole(me.id, orgId, str(form, "membershipId"), { role: str(form, "role") as "admin" | "wellness_manager" | "member" }), () => ({
    to: back,
    msg: approving ? "Request approved." : "Role updated.",
  }));
}

export async function removeMemberAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const back = `/company/${orgId}/settings#members`;
  const declining = str(form, "declining") === "1";
  await run(back, () => removeMember(me.id, orgId, str(form, "membershipId")), () => ({ to: back, msg: declining ? "Request declined." : "Member removed." }));
}

export async function inviteAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const back = `/company/${orgId}/settings#invite`;
  await run(back, () => inviteMember(me.id, orgId, { email: str(form, "email"), role: str(form, "role") as "admin" | "wellness_manager" | "member" }), (r) => ({
    to: back,
    msg: `Invitation emailed to ${r.email}.`,
  }));
}

export async function revokeInviteAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  const back = `/company/${orgId}/settings#invite`;
  await run(back, () => revokeInvitation(me.id, orgId, str(form, "invitationId")), () => ({ to: back, msg: "Invitation revoked." }));
}

export async function acceptInvitationAction(form: FormData) {
  const me = await requireUser();
  const token = str(form, "token");
  await run(`/invite/${token}`, () => acceptInvitation(me, token), (r) => ({
    to: r.role === "member" ? "/app" : `/company/${r.orgId}`,
    msg: "You've joined the company.",
  }));
}
