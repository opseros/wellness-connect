"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminSection } from "./sections";

const under = (path: string, href: string) => {
  const base = href.split("?")[0];
  return path === base || path.startsWith(`${base}/`);
};

/** Tabs for the current admin section, shown above the page when the section has more than one page. */
export function AdminSectionTabs({ sections }: { sections: AdminSection[] }) {
  const path = usePathname();
  const section = sections.find((s) => s.tabs.some((t) => under(path, t.href) || t.also?.some((a) => under(path, a))));
  if (!section || section.tabs.length < 2) return null;
  return (
    <nav aria-label={section.label} className="flex max-w-full flex-wrap gap-1 self-start rounded-full border border-line bg-white p-1">
      {section.tabs.map((t) => {
        const active = under(path, t.href) || Boolean(t.also?.some((a) => under(path, a)));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap ${active ? "bg-brand text-white" : "text-[#33433b] hover:bg-ground"}`}
          >
            {t.label}
            {t.badge ? <span className={`rounded-full px-[7px] text-[11px] font-extrabold ${active ? "bg-white text-brand-dark" : "bg-sun text-[#1c1300]"}`}>{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
