"use client";
import { usePathname } from "next/navigation";
import { IntentLink } from "./intent-link";

export type SideItem = {
  href: string;
  label: string;
  badge?: number;
  /** Marks the item "New" (features from the Wellness Connect upgrade). */
  isNew?: boolean;
  /** Active only on this exact path (default: the path or anything under it). */
  exact?: boolean;
  /** Extra path prefixes that also make this item active. */
  also?: string[];
};
export type SideGroup = { title?: string; items: SideItem[] };

function isActive(path: string, i: SideItem) {
  const base = i.href.split(/[?#]/)[0];
  if (i.exact) return path === base;
  return path === base || path.startsWith(`${base}/`) || Boolean(i.also?.some((p) => path === p || path.startsWith(`${p}/`)));
}

/**
 * The left-hand menu used by every signed-in area (Connect, the professional
 * workspace, admin). A row of chips on phones, a column from `lg` up.
 */
export function SideNav({ label, heading, groups, tone = "light" }: { label: string; heading?: string; groups: SideGroup[]; tone?: "light" | "dark" }) {
  const path = usePathname();
  const dark = tone === "dark";
  return (
    <nav aria-label={label} className="-mx-4 flex flex-row gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
      {heading && <p className={`hidden px-3.5 pb-2 text-[11.5px] font-bold tracking-[0.14em] uppercase lg:block ${dark ? "text-[#9fb3aa]" : "text-muted"}`}>{heading}</p>}
      {groups.map((g, gi) => (
        <div key={gi} className={`contents lg:flex lg:flex-col lg:gap-0.5 ${gi > 0 ? "lg:mt-3 lg:border-t lg:pt-3 " + (dark ? "lg:border-white/10" : "lg:border-line") : ""}`}>
          {g.title && <p className={`hidden px-3.5 pb-1 text-[11.5px] font-bold tracking-[0.12em] uppercase lg:block ${dark ? "text-[#9fb3aa]" : "text-muted"}`}>{g.title}</p>}
          {g.items.map((i) => {
            const active = isActive(path, i);
            return (
              <IntentLink
                key={i.href + i.label}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-xl px-3.5 text-[15px] font-semibold whitespace-nowrap ${
                  active ? (dark ? "bg-brand text-white" : "bg-brand text-white") : dark ? "text-[#d5dcd8] hover:bg-white/10" : "text-[#3d4842] hover:bg-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  {i.label}
                  {i.isNew && <span className={`rounded-full px-1.5 py-px text-[10.5px] font-bold tracking-wide uppercase ${active ? "bg-white/20 text-white" : "bg-[#fdf0d2] text-[#7a4b00]"}`}>New</span>}
                </span>
                {i.badge ? <span className={`rounded-full px-2 text-xs ${active ? "bg-white text-brand-dark" : "bg-[#f2c46d] text-ink"}`}>{i.badge}</span> : null}
              </IntentLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
