import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { getOrgForMember, isOrgSuspendedError, ORG_ADMINS, ORG_BUYERS } from "@/modules/organizations/service";

/**
 * Signed in, verified and an ACTIVE member of this company; anything else is a
 * 404 so company ids reveal nothing. Services check roles again.
 */
export const getCompanyOrExit = cache(async (orgId: string) => {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  const { org, role } = await getOrgForMember(me.id, orgId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    if (isOrgSuspendedError(e)) redirect("/app?notice=suspended");
    throw e;
  });
  if (org.kind === "homestay" || org.kind === "hospital") redirect(`/listing/${org.id}`);
  return { me, org, role, isBuyer: ORG_BUYERS.includes(role), isAdmin: ORG_ADMINS.includes(role) };
});

/** Marketplace pages: plain members are sent to the company page that explains their access. */
export async function getBuyerOrExit(orgId: string) {
  const c = await getCompanyOrExit(orgId);
  if (!c.isBuyer) redirect(`/company/${orgId}`);
  return c;
}

/** Turns a service 404 into the page's 404. */
export function orNotFound<T>(p: Promise<T>): Promise<T> {
  return p.catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
}

export const MODE_LABEL: Record<string, string> = { in_person: "In person", virtual: "Virtual", hybrid: "Hybrid" };
export const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", wellness_manager: "Wellness manager", member: "Member" };
export const REQ_STATUS: Record<string, string> = { draft: "Draft", published: "Open", closed: "Booked", withdrawn: "Withdrawn" };

const tz = { timeZone: "Asia/Kolkata" } as const;
export const day = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", ...tz }).format(typeof d === "string" ? new Date(d) : d) : "—";
export const dayTime = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", ...tz }).format(d) : "—");
/** "YYYY-MM-DD" and "HH:MM" in India time, for date and time inputs. */
export const istParts = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...tz }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
