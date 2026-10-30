"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { withMessage } from "@/lib/flash";
import { storeCredentialFile } from "@/lib/storage";
import { requireUser } from "@/modules/identity/session";
import {
  addService,
  resubmitCredential,
  setDiscoverable,
  setServiceActive,
  submitCredential,
  updateService,
  upsertProfessionalProfile,
} from "@/modules/professionals/service";
import { declineEnquiry, submitProposal, withdrawProposal } from "@/modules/marketplace/service";
import { requestConnection } from "@/modules/connect/service";

// Every action re-checks the session; the services check ownership again.

const zodMessage = (e: ZodError) => {
  const i = e.issues[0];
  if (!i) return "Check the form";
  const field = i.path.join(".");
  return field && !i.message.toLowerCase().includes(field.toLowerCase()) && i.code !== "custom" ? `${field}: ${i.message}` : i.message;
};

async function run(ok: { to: string; msg: string }, onError: string, fn: () => Promise<unknown>) {
  let target: string;
  try {
    await fn();
    revalidatePath("/pro", "layout");
    target = withMessage(ok.to, "msg", ok.msg);
  } catch (e) {
    const text = e instanceof AppError ? e.message : e instanceof ZodError ? zodMessage(e) : "Something went wrong. Please try again.";
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    target = withMessage(onError, "error", text);
  }
  redirect(target);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(str(f, k) || 0);
const list = (f: FormData, k: string) => str(f, k).split(",").map((s) => s.trim()).filter(Boolean);

export async function saveProfileAction(form: FormData) {
  const me = await requireUser();
  await run({ to: "/pro/profile", msg: "Profile saved." }, "/pro/profile", () =>
    upsertProfessionalProfile(me.id, {
      headline: str(form, "headline"),
      bio: str(form, "bio"),
      city: str(form, "city"),
      yearsExperience: num(form, "yearsExperience"),
      languages: list(form, "languages"),
      deliveryModes: form.getAll("deliveryModes").map(String) as ("in_person" | "virtual" | "hybrid")[],
      categoryIds: form.getAll("categoryIds").map(String),
    }),
  );
}

export async function setDiscoverableAction(form: FormData) {
  const me = await requireUser();
  const on = str(form, "discoverable") === "1";
  await run({ to: "/pro/profile", msg: on ? "Companies can find you again." : "Hidden from search. Existing enquiries are unaffected." }, "/pro/profile", () =>
    setDiscoverable(me.id, on),
  );
}

export async function saveServiceAction(form: FormData) {
  const me = await requireUser();
  const id = str(form, "serviceId");
  const input = {
    categoryId: str(form, "categoryId"),
    title: str(form, "title"),
    description: str(form, "description"),
    deliveryModes: form.getAll("deliveryModes").map(String) as ("in_person" | "virtual" | "hybrid")[],
    durationMinutes: num(form, "durationMinutes"),
    priceMinRupees: num(form, "priceMinRupees"),
    priceMaxRupees: num(form, "priceMaxRupees"),
  };
  await run({ to: "/pro/services", msg: id ? "Service updated." : "Service added." }, id ? `/pro/services/${id}` : "/pro/services/new", () =>
    id ? updateService(me.id, id, input) : addService(me.id, input),
  );
}

export async function toggleServiceAction(form: FormData) {
  const me = await requireUser();
  const active = str(form, "active") === "1";
  await run({ to: "/pro/services", msg: active ? "Service resumed." : "Service paused. Companies won't see it until you resume it." }, "/pro/services", () =>
    setServiceActive(me.id, str(form, "serviceId"), active),
  );
}

export async function uploadCredentialAction(form: FormData) {
  const me = await requireUser();
  await run({ to: "/pro/credentials", msg: "Uploaded. Our team usually reviews credentials within 2 working days." }, "/pro/credentials", async () => {
    const blobPath = await storeCredentialFile(me.id, form.get("file"));
    return submitCredential(me.id, { name: str(form, "name"), issuer: str(form, "issuer"), blobPath });
  });
}

export async function resubmitCredentialAction(form: FormData) {
  const me = await requireUser();
  const id = str(form, "credentialId");
  await run({ to: "/pro/credentials", msg: "Sent back for review. We'll email you the result." }, `/pro/credentials#c-${id}`, async () => {
    const blobPath = await storeCredentialFile(me.id, form.get("file"));
    return resubmitCredential(me.id, id, { blobPath });
  });
}

export async function declineEnquiryAction(form: FormData) {
  const me = await requireUser();
  const id = str(form, "enquiryId");
  await run({ to: "/pro/enquiries", msg: "Enquiry declined." }, `/pro/enquiries/${id}`, () => declineEnquiry(me.id, id));
}

export async function submitProposalAction(form: FormData) {
  const me = await requireUser();
  const enquiryId = str(form, "enquiryId");
  const date = str(form, "date");
  const time = str(form, "time") || "10:00";
  await run({ to: `/pro/enquiries/${enquiryId}`, msg: "Proposal sent. The company has been notified." }, `/pro/enquiries/${enquiryId}`, async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new AppError(400, "invalid_input", "Choose a start date and time");
    const start = `${date}T${time}:00+05:30`; // times are entered in IST
    if (new Date(start) <= new Date()) throw new AppError(400, "invalid_input", "The start time must be in the future");
    return submitProposal(me.id, str(form, "requirementId"), {
      feeRupees: num(form, "feeRupees"),
      proposedStart: start,
      maxParticipants: num(form, "maxParticipants"),
      inclusions: str(form, "inclusions"),
      message: str(form, "message"),
      freeCancellationDays: num(form, "freeCancellationDays"),
    });
  });
}

export async function withdrawProposalAction(form: FormData) {
  const me = await requireUser();
  await run({ to: "/pro/proposals", msg: "Proposal withdrawn." }, "/pro/proposals", () => withdrawProposal(me.id, str(form, "proposalId")));
}

export async function connectAction(form: FormData) {
  const me = await requireUser();
  const profileId = str(form, "profileId");
  await run({ to: `/p/${profileId}`, msg: "Connection request sent." }, `/p/${profileId}`, () => requestConnection(me.id, str(form, "userId")));
}
