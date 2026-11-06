"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/identity/session";
import { createOrganization } from "@/modules/organizations/service";
import { upsertProfessionalProfile } from "@/modules/professionals/service";
import { OPEN_TO, createPost, toggleLike } from "@/modules/connect/service";
import { saveProfileAndCircles } from "@/modules/connect/social";
import { withMessage } from "@/lib/flash";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { createListingOrg } from "@/modules/listings/service";

// Every action re-checks the session itself; never trust the client.

export async function createCompanyAction(_: string | null, form: FormData): Promise<string | null> {
  const me = await requireUser();
  let orgId: string;
  try {
    orgId = (await createOrganization(me, { name: String(form.get("name") ?? ""), kind: "company" })).id;
  } catch (e) {
    return e instanceof AppError ? e.message : "Enter a company name of at least 2 characters.";
  }
  revalidatePath("/", "layout");
  redirect(`/company/${orgId}`);
}

export async function startProfessionalAction(_: string | null, form: FormData): Promise<string | null> {
  const me = await requireUser();
  try {
    await upsertProfessionalProfile(me.id, {
      headline: String(form.get("headline") ?? ""),
      city: String(form.get("city") ?? ""),
      yearsExperience: Number(form.get("years") ?? 0),
    });
  } catch {
    return "Check the details and try again.";
  }
  revalidatePath("/", "layout");
  redirect("/pro");
}

export async function saveConnectProfileAction(form: FormData) {
  const me = await requireUser();
  const topics = String(form.get("topics") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const openTo = form.getAll("openTo").map(String).filter((v): v is (typeof OPEN_TO)[number] => (OPEN_TO as readonly string[]).includes(v));
  try {
    await saveProfileAndCircles(me.id, {
      headline: String(form.get("headline") ?? ""),
      city: String(form.get("city") ?? ""),
      intro: String(form.get("intro") ?? ""),
      openTo,
      topics,
    });
  } catch (e) {
    const text = e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong. Please try again.";
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    redirect(withMessage("/connect/setup", "error", text));
  }
  revalidatePath("/", "layout");
  redirect("/connect");
}

export async function createPostAction(form: FormData) {
  const me = await requireUser();
  const body = String(form.get("body") ?? "").trim();
  if (body) await createPost(me.id, { body });
  revalidatePath("/connect");
}

export async function toggleLikeAction(form: FormData) {
  const me = await requireUser();
  await toggleLike(me.id, String(form.get("postId")));
  revalidatePath("/connect");
}

export async function createListingAction(_: string | null, form: FormData): Promise<string | null> {
  const me = await requireUser();
  let orgId: string;
  try {
    orgId = (await createListingOrg(me, { kind: String(form.get("kind")) as "homestay" | "hospital" | "facility", name: String(form.get("name") ?? ""), city: String(form.get("city") ?? "") })).id;
  } catch (e) {
    return e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong. Please try again.";
  }
  revalidatePath("/", "layout");
  redirect(`/listing/${orgId}`);
}
