"use client";
import { IntentLink } from "@/components/intent-link";
import { usePathname } from "next/navigation";

export function AdminNav({ pending, homestays = 0, hospitals = 0, reports, finance = 0 }: { pending: number; homestays?: number; hospitals?: number; reports: number; finance?: number }) {
  const path = usePathname();
  const items = [
    { href: "/admin", label: "Professionals", badge: pending, match: (p: string) => p === "/admin" || p.startsWith("/admin/credentials") },
    { href: "/admin/homestays", label: "Homestays", badge: homestays, match: (p: string) => p.startsWith("/admin/homestays") },
    { href: "/admin/hospitals", label: "Hospitals", badge: hospitals, match: (p: string) => p.startsWith("/admin/hospitals") },
    { href: "/admin/users", label: "Users", match: (p: string) => p.startsWith("/admin/users") },
    { href: "/admin/organizations", label: "Organizations", match: (p: string) => p.startsWith("/admin/organizations") },
    { href: "/admin/finance", label: "Finance", badge: finance, match: (p: string) => p.startsWith("/admin/finance") },
    { href: "/admin/reports", label: "Reports", badge: reports, match: (p: string) => p.startsWith("/admin/reports") },
    { href: "/admin/audit", label: "Audit log", match: (p: string) => p.startsWith("/admin/audit") },
  ];
  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-1 text-sm font-semibold">
      {items.map((i) => {
        const active = i.match(path);
        return (
          <IntentLink key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 ${active ? "bg-white/15 text-white" : "text-[#d5dcd8] hover:bg-white/10"}`}>
            {i.label}
            {i.badge ? <span className="rounded-full bg-[#f2c46d] px-1.5 text-xs text-ink">{i.badge}</span> : null}
          </IntentLink>
        );
      })}
    </nav>
  );
}
