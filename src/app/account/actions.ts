"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { requireUser } from "@/modules/identity/session";
import { revokeMyOtherSessions, revokeMySession } from "@/modules/identity/account";

export async function revokeSessionAction(form: FormData) {
  const me = await requireUser();
  const id = String(form.get("sessionId") ?? "");
  if (id && id !== me.sessionId) await revokeMySession(me.id, id);
  revalidatePath("/account/security");
}

export async function revokeOtherSessionsAction() {
  const me = await requireUser();
  await revokeMyOtherSessions(me.id, me.sessionId);
  revalidatePath("/account/security");
}

/** For accounts created with Google/Microsoft that have no password yet. */
export async function setPasswordAction(_: string | null, form: FormData): Promise<string | null> {
  await requireUser();
  const newPassword = String(form.get("password") ?? "");
  if (newPassword.length < 10) return "Use at least 10 characters.";
  try {
    await getAuth().api.setPassword({ headers: await headers(), body: { newPassword } });
  } catch {
    return "Couldn't set the password. It may be too weak or already set.";
  }
  revalidatePath("/account/security");
  return "ok";
}
