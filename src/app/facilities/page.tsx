import type { Metadata } from "next";
import Link from "next/link";
import { DirectoryHero, DirectoryShell, EmptyDirectory, FilterBar, rupees } from "@/components/directory";
import { AMENITY_LABEL, FACILITY_TYPE_LABEL, listDirectory } from "@/modules/listings/service";

export const metadata: Metadata = { title: "Gyms, yoga studios and wellness centres", description: "Gyms, yoga and pilates studios, pools and wellness centres, checked by our team." };

type Sp = { q?: string; city?: string; type?: string; amenity?: string };

export default async function FacilityDirectory({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const type = sp.type && sp.type in FACILITY_TYPE_LABEL ? (sp.type as keyof typeof FACILITY_TYPE_LABEL) : undefined;
  const amenity = sp.amenity && sp.amenity in AMENITY_LABEL ? (sp.amenity as keyof typeof AMENITY_LABEL) : undefined;
  const rows = await listDirectory("facility", { q: sp.q || undefined, city: sp.city || undefined, type, amenity });
  return (
    <DirectoryShell>
      <DirectoryHero
        kicker="Gyms, studios and wellness centres"
        title="Places to move, stretch and recharge"
        line="Gyms, yoga and pilates studios, pools and wellness centres. Each has shown us its business registration and real photos before appearing here."
        tint="bg-move text-move-ink"
      />
      <FilterBar action="/facilities">
        <label className="flex flex-[1_1_200px] flex-col gap-1.5 text-sm font-semibold">Search<input name="q" defaultValue={sp.q} className="input" placeholder="Name or area" /></label>
        <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-sm font-semibold">City<input name="city" defaultValue={sp.city} className="input" /></label>
        <label className="flex flex-[1_1_180px] flex-col gap-1.5 text-sm font-semibold">Type
          <select name="type" defaultValue={type ?? ""} className="input"><option value="">Any</option>{Object.entries(FACILITY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="flex flex-[1_1_200px] flex-col gap-1.5 text-sm font-semibold">Must have
          <select name="amenity" defaultValue={amenity ?? ""} className="input"><option value="">Anything</option>{Object.entries(AMENITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyDirectory what="gyms, studios or wellness centres" cta="List your facility" href="/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dfacility" />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {rows.map(({ listing: l, name, slug, photoId }) => (
            <li key={slug} className="card flex flex-col overflow-hidden">
              {photoId ? (
                // eslint-disable-next-line @next/next/no-img-element -- served through the access-checked route
                <img src={`/media/listing-photos/${photoId}`} alt="" className="aspect-[4/3] w-full object-cover" />
              ) : (
                <span aria-hidden className="aspect-[4/3] w-full bg-move" />
              )}
              <div className="flex flex-1 flex-col gap-2 p-5">
                <Link href={`/facilities/${slug}`} className="font-display text-[19px] font-bold hover:underline">{name}</Link>
                <span className="text-[13px] text-muted">{[l.area, l.city].filter(Boolean).join(", ")}</span>
                {l.tagline && <p className="text-[14px] text-[#3d4842]">{l.tagline}</p>}
                <ul className="flex flex-wrap gap-1.5">
                  {l.facilityTypes.slice(0, 3).map((t) => <li key={t} className="rounded-full bg-move px-2.5 py-1 text-xs font-semibold text-move-ink">{FACILITY_TYPE_LABEL[t as keyof typeof FACILITY_TYPE_LABEL] ?? t}</li>)}
                  {l.freeTrial && <li className="rounded-full bg-meetup px-2.5 py-1 text-xs font-semibold text-meetup-ink">Free trial</li>}
                </ul>
                <p className="mt-auto pt-2 text-sm font-semibold">
                  {l.membershipFromPaise !== null ? `From ${rupees(l.membershipFromPaise)} a month` : l.dropInPaise !== null ? `Drop-in ${rupees(l.dropInPaise)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">Prices are what each facility told us, before taxes. Check current prices and timings with them.</p>
    </DirectoryShell>
  );
}
