import "server-only";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { forbidden, unauthorized } from "@/lib/errors";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  platformRole: "user" | "ops" | "super_admin";
  twoFactorEnabled: boolean;
};

export async function getCurrentUser(reqHeaders?: Headers): Promise<CurrentUser | null> {
  // Read the request headers BEFORE touching auth/db: that marks the page as
  // dynamic, so `next build` never tries to prerender it against a database.
  const h = reqHeaders ?? (await headers());
  const session = await getAuth().api.getSession({ headers: h });
  if (!session) return null;
  const u = session.user as typeof session.user & { platformRole?: string; twoFactorEnabled?: boolean | null };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    platformRole: (u.platformRole as CurrentUser["platformRole"]) ?? "user",
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
  };
}

/** Signed in AND email verified. Unverified users can't do anything else. */
export async function requireUser(reqHeaders?: Headers): Promise<CurrentUser> {
  const u = await getCurrentUser(reqHeaders);
  if (!u) throw unauthorized();
  if (!u.emailVerified) throw forbidden("Verify your email first");
  return u;
}

/** Platform staff must have MFA switched on. */
export async function requirePlatformStaff(reqHeaders?: Headers): Promise<CurrentUser> {
  const u = await requireUser(reqHeaders);
  if (u.platformRole === "user") throw forbidden();
  if (!u.twoFactorEnabled) throw forbidden("Turn on two-factor authentication to use admin tools");
  return u;
}
