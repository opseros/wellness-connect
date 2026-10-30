import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";
import { getOwnProfile } from "@/modules/professionals/service";

/** Signed in, verified, and has a professional profile; otherwise sent to the right place. */
export const getProOrExit = cache(async () => {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  const profile = await getOwnProfile(me.id);
  if (!profile) redirect("/app/onboarding#professional");
  return { me, profile };
});

export const MODE_LABEL: Record<string, string> = { in_person: "In person", virtual: "Virtual", hybrid: "Hybrid" };

export const day = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(typeof d === "string" ? new Date(d) : d) : "—";
export const dayTime = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d) : "—";

/** Tomorrow's date (YYYY-MM-DD) in India, for date-picker minimums. */
export function tomorrowInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + 86_400_000));
}
