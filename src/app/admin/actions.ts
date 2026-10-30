"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { requirePlatformStaff } from "@/modules/identity/session";
import {
  decideCredential,
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
  await run(`/admin/users/${id}`, "Suspension lifted. They can sign in again.", () => unsuspendUser(staff, id));
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
