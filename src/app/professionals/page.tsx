import type { Metadata } from "next";
import Link from "next/link";
import { DirectoryHero, DirectoryShell, EmptyDirectory, FilterBar, rupees } from "@/components/directory";
import { listCategories, listProfessionalDirectory } from "@/modules/professionals/service";

export const metadata: Metadata = { title: "Verified wellness professionals", description: "Coaches, nutritionists, physiotherapists and therapists whose credentials our team has checked." };
const MODE: Record<string, string> = { in_person: "In person", virtual: "Virtual", hybrid: "Hybrid" };

export default async function ProfessionalsDirectory({ searchParams }: { searchParams: Promise<{ q?: string; city?: string; category?: string }> }) {
  const sp = await searchParams;
  const [rows, categories] = await Promise.all([listProfessionalDirectory({ q: sp.q || undefined, city: sp.city || undefined, category: sp.category || undefined }), listCategories()]);
  return (
    <DirectoryShell>
      <DirectoryHero kicker="Professionals" title="Verified wellness professionals" line="Coaches, nutritionists, physiotherapists and therapists whose credentials our team has checked. Companies book them for workshops and programs." tint="bg-move text-move-ink" />
      <FilterBar action="/professionals">
        <label className="flex flex-[1_1_200px] flex-col gap-1.5 text-sm font-semibold">Name or speciality<input name="q" defaultValue={sp.q} className="input" /></label>
        <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-sm font-semibold">City<input name="city" defaultValue={sp.city} className="input" /></label>
        <label className="flex flex-[1_1_200px] flex-col gap-1.5 text-sm font-semibold">Category
          <select name="category" defaultValue={sp.category ?? ""} className="input"><option value="">Any</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
        </label>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyDirectory what="professionals" cta="Join as a professional" href="/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dpro" />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {rows.map((p) => (
            <li key={p.id} className="card flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-dark">{p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
                <span className="flex min-w-0 flex-col">
                  <Link href={`/p/${p.id}`} className="truncate font-bold hover:underline">{p.name}</Link>
                  <span className="truncate text-[13px] text-muted">{p.headline}</span>
                </span>
              </div>
              <span className="self-start rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-dark">Credentials verified</span>
              <p className="text-[14px] text-[#3d4842]">{[p.city, p.years ? `${p.years} years` : null, p.modes.map((m) => MODE[m]).join(", ")].filter(Boolean).join(" · ")}</p>
              {p.categories.length > 0 && <p className="text-[13px] text-muted">{p.categories.join(", ")}</p>}
              {p.priceFromPaise !== null && <p className="mt-auto text-sm font-semibold">From {rupees(p.priceFromPaise)} a session</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">Sign in to see full profiles and services. Companies post a requirement to get matched and receive proposals.</p>
    </DirectoryShell>
  );
}
