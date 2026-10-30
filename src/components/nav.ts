import type { CurrentUser } from "@/modules/identity/session";

type Section = "home" | "connect" | "admin" | "account";

/** Main navigation for signed-in pages. Admin appears only for platform staff. */
export function mainNav(me: Pick<CurrentUser, "platformRole">, active: Section) {
  const items: { href: string; label: string; key: Section }[] = [
    { href: "/app", label: "Home", key: "home" },
    { href: "/connect", label: "Connect", key: "connect" },
    ...(me.platformRole !== "user" ? [{ href: "/admin", label: "Admin", key: "admin" as const }] : []),
    { href: "/account/security", label: "Account", key: "account" },
  ];
  return items.map(({ key, ...i }) => ({ ...i, active: key === active }));
}
