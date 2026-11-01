// Home page: gyms, yoga and pilates studios, pools, spas and wellness centres.
import Image from "next/image";
import Link from "next/link";

const TYPES = [
  { key: "gym", label: "Gyms", line: "Strength, cardio and trainers", tone: "bg-move text-move-ink", d: "M6 8v8M3 10v4m15-6v8m3-6v4M6 12h12" },
  { key: "yoga", label: "Yoga studios", line: "Hatha, vinyasa and breathwork", tone: "bg-wellness text-wellness-ink", d: "M12 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 10l7-1 7 1M12 9v5l-4 6m4-6 4 6" },
  { key: "pilates", label: "Pilates", line: "Mat and reformer classes", tone: "bg-career text-career-ink", d: "M3 17h18M5 17v-4h14v4M8 13V9a4 4 0 0 1 8 0v4" },
  { key: "swimming", label: "Swimming pools", line: "Laps, lessons and aqua fitness", tone: "bg-travel text-travel-ink", d: "M3 16c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0M3 20c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0M8 13V5a2 2 0 0 1 4 0m-4 4h6" },
  { key: "spa", label: "Spas", line: "Massage, steam and recovery", tone: "bg-food text-food-ink", d: "M12 20c-4 0-7-2.5-7-6 2.5 0 5 1.2 7 3.5C14 15.2 16.5 14 19 14c0 3.5-3 6-7 6Zm0-2.5C10 14 10 10 12 6c2 4 2 8 0 11.5Z" },
  { key: "wellness_centre", label: "Wellness centres", line: "Ayurveda, physio and holistic care", tone: "bg-meetup text-meetup-ink", d: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Zm-3-9h6m-3-3v6" },
] as const;

export function MoveSection({ count }: { count: number }) {
  return (
    <section id="move" aria-labelledby="move-h" className="scroll-mt-6 border-t border-line">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-move-ink">Gyms, studios and wellness centres</p>
            <h2 id="move-h" className="font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px]">Find a place to move, stretch and recharge.</h2>
            <p className="max-w-[520px] text-[17px] leading-relaxed text-[#3d4842]">
              Verified gyms, yoga and pilates studios, pools, spas and wellness centres near your home or office, with prices and timings up front.
            </p>
          </div>
          <div className="relative hidden aspect-[16/9] overflow-hidden rounded-[24px] bg-move sm:block">
            <Image
              src="https://images.unsplash.com/photo-1517130038641-a774d04afb3c?auto=format&fit=crop&w=1600&q=85"
              alt="A group working out together in a gym"
              fill
              quality={90}
              sizes="(min-width: 1024px) 540px, 90vw"
              className="object-cover"
            />
          </div>
          <ul className="flex flex-wrap gap-2 text-[14px] font-semibold">
            {["Free trials marked", "Women-only batches", "Corporate memberships"].map((t) => (
              <li key={t} className="flex items-center gap-2 rounded-full bg-white px-3.5 py-2 ring-1 ring-line">
                <svg aria-hidden viewBox="0 0 24 24" className="size-4 text-move-ink" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                {t}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/facilities" className="btn bg-ink px-6 text-white hover:bg-brand-dark">{count > 0 ? `Browse ${count} verified place${count === 1 ? "" : "s"}` : "Browse gyms and studios"}</Link>
            <Link href="/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dfacility" className="text-[15px] font-semibold text-brand underline-offset-4 hover:underline">Run a gym or studio? List it free →</Link>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TYPES.map((t) => (
            <li key={t.key}>
              <Link href={`/facilities?type=${t.key}`} className={`group flex h-full flex-col gap-3 rounded-[22px] p-5 transition-transform hover:-translate-y-0.5 ${t.tone}`}>
                <span className="grid size-11 place-items-center rounded-2xl bg-white/75">
                  <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={t.d} /></svg>
                </span>
                <span className="font-display text-[19px] font-bold leading-tight">{t.label}</span>
                <span className="text-[13.5px] leading-snug opacity-90">{t.line}</span>
                <span className="mt-auto text-[13px] font-semibold underline-offset-4 group-hover:underline">Explore →</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
