"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { withMessage } from "@/lib/flash";
import { requireUser } from "@/modules/identity/session";
import {
  acceptQuote,
  createCareRequest,
  createHealthCheckRequest,
  deleteReport,
  linkTripStay,
  revokeReportShare,
  setReportKeep,
  shareReport,
  toggleChecklist,
  updateTrip,
  uploadReport,
  withdrawCareRequest,
} from "@/modules/care/service";

// Every action re-checks the session; the services check ownership again.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const msgOf = (e: unknown) => (e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong. Please try again.");

async function run(path: string, ok: string, fn: () => Promise<unknown>) {
  let target: string;
  try {
    await fn();
    revalidatePath(path.split("#")[0]);
    target = withMessage(path, "msg", ok);
  } catch (e) {
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    target = withMessage(path, "error", msgOf(e));
  }
  redirect(target);
}
const reqPath = (f: FormData, anchor = "") => `/care/requests/${str(f, "requestId")}${anchor}`;

export async function createCareRequestAction(form: FormData) {
  const me = await requireUser();
  let target: string;
  try {
    const r = await createCareRequest(me.id, {
      treatment: str(form, "treatment"),
      specialty: str(form, "specialty"),
      ageRange: str(form, "ageRange") as never,
      travellingFrom: str(form, "travellingFrom"),
      arriveMonth: str(form, "arriveMonth"),
      companions: str(form, "companions") || 0,
      needs: form.getAll("needs").map(String) as never,
      interpreterLanguage: str(form, "interpreterLanguage"),
      note: str(form, "note"),
      hospitalIds: form.getAll("hospitalIds").map(String),
    });
    revalidatePath("/", "layout");
    target = withMessage(`/care/requests/${r.id}`, "msg", "Sent. Hospitals usually reply within 2 working days; we'll email you. They don't see your name until you accept a quote.");
  } catch (e) {
    const q = new URLSearchParams(form.getAll("hospitalIds").map((h) => ["hospital", String(h)]));
    target = withMessage(`/care/request?${q}`, "error", msgOf(e));
  }
  redirect(target);
}

export async function healthCheckAction(form: FormData) {
  const me = await requireUser();
  const orgId = str(form, "orgId");
  let target: string;
  try {
    const r = await createHealthCheckRequest(me.id, orgId, {
      treatment: str(form, "treatment"),
      headcount: str(form, "headcount"),
      ageBand: str(form, "ageBand"),
      arriveMonth: str(form, "arriveMonth"),
      note: str(form, "note"),
      hospitalIds: form.getAll("hospitalIds").map(String),
    });
    revalidatePath("/", "layout");
    target = withMessage(`/care/requests/${r.id}`, "msg", "Sent to the hospitals. We'll email you when they reply.");
  } catch (e) {
    target = withMessage(`/company/${orgId}/health-checks`, "error", msgOf(e));
  }
  redirect(target);
}

export async function acceptQuoteAction(form: FormData) {
  const me = await requireUser();
  await run(reqPath(form, "#trip"), "Quote accepted. The hospital now has your name and email and will contact you. Plan your trip below.", () => acceptQuote(me.id, str(form, "requestId"), str(form, "quoteId")));
}

export async function withdrawRequestAction(form: FormData) {
  const me = await requireUser();
  await run(reqPath(form), "Request withdrawn. Shared reports are no longer visible to the hospitals.", () => withdrawCareRequest(me.id, str(form, "requestId")));
}

export async function uploadReportAction(form: FormData) {
  const me = await requireUser();
  await run(reqPath(form, "#reports"), "Uploaded and encrypted. It isn't shared with anyone until you choose.", () => uploadReport(me.id, str(form, "requestId"), form.get("file"), str(form, "name")));
}

export async function shareReportAction(form: FormData) {
  const me = await requireUser();
  await run(reqPath(form, "#reports"), "Shared with that hospital. You'll see each time they open it.", () =>
    shareReport(me.id, str(form, "reportId"), { orgId: str(form, "orgId"), consent: (form.get("consent") === "on") as true }),
  );
}

export async function revokeShareAction(form: FormData) {
  const me = await requireUser();
  await run(reqPath(form, "#reports"), "Sharing stopped. The hospital can't open this report any more.", () => revokeReportShare(me.id, str(form, "reportId"), str(form, "orgId")));
}

export async function keepReportAction(form: FormData) {
  const me = await requireUser();
  const keep = str(form, "keep") === "1";
  await run(reqPath(form, "#reports"), keep ? "We'll keep this report until you delete it." : "This report will be deleted on its date.", () => setReportKeep(me.id, str(form, "reportId"), keep));
}

export async function deleteReportAction(form: FormData) {
  const me = await requireUser();
  await run(reqPath(form, "#reports"), "Report deleted.", () => deleteReport(me.id, str(form, "reportId")));
}

export async function tripAction(form: FormData) {
  const me = await requireUser();
  await run(reqPath(form, "#trip"), "Trip dates saved.", () => updateTrip(me.id, str(form, "tripId"), { arriveOn: str(form, "arriveOn"), departOn: str(form, "departOn"), notes: str(form, "notes") }));
}

export async function checklistAction(form: FormData) {
  const me = await requireUser();
  await run(reqPath(form, "#checklist"), "Checklist updated.", () => toggleChecklist(me.id, str(form, "tripId"), str(form, "key"), str(form, "done") === "1"));
}

export async function linkStayAction(form: FormData) {
  const me = await requireUser();
  const stayId = str(form, "stayId");
  await run(reqPath(form, "#stay"), stayId ? "Stay added to your trip." : "Stay removed from your trip.", () => linkTripStay(me.id, str(form, "tripId"), stayId || null));
}
