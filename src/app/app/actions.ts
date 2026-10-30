"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/identity/session";
import { createOrganization } from "@/modules/organizations/service";
import { upsertProfessionalProfile } from "@/modules/professionals/service";
import { createPost, toggleLike, updateMemberProfile } from "@/modules/connect/service";
import { AppError } from "@/lib/errors";

// Every action re-checks the session itself; never trust the client.

export async function createCompanyAction(_: string | null, form: FormData): Promise<string | null> {
  const me = await requireUser();
  try {
    await createOrganization(me, { name: String(form.get("name") ?? ""), kind: "company" });
  } catch (e) {
    return e instanceof AppError ? e.message : "Enter a company name of at least 2 characters.";
  }
  redirect("/app");
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
  redirect("/app");
}

export async function saveConnectProfileAction(form: FormData) {
  const me = await requireUser();
  const topics = String(form.get("topics") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  await updateMemberProfile(me.id, {
    headline: String(form.get("headline") ?? ""),
    city: String(form.get("city") ?? ""),
    topics,
  });
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
