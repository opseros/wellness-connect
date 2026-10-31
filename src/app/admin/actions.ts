"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { requirePlatformStaff } from "@/modules/identity/session";
import {
  adminRecordStayPayout,
  decideListing,
  adminMarkInvoicePaid,
  adminMarkRefundProcessed,
  adminRecordPayout,
  adminSetCategoryCommission,
  adminUpdateFinanceSettings,
  decideCredential,
  editUser,
  removeUser,
  resolveReport,
  setOrganizationDomain,
  setPlatformRole,
  suspendUser,
  unsuspendUser,
} from "@/modules/admin/service";
import { withMessage } from "./staff";

// Each action re-checks the session and the services re-check permissions.
// Results come back as a one-line message on the page we return to.

async function run(back: string, ok: string, fn: () => Promise<unknown>) {
  let target: string;
  try {
    await fn();
    revalidatePath("/admin", "layout");
    target = withMessage(back, "msg", ok);
  } catch (e) {
    const text = e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong";
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    target = withMessage(back, "error", text);
  }
  redirect(target);
}

export async function decideCredentialAction(form: FormData) {
  const staff = await requirePlatformStaff();
  const id = String(form.get("credentialId"));
  const decision = String(form.get("decision")) as "approved" | "rejected" | "info_requested";
  const labels = { approved: "Approved", rejected: "Rejected", info_requested: "Asked for more information" };
  // After a decision, go back to the queue; on error, stay on the credential.
  try {
    await decideCredential(staff, id, { decision, note: String(form.get("note") ?? "") });
  } catch (e) {
    const text = e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong";
    redirect(withMessage(`/admin/credentials/${id}`, "error", text));
  }
  revalidatePath("/admin", "layout");
  redirect(withMessage("/admin", "msg", `${labels[decision] ?? "Saved"}. The professional has been emailed.`));
}

export async function setRoleAction(form: FormData) {
  const staff = await requirePlatformStaff();
  const id = String(form.get("userId"));
  const role = String(form.get("role")) as "user" | "ops";
  await run(`/admin/users/${id}`, role === "ops" ? "Now ops staff. They must turn on two-factor to use admin." : "Staff access removed.", () => setPlatformRole(staff, id, { role }));
}

export async function suspendAction(form: FormData) {
  const staff = await requirePlatformStaff();
  const id = String(form.get("userId"));
  await run(`/admin/users/${id}`, "Suspended and signed out everywhere.", () => suspendUser(staff, id, { reason: String(form.get("reason") ?? "") }));
}

export async function unsuspendAction(form: FormData) {
  const staff = await requirePlatformStaff();
  const id = String(form.get("userId"));
  const back = String(form.get("back") ?? "") === "list" ? "/admin/users?filter=suspended" : `/admin/users/${id}`;
  await run(back, "Suspension lifted. They can sign in again.", () => unsuspendUser(staff, id));
}

