"use client";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { IntentLink } from "./intent-link";
import { BrandLockup } from "./brand-mark";
import { BRAND } from "@/lib/brand";
import Link from "next/link";

type NavItem = { href: string; label: string; active?: boolean };

const ICONS: Record<string, string> = {
  "/connect": "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  "/explore": "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3",
  "/bookings": "M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm3 8h3m-3 4h6",
  "/connect/messages": "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z",
  menu: "M4 7h16M4 12h16M4 17h16",
};

function Icon({ d, className = "size-6" }: { d: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/**
 * Signed-in header. Wide screens: logo, menu and account in one row, aligned
 * with the page content. Phones and tablets (and the installed app): logo and
 * a menu button that opens a panel, plus a tab bar along the bottom for the
 * places people use most.
 */
export function AppHeader({ name, nav }: { name: string; nav: NavItem[] }) {
  const path = usePathname();
  // Open on this page only, so the panel closes itself after navigating.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (v: boolean) => setOpenOn(v ? path : null);
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const member = nav.some((n) => n.href === "/connect");

  // Lock page scroll and handle Escape while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tabs = member
    ? [
        { href: "/connect", label: "Home", match: (p: string) => p === "/connect" },
        { href: "/explore", label: "Explore", match: (p: string) => p.startsWith("/explore") },
        { href: "/bookings", label: "Bookings", match: (p: string) => ["/bookings", "/sessions", "/stays"].some((x) => p.startsWith(x)) },
        { href: "/connect/messages", label: "Messages", match: (p: string) => p.startsWith("/connect/messages") },
      ]
    : [];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/app" aria-label={`${BRAND.name}, ${BRAND.tagline}`} className="flex shrink-0 items-center">
            <BrandLockup size="sm" name={BRAND.name} tag={BRAND.tagline} />
          </Link>

          <nav aria-label="Main" className="hidden min-w-0 items-center gap-0.5 text-sm font-semibold xl:flex">
            {nav.map((n) => (
              <IntentLink
                key={n.href}
                href={n.href}
                aria-current={n.active ? "page" : undefined}
                className={`rounded-lg px-3 py-2.5 whitespace-nowrap ${n.active ? "bg-brand-soft text-brand-dark" : "text-[#3d4842] hover:bg-ground"}`}
              >
                {n.label}
              </IntentLink>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-3 text-sm xl:flex">
            <span className="max-w-[160px] truncate text-muted" title={name}>{name}</span>
            <form action="/sign-out" method="post">
              <button className="font-semibold text-brand hover:underline">Sign out</button>
            </form>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls={panelId}
            className="-mr-2 flex items-center gap-2 rounded-xl px-2 py-2 text-[#3d4842] hover:bg-ground xl:hidden"
          >
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand-dark">{initials(name)}</span>
            <Icon d={ICONS.menu} />
            <span className="sr-only">Open menu</span>
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label="Menu" id={panelId}>
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-0 bg-black/35 motion-safe:animate-[fade-in_150ms_ease-out]" />
          <div className="absolute inset-y-0 right-0 flex w-[min(340px,88vw)] flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl motion-safe:animate-[slide-in_200ms_cubic-bezier(0.22,1,0.36,1)]">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-dark">{initials(name)}</span>
                <span className="truncate font-semibold">{name}</span>
              </span>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-xl text-[#3d4842] hover:bg-ground">
                <Icon d="M6 6l12 12M18 6 6 18" />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
              {nav.map((n) => (
                <IntentLink
                  key={n.href}
                  href={n.href}
                  aria-current={n.active ? "page" : undefined}
                  className={`flex min-h-12 items-center rounded-xl px-4 text-[16px] font-semibold ${n.active ? "bg-brand text-white" : "text-[#26302b] hover:bg-ground"}`}
                >
                  {n.label}
                </IntentLink>
              ))}
            </nav>
            <form action="/sign-out" method="post" className="border-t border-line p-3">
              <button className="flex min-h-12 w-full items-center rounded-xl px-4 text-[16px] font-semibold text-brand hover:bg-ground">Sign out</button>
            </form>
          </div>
        </div>
      )}

      {tabs.length > 0 && (
        <nav aria-label="Quick" data-tabbar className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <ul className="mx-auto grid max-w-[560px] grid-cols-5">
            {tabs.map((t) => {
              const active = t.match(path);
              return (
                <li key={t.href}>
                  <IntentLink href={t.href} aria-current={active ? "page" : undefined} className={`flex h-16 flex-col items-center justify-center gap-0.5 text-[11.5px] font-semibold ${active ? "text-brand" : "text-[#5b6660]"}`}>
                    <Icon d={ICONS[t.href]} className={`size-6 ${active ? "stroke-[2.3]" : ""}`} />
                    {t.label}
                  </IntentLink>
                </li>
              );
            })}
            <li>
              <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls={panelId} className="flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11.5px] font-semibold text-[#5b6660]">
                <Icon d={ICONS.menu} />
                Menu
              </button>
            </li>
          </ul>
        </nav>
      )}
    </>
  );
}
