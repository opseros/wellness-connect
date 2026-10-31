import type { Metadata } from "next";
import Link from "next/link";
import { DirectoryHero, DirectoryShell, EmptyDirectory, FilterBar, rupees } from "@/components/directory";
import { FEATURE_LABEL } from "@/modules/listings/service";
import { searchHomestays } from "@/modules/stays/service";
import { todayIst } from "@/modules/stays/policy";

export const metadata: Metadata = { title: "Verified homestays", description: "Homestays for rest, recovery and team retreats, checked by our team." };

export default async function HomestayDirectory({ searchParams }: { searchParams: Promise<{ q?: string; city?: string; feature?: string; checkIn?: string; checkOut?: string; rooms?: string }> }) {
  const sp = await searchParams;
  const feature = Object.keys(FEATURE_LABEL).includes(sp.feature ?? "") ? (sp.feature as keyof typeof FEATURE_LABEL) : undefined;
  const dated = Boolean(sp.checkIn && sp.checkOut && sp.checkOut > sp.checkIn);
  const { rows } = await searchHomestays({ q: sp.q || undefined, city: sp.city || undefined, feature, checkIn: dated ? sp.checkIn : undefined, checkOut: dated ? sp.checkOut : undefined, rooms: sp.rooms || undefined });
  const today = todayIst();
  const dateQs = dated ? `?${new URLSearchParams({ checkIn: sp.checkIn!, checkOut: sp.checkOut!, rooms: sp.rooms || "1" })}` : "";
  return (
    <DirectoryShell>
      <DirectoryHero kicker="Homestays" title="Stays for rest, recovery and team retreats" line="Every homestay here has shown us its registration, the owner's ID and real photos. Recovery-friendly features are marked by the host." tint="bg-meetup text-meetup-ink" />
      <FilterBar action="/homestays">
        <label className="flex flex-[1_1_200px] flex-col gap-1.5 text-sm font-semibold">Search<input name="q" defaultValue={sp.q} className="input" placeholder="Name or area" /></label>
        <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-sm font-semibold">City<input name="city" defaultValue={sp.city} className="input" /></label>
        <label className="flex flex-[1_1_220px] flex-col gap-1.5 text-sm font-semibold">Must have
          <select name="feature" defaultValue={feature ?? ""} className="input"><option value="">Anything</option>{Object.entries(FEATURE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="flex flex-[1_1_150px] flex-col gap-1.5 text-sm font-semibold">Check-in<input name="checkIn" type="date" min={today} defaultValue={sp.checkIn} className="input" /></label>
        <label className="flex flex-[1_1_150px] flex-col gap-1.5 text-sm font-semibold">Check-out<input name="checkOut" type="date" min={today} defaultValue={sp.checkOut} className="input" /></label>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyDirectory what="homestays" cta="List your homestay" href="/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dhomestay" />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {rows.map(({ listing: l, name, slug, photoId }) => (
            <li key={slug} className="card flex flex-col overflow-hidden">
              {photoId ? (
                // eslint-disable-next-line @next/next/no-img-element -- served through the access-checked route
                <img src={`/media/listing-photos/${photoId}`} alt="" className="aspect-[4/3] w-full object-cover" />
              ) : (
                <span aria-hidden className="aspect-[4/3] w-full bg-meetup" />
              )}
              <div className="flex flex-1 flex-col gap-2 p-5">
                <Link href={`/homestays/${slug}${dateQs}`} className="font-display text-[19px] font-bold hover:underline">{name}</Link>
                <span className="text-[13px] text-muted">{[l.area, l.city].filter(Boolean).join(", ")}{l.rooms ? ` · ${l.rooms} rooms` : ""}</span>
                {l.tagline && <p className="text-[14px] text-[#3d4842]">{l.tagline}</p>}
                <ul className="flex flex-wrap gap-1.5">
                  {l.features.slice(0, 3).map((f) => <li key={f} className="rounded-full bg-meetup px-2.5 py-1 text-xs font-semibold text-meetup-ink">{FEATURE_LABEL[f as keyof typeof FEATURE_LABEL]}</li>)}
                </ul>
                {l.priceFromPaise !== null && <p className="mt-auto pt-2 text-sm font-semibold">From {rupees(l.priceFromPaise)} a night</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">{dated ? "Showing homestays with a room free every night of your dates. " : ""}Prices shown are the host&apos;s usual price per room per night, before GST. Request a stay; you pay only once the host accepts.</p>
    </DirectoryShell>
  );
}
