import type { Metadata } from "next";
import Link from "next/link";
import { DirectoryHero, DirectoryShell, EmptyDirectory, FilterBar } from "@/components/directory";
import { listDirectory } from "@/modules/listings/service";

export const metadata: Metadata = { title: "Verified hospitals", description: "Hospitals that welcome patients who travel for care, with registration and accreditation checked by our team." };

export default async function HospitalDirectory({ searchParams }: { searchParams: Promise<{ q?: string; city?: string; specialty?: string; international?: string }> }) {
  const sp = await searchParams;
  const rows = await listDirectory("hospital", { q: sp.q || undefined, city: sp.city || undefined, specialty: sp.specialty || undefined, international: sp.international === "1" || undefined });
  return (
    <DirectoryShell>
      <DirectoryHero kicker="Hospitals" title="Hospitals that welcome patients who travel" line="We check each hospital's registration and the person who registered it. Accreditations appear only after we've seen the certificate. We don't rank hospitals by medical outcomes." tint="bg-travel text-travel-ink" />
      <FilterBar action="/hospitals">
        <label className="flex flex-[1_1_200px] flex-col gap-1.5 text-sm font-semibold">Search<input name="q" defaultValue={sp.q} className="input" placeholder="Name or specialty" /></label>
        <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-sm font-semibold">City<input name="city" defaultValue={sp.city} className="input" /></label>
        <label className="flex items-center gap-2 pb-3 text-sm font-semibold"><input type="checkbox" name="international" value="1" defaultChecked={sp.international === "1"} className="size-4 accent-brand" />International patients</label>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyDirectory what="hospitals" cta="Register your hospital" href="/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dhospital" />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {rows.map(({ listing: l, name, slug, photoId }) => (
            <li key={slug} className="card flex flex-col overflow-hidden">
              {photoId ? (
                // eslint-disable-next-line @next/next/no-img-element -- served through the access-checked route
                <img src={`/media/listing-photos/${photoId}`} alt="" className="aspect-[16/9] w-full object-cover" />
              ) : (
                <span aria-hidden className="aspect-[16/9] w-full bg-travel" />
              )}
              <div className="flex flex-1 flex-col gap-2 p-5">
                <Link href={`/hospitals/${slug}`} className="font-display text-[19px] font-bold hover:underline">{name}</Link>
                <span className="text-[13px] text-muted">{[l.area, l.city].filter(Boolean).join(", ")}</span>
                <ul className="flex flex-wrap gap-1.5">
                  {l.accreditations.map((a) => <li key={a} className="rounded-full bg-travel px-2.5 py-1 text-xs font-bold text-travel-ink">{a} accredited</li>)}
                  {l.internationalDesk && <li className="rounded-full bg-ground px-2.5 py-1 text-xs font-semibold">International desk</li>}
                </ul>
                {l.specialties.length > 0 && <p className="text-[14px] text-[#3d4842]">{l.specialties.slice(0, 5).join(", ")}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">Quote requests and care trip planning are coming soon. This directory is not medical advice; talk to a qualified doctor about your treatment.</p>
    </DirectoryShell>
  );
}
