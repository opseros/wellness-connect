import type { CurrentUser } from "@/modules/identity/session";

type Section = "home" | "company" | "pro" | "listing" | "connect" | "explore" | "bookings" | "benefits" | "admin" | "account";

/**
 * Main navigation for signed-in pages. "Company" appears for owners, admins
 * and wellness managers; "Professional" once the user has a professional
 * profile; "Homestay"/"Hospital" for members of one; "Admin" only for platform
 * staff. Get the options from navOptions().
 */
export type NavOptions = {
  professional?: boolean;
  companyHref?: string | null;
  listing?: { href: string; label: string } | null;
  /** Employee of a company with wellness credits switched on. */
  benefits?: boolean;
  /** Moosam Plus is switched on (or the user is a super admin previewing it). */
  plus?: boolean;
};

export function mainNav(me: Pick<CurrentUser, "platformRole">, active: Section, opts: NavOptions = {}) {
  const items: { href: string; label: string; key: Section }[] = [
    // Connect is home: /app sends signed-in people to the feed.
    { href: "/connect", label: "Connect", key: "connect" },
    { href: "/explore", label: "Explore", key: "explore" },
    { href: "/bookings", label: "My bookings", key: "bookings" },
    ...(opts.benefits ? [{ href: "/benefits", label: "Benefits", key: "benefits" as const }] : opts.plus ? [{ href: "/plus", label: "Moosam Plus", key: "benefits" as const }] : []),
    ...(opts.companyHref ? [{ href: opts.companyHref, label: "Company", key: "company" as const }] : []),
    ...(opts.professional ? [{ href: "/pro", label: "Professional", key: "pro" as const }] : []),
    ...(opts.listing ? [{ href: opts.listing.href, label: opts.listing.label, key: "listing" as const }] : []),
    ...(me.platformRole !== "user" ? [{ href: "/admin", label: "Admin", key: "admin" as const }] : []),
    { href: "/account/security", label: "Account", key: "account" },
  ];
  return items.map(({ key, ...i }) => ({ ...i, active: key === active || (key === "connect" && active === "home") }));
}
