import { getDb } from "@/db/client";
import { memberProfile } from "@/db/schema";
import { requestJoinByDomain } from "@/modules/organizations/service";

/** Every account gets a Connect profile, whatever else it becomes. */
export async function onUserCreated(u: { id: string; email: string; emailVerified: boolean }) {
  await getDb().insert(memberProfile).values({ userId: u.id }).onConflictDoNothing();
  // Google/Microsoft accounts arrive already verified.
  if (u.emailVerified) await requestJoinByDomain(u.id, u.email);
}

export async function onEmailVerified(u: { id: string; email: string }) {
  await requestJoinByDomain(u.id, u.email);
}
