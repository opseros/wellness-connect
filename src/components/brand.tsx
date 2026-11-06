import { BrandLockup } from "./brand-mark";
import Link from "next/link";
import { IntentLink } from "./intent-link";
import { BRAND } from "@/lib/brand";

export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} aria-label={`${BRAND.name}, ${BRAND.tagline}`} className="flex items-center">
      <BrandLockup size="sm" light={light} name={BRAND.name} tag={BRAND.tagline} />
    </Link>
  );
}

export function AppHeader({ name, nav }: { name: string; nav: { href: string; label: string; active?: boolean }[] }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line bg-white px-6 py-3.5 sm:px-8">
      <Logo href="/app" />
      <nav aria-label="Main" className="flex flex-wrap gap-1 text-sm font-semibold">
        {nav.map((n) => (
          <IntentLink
            key={n.href}
            href={n.href}
            className={`rounded-lg px-3.5 py-2.5 ${n.active ? "bg-brand-soft text-brand-dark" : "text-[#3d4842] hover:bg-ground"}`}
          >
            {n.label}
          </IntentLink>
        ))}
      </nav>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">{name}</span>
        <form action="/sign-out" method="post">
          <button className="font-semibold text-brand hover:underline">Sign out</button>
        </form>
      </div>
    </header>
  );
}
