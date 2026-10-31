"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ConnectNav({ badges, professional }: { badges: { invites: number; unread: number; referrals: number }; professional: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/connect", label: "Feed", match: (p: string) => p === "/connect" },
    { href: "/connect/network", label: "My network", badge: badges.invites, match: (p: string) => p.startsWith("/connect/network") || p.startsWith("/connect/members") },
    { href: "/connect/messages", label: "Messages", badge: badges.unread, match: (p: string) => p.startsWith("/connect/messages") },
    { href: "/connect/groups", label: "Groups & spaces", match: (p: string) => p.startsWith("/connect/groups") },
    { href: "/connect/meetups", label: "Meet-ups", match: (p: string) => p.startsWith("/connect/meetups") },
    ...(professional ? [{ href: "/connect/referrals", label: "Referrals", badge: badges.referrals, match: (p: string) => p.startsWith("/connect/referrals") }] : []),
    { href: "/connect/setup", label: "Edit my profile", match: () => false },
  ];
  return (
    <nav aria-label="Connect" className="flex flex-[1_1_200px] flex-row flex-wrap gap-1 lg:max-w-[220px] lg:flex-col">
      {items.map((i) => {
        const active = i.match(path);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center justify-between gap-2 rounded-xl px-3.5 text-[15px] font-semibold ${active ? "bg-brand text-white" : "text-[#3d4842] hover:bg-white"}`}
          >
            {i.label}
            {i.badge ? <span className={`rounded-full px-2 text-xs ${active ? "bg-white text-brand-dark" : "bg-[#f2c46d] text-ink"}`}>{i.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
