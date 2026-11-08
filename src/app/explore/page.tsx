import type { Metadata } from "next";
import Link from "next/link";
import { rupees } from "@/components/directory";
import { getCurrentUser } from "@/modules/identity/session";
import { listProfessionalDirectory } from "@/modules/professionals/service";
import { FACILITY_TYPE_LABEL, listDirectory } from "@/modules/listings/service";
import { searchHomestays } from "@/modules/stays/service";
import { myCoverage } from "@/modules/marketplace/credits";

export const metadata: Metadata = { title: "Explore" };

const TABS = [
  { key: "pros", label: "Professionals" },
  { key: "gyms", label: "Gyms & studios" },
  { key: "stays", label: "Homestays" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).slice(0, 2).join("");
const MODE: Record<string, string> = { in_person: "In person", virtual: "Online", hybrid: "Online + in person" };

function Leaves() {
  return (
    <svg aria-hidden viewBox="0 0 64 64" className="absolute -right-6 -bottom-8 size-36 text-brand opacity-20">
      <path d="M31 54 C13 47 8 27 14 9 C29 15 36 34 31 54 Z" fill="currentColor" />
      <path d="M33 54 C51 47 56 27 50 9 C35 15 28 34 33 54 Z" fill="currentColor" />
    </svg>
  );
}

function Cover({ photoId, label }: { photoId: string | null; label: string }) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-[linear-gradient(135deg,#e4f1ea_0%,#eef4ec_55%,#f6efe0_100%)]">
      {photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/media/listing-photos/${photoId}`} alt="" className="size-full object-cover" />
      ) : (
        <Leaves />
      )}
      {label && <span className="absolute top-2.5 left-2.5 rounded-full bg-white/95 px-2.5 py-0.5 text-[12px] font-semibold text-ink">{label}</span>}
    </div>
  );
}

function Foot({ price, unit, href, cta }: { price: number | null; unit: string; href: string; cta: string }) {
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3">
      <span className="text-sm whitespace-nowrap">{price !== null ? <><span className="text-muted">from </span><b className="text-[17px]">{rupees(price)}</b> <span className="text-muted">{unit}</span></> : <span className="text-muted">Price on request</span>}</span>
      <Link href={href} className="btn-primary min-h-10 rounded-full px-4 text-sm whitespace-nowrap">{cta}</Link>
    </div>
  );
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; city?: string; covered?: string }> }) {
  const me = (await getCurrentUser())!;
  const sp = await searchParams;
  const cover = await myCoverage(me.id);
  const hasCredits = cover.sessions || cover.facilities;
  const coveredOnly = hasCredits && sp.covered === "1";
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "pros";
  const q = sp.q?.trim() || undefined;
  const city = sp.city?.trim() || undefined;
  const qs = (t: Tab, cov = coveredOnly) => `/explore?${new URLSearchParams({ tab: t, ...(q ? { q } : {}), ...(city ? { city } : {}), ...(cov ? { covered: "1" } : {}) })}`;
  // Credits pay for sessions bookable online, and for plans at facilities the policy allows.
  const proCovered = (p: { bookable: boolean }) => cover.sessions && p.bookable;
  const gymCovered = (l: { benefitPartner: boolean }) => cover.facilities && (!cover.partnersOnly || l.benefitPartner);

  const [pros, gyms, stays] = await Promise.all([
    tab === "pros" ? listProfessionalDirectory({ q, city }).then((r) => (coveredOnly ? r.filter(proCovered) : r)) : Promise.resolve([]),
    tab === "gyms" ? listDirectory("facility", { q, city }).then((r) => (coveredOnly ? r.filter((x) => gymCovered(x.listing)) : r)) : Promise.resolve([]),
    tab === "stays" && !coveredOnly ? searchHomestays({ q, city }).then((r) => r.rows) : Promise.resolve([]),
  ]);
  const count = tab === "pros" ? pros.length : tab === "gyms" ? gyms.length : stays.length;

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[30px] leading-[1.05] font-extrabold tracking-[-0.02em]">Explore <span className="tag-new ml-1 align-[0.35em]">New</span></h1>
        <p className="max-w-[640px] text-[15px] text-muted">Verified professionals, gyms and studios, and homestays in one place. Book a session, pick a plan or request a stay.{hasCredits ? " Anything marked Covered can be paid with your wellness credits." : ""}</p>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="What to explore" className="inline-flex flex-wrap gap-1 rounded-full bg-white p-1 ring-1 ring-line">
          {TABS.map((t) => (
            <Link key={t.key} href={qs(t.key)} aria-current={t.key === tab ? "page" : undefined} className={`rounded-full px-4 py-2 text-[14.5px] font-semibold ${t.key === tab ? "bg-brand text-white" : "text-[#33433b] hover:bg-ground"}`}>
              {t.label}
            </Link>
          ))}
        </nav>
        <form action="/explore" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value={tab} />
          <label className="sr-only" htmlFor="ex-q">Name or speciality</label>
          <input id="ex-q" name="q" defaultValue={q} placeholder="Name or speciality" className="input min-h-10 w-48" />
          <label className="sr-only" htmlFor="ex-city">City</label>
          <input id="ex-city" name="city" defaultValue={city} placeholder="City" className="input min-h-10 w-36" />
          {hasCredits && (
            <label className="flex min-h-10 items-center gap-2 rounded-full bg-white px-3.5 text-sm font-semibold ring-1 ring-line">
              <input type="checkbox" name="covered" value="1" defaultChecked={coveredOnly} className="size-4 accent-[var(--color-brand)]" /> Covered only
            </label>
          )}
          <button className="btn-outline min-h-10 rounded-full px-4 text-sm">Search</button>
        </form>
      </div>

      <p className="text-[13.5px] text-muted" aria-live="polite">{count} {count === 1 ? "result" : "results"}{q || city ? ` for ${[q, city].filter(Boolean).join(" in ")}` : ""}</p>

      {count === 0 ? (
        <p className="card p-6 text-center text-muted">{coveredOnly && tab === "stays" ? "Credits don't cover homestays yet." : "Nothing matches yet. Try another search or city."}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {tab === "pros" &&
            pros.map((p) => (
              <li key={p.id} className="card flex min-w-0 flex-col gap-3 p-5">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-dark">{initials(p.name)}</span>
                  <span className="flex min-w-0 flex-col">
                    <Link href={`/p/${p.id}`} className="truncate font-bold hover:underline">{p.name}</Link>
                    <span className="line-clamp-2 text-[13px] text-muted">{p.headline}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
                  <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-brand-dark">Verified</span>
                  {p.modes.map((m) => <span key={m} className="rounded-full bg-ground px-2.5 py-0.5 text-[#33433b]">{MODE[m] ?? m}</span>)}
                  {p.city && <span className="rounded-full bg-ground px-2.5 py-0.5 text-[#33433b]">{p.city}</span>}
                  {proCovered(p) && <span className="rounded-full bg-[#e2f3e7] px-2.5 py-0.5 text-[#1f7a45]">Covered</span>}
                </div>
                {p.categories.length > 0 && <p className="text-[13px] text-muted">{p.categories.join(", ")}</p>}
                <Foot price={p.memberFromPaise} unit="a session" href={p.bookable ? `/p/${p.id}/book` : `/p/${p.id}`} cta={p.bookable ? "Book a session" : "View profile"} />
              </li>
            ))}
          {tab === "gyms" &&
            gyms.map(({ listing: l, name, slug, photoId }) => (
              <li key={slug} className="card flex min-w-0 flex-col gap-3 p-4">
                <Cover photoId={photoId} label={l.facilityTypes.map((t) => FACILITY_TYPE_LABEL[t as keyof typeof FACILITY_TYPE_LABEL] ?? t).slice(0, 2).join(" · ")} />
                <div className="flex flex-col gap-1">
                  <Link href={`/facilities/${slug}`} className="font-bold hover:underline">{name}</Link>
                  <span className="text-[13px] text-muted">{[l.area, l.city].filter(Boolean).join(", ")}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
                  {l.freeTrial && <span className="rounded-full bg-meetup px-2.5 py-0.5 text-meetup-ink">Free trial</span>}
                  {l.benefitPartner && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-brand-dark">Benefit partner</span>}
                  {gymCovered(l) && <span className="rounded-full bg-[#e2f3e7] px-2.5 py-0.5 text-[#1f7a45]">Covered</span>}
                </div>
                <Foot price={l.membershipFromPaise ?? l.dropInPaise} unit={l.membershipFromPaise ? "a month" : "a visit"} href={`/facilities/${slug}`} cta="See plans" />
              </li>
            ))}
          {tab === "stays" &&
            stays.map(({ listing: l, name, slug, photoId }) => (
              <li key={slug} className="card flex min-w-0 flex-col gap-3 p-4">
                <Cover photoId={photoId} label={[l.area, l.city].filter(Boolean).join(", ")} />
                <Link href={`/homestays/${slug}`} className="font-bold hover:underline">{name}</Link>
                {l.tagline && <p className="line-clamp-2 text-[13.5px] text-muted">{l.tagline}</p>}
                <Foot price={l.priceFromPaise} unit="a night" href={`/homestays/${slug}`} cta="Request a stay" />
              </li>
            ))}
        </ul>
      )}
    </>
  );
}
