"use client";
import { IntentLink } from "@/components/intent-link";
import { usePathname } from "next/navigation";

export function ProNav({ openEnquiries, profileId }: { openEnquiries: number; profileId: string }) {
  const path = usePathname();
  const items = [
    { href: "/pro", label: "Overview", match: (p: string) => p === "/pro" },
    { href: "/pro/profile", label: "Profile", match: (p: string) => p.startsWith("/pro/profile") },
    { href: "/pro/services", label: "Services", match: (p: string) => p.startsWith("/pro/services") },
    { href: "/pro/credentials", label: "Credentials", match: (p: string) => p.startsWith("/pro/credentials") },
    { href: "/pro/enquiries", label: "Enquiries", badge: openEnquiries, match: (p: string) => p.startsWith("/pro/enquiries") },
    { href: "/pro/proposals", label: "Proposals & bookings", match: (p: string) => p.startsWith("/pro/proposals") },
  ];
  return (
    <nav aria-label="Professional" className="flex flex-wrap items-center gap-1 text-sm font-semibold">
      {items.map((i) => {
        const active = i.match(path);
        return (
          <IntentLink
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 ${active ? "bg-brand text-white" : "text-[#3d4842] hover:bg-white"}`}
          >
            {i.label}
            {i.badge ? <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white text-brand-dark" : "bg-[#f2c46d] text-ink"}`}>{i.badge}</span> : null}
          </IntentLink>
        );
      })}
      <IntentLink href={`/p/${profileId}`} className="ml-auto rounded-lg px-3.5 py-2.5 text-brand hover:underline">View public profile →</IntentLink>
    </nav>
  );
}
