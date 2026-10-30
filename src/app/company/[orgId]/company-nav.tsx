"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function CompanyNav({ base, toReview, isBuyer, isAdmin }: { base: string; toReview: number; isBuyer: boolean; isAdmin: boolean }) {
  const path = usePathname();
  const items = [
    { href: base, label: "Dashboard", show: true, match: (p: string) => p === base },
    { href: `${base}/requirements`, label: "Requirements", show: isBuyer, match: (p: string) => p.startsWith(`${base}/requirements`) },
    { href: `${base}/proposals`, label: "Proposals", show: isBuyer, badge: toReview, match: (p: string) => p.startsWith(`${base}/proposals`) },
    { href: `${base}/bookings`, label: "Bookings", show: isBuyer, match: (p: string) => p.startsWith(`${base}/bookings`) },
    { href: `${base}/settings`, label: isAdmin ? "Settings & members" : "Members", show: true, match: (p: string) => p.startsWith(`${base}/settings`) },
  ].filter((i) => i.show);
  return (
    <nav aria-label="Company" className="flex flex-wrap items-center gap-1 text-sm font-semibold">
      {items.map((i) => {
        const active = i.match(path);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 ${active ? "bg-brand text-white" : "text-[#3d4842] hover:bg-white"}`}>
            {i.label}
            {i.badge ? <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white text-brand-dark" : "bg-[#f2c46d] text-ink"}`}>{i.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