export async function editUserAction(form: FormData) {
  const staff = await requirePlatformStaff();
  const id = String(form.get("userId"));
  let result: { emailChanged: boolean } | undefined;
  try {
    result = await editUser(staff, id, { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") });
  } catch (e) {
    const text = e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong";
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    redirect(withMessage(`/admin/users/${id}/edit`, "error", text));
  }
  revalidatePath("/admin", "layout");
  redirect(
    withMessage(
      `/admin/users/${id}`,
      "msg",
      result?.emailChanged ? "Saved. The new email must be verified at their next sign-in, and they were signed out." : "Saved.",
    ),
  );
}

export async function removeUserAction(form: FormData) {
  const staff = await requirePlatformStaff();
  const id = String(form.get("userId"));
  try {
    await removeUser(staff, id, String(form.get("confirmEmail") ?? ""));
  } catch (e) {
    const text = e instanceof AppError ? e.message : "Something went wrong";
    if (!(e instanceof AppError)) console.error(e);
    redirect(withMessage(`/admin/users/${id}/remove`, "error", text));
  }
  revalidatePath("/admin", "layout");
  redirect(withMessage("/admin/users", "msg", "Account removed. Personal details were erased and they can no longer sign in."));
}

export async function setDomainAction(form: FormData) {
  const staff = await requirePlatformStaff();
  const id = String(form.get("orgId"));
  const domain = String(form.get("domain") ?? "");
  await run("/admin/organizations", domain ? `Domain ${domain} linked and verified.` : "Domain removed.", () => setOrganizationDomain(staff, id, { domain }));
}

export async function resolveReportAction(form: FormData) {
  const staff = await requirePlatformStaff();
  const action = String(form.get("action")) as "dismiss" | "remove_content";
  await run("/admin/reports", action === "dismiss" ? "Report dismissed." : "Content removed and report closed.", () =>
    resolveReport(staff, String(form.get("reportId")), { action }),
  );
}

// ---------- Finance ----------

const f = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

export async function markInvoicePaidAction(form: FormData) {
  const staff = await requirePlatformStaff();
  await run("/admin/finance#invoices", "Marked paid. The booking is confirmed and the company emailed.", () => adminMarkInvoicePaid(staff, f(form, "invoiceId"), f(form, "reference")));
}

export async function markRefundSentAction(form: FormData) {
  const staff = await requirePlatformStaff();
  await run("/admin/finance#refunds", "Refund recorded and credit note issued.", () => adminMarkRefundProcessed(staff, f(form, "refundId"), f(form, "reference")));
}

export async function recordPayoutAction(form: FormData) {
  const staff = await requirePlatformStaff();
  await run("/admin/finance#payables", "Payout recorded. The professional has been emailed.", () =>
    adminRecordPayout(staff, f(form, "bookingId"), { amountRupees: Number(f(form, "amount")), reference: f(form, "reference"), paidOn: f(form, "paidOn") }),
  );
}

export async function recordStayPayoutAction(form: FormData) {
  const staff = await requirePlatformStaff();
  await run("/admin/finance#stays", "Payout recorded. The host has been emailed.", () =>
    adminRecordStayPayout(staff, f(form, "stayId"), { amountRupees: Number(f(form, "amount")), reference: f(form, "reference"), paidOn: f(form, "paidOn") }),
  );
}

export async function financeSettingsAction(form: FormData) {
  const staff = await requirePlatformStaff();
  await run("/admin/finance#settings", "Finance settings saved. They apply to bookings priced from now on.", () =>
    adminUpdateFinanceSettings(staff, {
      commissionPercent: Number(f(form, "commission")),
      gstPercent: Number(f(form, "gst")),
      lateCancelRefundPercent: Number(f(form, "lateRefund")),
      paymentTermsDays: Number(f(form, "terms")),
      sellerName: f(form, "sellerName"),
      sellerGstin: f(form, "sellerGstin"),
      sellerAddress: f(form, "sellerAddress"),
      sellerStateCode: f(form, "sellerStateCode"),
      sacCode: f(form, "sacCode"),
      invoicePrefix: f(form, "invoicePrefix").toUpperCase(),
      bankDetails: String(form.get("bankDetails") ?? "").trim(),
      stayCommissionPercent: Number(f(form, "stayCommission")),
      stayGstLowPercent: Number(f(form, "stayGstLow")),
      stayGstHighPercent: Number(f(form, "stayGstHigh")),
      stayGstThresholdRupees: Number(f(form, "stayThreshold")),
      staySacCode: f(form, "staySac"),
    }),
  );
}

export async function categoryCommissionAction(form: FormData) {
  const staff = await requirePlatformStaff();
  const raw = f(form, "percent");
  await run("/admin/finance#settings", raw ? "Category commission saved." : "Category uses the default commission again.", () =>
    adminSetCategoryCommission(staff, { categoryId: f(form, "categoryId"), percent: raw ? Number(raw) : null }),
  );
}

// ---------- Homestays and hospitals (M6) ----------

export async function decideListingAction(form: FormData) {
  const staff = await requirePlatformStaff();
  const orgId = String(form.get("orgId"));
  const decision = String(form.get("decision")) as "approved" | "changes_requested" | "rejected";
  const label = decision === "approved" ? "Verified. It's now in the directory and the owners have been emailed." : decision === "changes_requested" ? "Changes requested. The owners have been emailed." : "Not approved. The owners have been emailed.";
  await run(`/admin/listings/${orgId}`, label, () =>
    decideListing(staff, orgId, { decision, note: String(form.get("note") ?? ""), checked: form.getAll("checked").map(String) }),
  );
}
