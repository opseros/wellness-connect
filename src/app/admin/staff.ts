import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";

/**
 * Admin pages: non-staff get a plain 404 (the portal's existence isn't
 * revealed); staff without two-factor are sent to set it up. Services check
 * permissions again, so this is about the page experience, not the only guard.
 */
export async function getStaffOrExit() {
  const me = await getCurrentUser();
  if (!me || !me.emailVerified || me.platformRole === "user") notFound();
  if (!me.twoFactorEnabled) redirect("/account/security?need2fa=1");
  return me;
}

export const when = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d) : "—";

export { withMessage } from "@/lib/flash";
