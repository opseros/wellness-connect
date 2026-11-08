"use client";
import { useId, useState } from "react";
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
 * The left-hand menu used by every signed-in area (Connect, workspaces, admin).
 * A column from `lg` up; on phones and tablets a dropdown that shows where you
 * are and opens the full grouped list.
 */
export function SideNav({ label, heading, groups, tone = "light", headingOnDesktop = true }: { label: string; heading?: string; groups: SideGroup[]; tone?: "light" | "dark"; headingOnDesktop?: boolean }) {
  const path = usePathname();
  // Remember which page the menu was opened on, so it closes itself after navigating.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const listId = useId();
  const dark = tone === "dark";
  const all = groups.flatMap((g) => g.items);
  const current = all.find((i) => isActive(path, i));
  const waiting = all.reduce((a, i) => a + (i.badge ?? 0), 0);

  const list = (mobile: boolean) =>
    groups.map((g, gi) => (
      <div key={gi} className={`flex flex-col gap-0.5 ${gi > 0 ? (mobile ? "mt-3 border-t pt-3 border-line" : "mt-2.5") : ""}`}>
        {g.title && <p className={`px-3 pb-1 text-[11.5px] font-bold tracking-[0.12em] uppercase ${dark ? "text-[#9fb3aa]" : "text-muted"}`}>{g.title}</p>}
        {g.items.map((i) => {
          const active = isActive(path, i);
          return (
            <IntentLink
              key={i.href + i.label}
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={`flex ${mobile ? "min-h-12" : "min-h-10"} items-center justify-between gap-2 rounded-xl px-3 text-[15px] font-semibold ${
                mobile
                  ? active
                    ? "bg-brand-soft text-brand-dark"
                    : "text-[#26302b] hover:bg-ground"
                  : active
                    ? "bg-white text-brand-dark shadow-[0_0_0_1px_var(--color-line)]"
                    : "text-[#33433b] hover:bg-white"
              }`}
            >
              <span className="flex items-center gap-2">
                {i.label}
                {i.isNew && <span className="tag-new">New</span>}
              </span>
              {i.badge ? <span className="rounded-full bg-sun px-[7px] text-[11px] font-extrabold text-[#1c1300]">{i.badge}</span> : null}
            </IntentLink>
          );
        })}
      </div>
    ));

  return (
    <>
      <nav aria-label={label} className="hidden flex-col lg:flex">
        {heading && headingOnDesktop && <p className={`px-3 pt-1 pb-2 text-[11.5px] font-bold tracking-[0.14em] uppercase ${dark ? "text-[#9fb3aa]" : "text-muted"}`}>{heading}</p>}
        {list(false)}
      </nav>

      <nav aria-label={label} className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpenOn(open ? null : path)}
          aria-expanded={open}
          aria-controls={listId}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 text-left ring-1 ring-line"
        >
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[11.5px] font-bold tracking-[0.12em] text-muted uppercase">{heading ?? label}</span>
            <span className="truncate text-[15.5px] font-bold">{current?.label ?? "Menu"}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {!open && waiting > 0 && <span className="rounded-full bg-sun px-[7px] text-[11px] font-extrabold text-[#1c1300]">{waiting}</span>}
            <svg aria-hidden viewBox="0 0 24 24" className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </button>
        {open && (
          <div id={listId} className="mt-2 rounded-2xl bg-white p-2 shadow-[0_16px_40px_-20px_rgba(15,60,48,0.35)] ring-1 ring-line">
            {list(true)}
          </div>
        )}
      </nav>
    </>
  );
}
