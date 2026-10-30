import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memberProfile, user } from "@/db/schema";
import { requestJoinByDomain } from "@/modules/organizations/service";
import { audit } from "@/modules/platform/outbox";
import { forbidden } from "@/lib/errors";

/** Every account gets a Connect profile, whatever else it becomes. */
export async function onUserCreated(u: { id: string; email: string; emailVerified: boolean }) {
  await getDb().insert(memberProfile).values({ userId: u.id }).onConflictDoNothing();
  // Google/Microsoft accounts arrive already verified.
  if (u.emailVerified) await onEmailVerified(u);
}

export async function onEmailVerified(u: { id: string; email: string }) {
  await promoteBootstrapSuperAdmin(u);
  await requestJoinByDomain(u.id, u.email);
}

/**
 * Emails listed in SUPER_ADMIN_EMAILS (comma separated) become super admins
 * once that email is VERIFIED. Only whoever controls the server environment
 * can set this, so it is a safe way to create the first admin.
 */
export async function promoteBootstrapSuperAdmin(u: { id: string; email: string }) {
  const list = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!list.includes(u.email.toLowerCase())) return;
  const db = getDb();
  await db.update(user).set({ platformRole: "super_admin" }).where(eq(user.id, u.id));
  await audit(db, { actorId: null, action: "user.bootstrap_super_admin", targetType: "user", targetId: u.id });
}

/** After every sign-in: lets SUPER_ADMIN_EMAILS apply to accounts that were verified earlier. */
export async function onSessionCreated(userId: string) {
  if (!process.env.SUPER_ADMIN_EMAILS) return;
  const row = await getDb().query.user.findFirst({ where: eq(user.id, userId) });
  if (row?.emailVerified && row.platformRole !== "super_admin") await promoteBootstrapSuperAdmin(row);
}

/** Called before any session is created: suspended users can't sign in by any method. */
export async function assertNotSuspended(userId: string) {
  const row = await getDb().query.user.findFirst({ where: eq(user.id, userId), columns: { suspendedAt: true } });
  if (row?.suspendedAt) throw forbidden("This account is suspended. Contact support.");
}
