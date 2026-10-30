import type { CurrentUser } from "@/modules/identity/session";

type Section = "home" | "pro" | "connect" | "admin" | "account";

/**
 * Main navigation for signed-in pages. "Professional" appears once the user
 * has a professional profile; "Admin" only for platform staff.
 */
export function mainNav(me: Pick<CurrentUser, "platformRole">, active: Section, opts: { professional?: boolean } = {}) {
  const items: { href: string; label: string; key: Section }[] = [
    { href: "/app", label: "Home", key: "home" },
    ...(opts.professional ? [{ href: "/pro", label: "Professional", key: "pro" as const }] : []),
    { href: "/connect", label: "Connect", key: "connect" },
    ...(me.platformRole !== "user" ? [{ href: "/admin", label: "Admin", key: "admin" as const }] : []),
    { href: "/account/security", label: "Account", key: "account" },
  ];
  return items.map(({ key, ...i }) => ({ ...i, active: key === active }));
}
