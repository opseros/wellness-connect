"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ListingNav({ base, pending }: { base: string; pending: number }) {
  const path = usePathname();
  const items = [
    { href: base, label: "Listing", match: (p: string) => p === base },
    { href: `${base}/calendar`, label: "Calendar & prices", match: (p: string) => p.startsWith(`${base}/calendar`) },
    { href: `${base}/bookings`, label: "Bookings", badge: pending, match: (p: string) => p.startsWith(`${base}/bookings`) },
  ];
  return (
    <nav aria-label="Homestay" className="flex flex-wrap gap-1 text-sm font-semibold">
      {items.map((i) => {
        const on = i.match(path);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={`flex min-h-10 items-center gap-2 rounded-lg px-3.5 ${on ? "bg-ink text-white" : "text-[#3d4842] hover:bg-white"}`}>
            {i.label}
            {i.badge ? <span className={`rounded-full px-2 text-xs ${on ? "bg-white text-ink" : "bg-[#f2c46d] text-ink"}`}>{i.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
