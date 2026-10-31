"use client";
import { IntentLink } from "@/components/intent-link";
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
    <nav aria-label="Connect" className="-mx-4 flex flex-row gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
      {items.map((i) => {
        const active = i.match(path);
        return (
          <IntentLink
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-xl px-3.5 text-[15px] font-semibold ${active ? "bg-brand text-white" : "text-[#3d4842] hover:bg-white"}`}
          >
            {i.label}
            {i.badge ? <span className={`rounded-full px-2 text-xs ${active ? "bg-white text-brand-dark" : "bg-[#f2c46d] text-ink"}`}>{i.badge}</span> : null}
          </IntentLink>
        );
      })}
    </nav>
  );
}
