// Shared pieces for the public directories (professionals, homestays, hospitals).
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { getCurrentUser } from "@/modules/identity/session";
import { LandingHeader } from "./landing";

export async function DirectoryShell({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  return (
    <div className="min-h-screen bg-ground">
      <LandingHeader home={false} signedIn={Boolean(me)} />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pt-4 pb-16 sm:px-8">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-3 px-4 py-6 text-[13px] text-muted sm:px-8">
          <span><span className="font-display font-bold text-ink">{BRAND.name}</span> · {BRAND.tagline}</span>
          <span>Only listings our team has verified appear here. Information on {BRAND.name} is not medical advice.</span>
        </div>
      </footer>
    </div>
  );
}

export function DirectoryHero({ kicker, title, line, tint }: { kicker: string; title: string; line: string; tint: string }) {
  return (
    <section className={`flex flex-col gap-3 rounded-[28px] p-7 sm:p-10 ${tint}`}>
      <span className="text-[13px] font-bold uppercase tracking-wide opacity-80">{kicker}</span>
      <h1 className="max-w-[760px] font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.02em] sm:text-[46px]">{title}</h1>
      <p className="max-w-[640px] text-[16px] leading-relaxed opacity-90">{line}</p>
    </section>
  );
}

export function FilterBar({ action, children }: { action: string; children: React.ReactNode }) {
  return (
    <form action={action} method="get" role="search" className="card flex flex-wrap items-end gap-3 p-4">
      {children}
      <button className="btn-primary">Search</button>
      <Link href={action} className="btn px-3 text-sm text-brand">Clear</Link>
    </form>
  );
}

export function EmptyDirectory({ what, cta, href }: { what: string; cta: string; href: string }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-8">
      <p className="text-[16px]">No verified {what} match yet.</p>
      <Link href={href} className="btn-outline">{cta}</Link>
    </div>
  );
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;
