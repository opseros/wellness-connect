// "Also on" section of the home page: the three kinds of organisation that join
// Moosam. The small previews are illustrations of each workspace (fictional
// names and numbers), not real listings.
import Link from "next/link";
import { BRAND } from "@/lib/brand";

type Card = {
  key: "company" | "homestay" | "facility" | "hospital";
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  count?: string;
  tone: { bg: string; ink: string; ring: string; dot: string };
};

const Check = ({ className }: { className: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={`mt-0.5 size-4 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

function Icon({ k }: { k: Card["key"] }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6">
      {k === "company" && <path {...p} d="M4 20V6.5L12 4v16M12 9h8v11M4 20h16M7.5 9h1.5m-1.5 3.5h1.5m-1.5 3.5h1.5M15 12.5h2m-2 3.5h2" />}
      {k === "homestay" && <path {...p} d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5.5h4V20" />}
      {k === "facility" && <path {...p} d="M6 8v8M3 10v4m15-6v8m3-6v4M6 12h12" />}
      {k === "hospital" && <path {...p} d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V20M3 20h18M12 7.5v5m-2.5-2.5h5M10 20v-3.5h4V20" />}
    </svg>
  );
}

/** Tiny workspace previews, one per card. Decorative. */
function Preview({ k }: { k: Card["key"] }) {
  if (k === "company")
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-2xl bg-white p-3.5 shadow-[0_12px_30px_-18px_rgba(67,53,122,0.55)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-career-ink/70">Your request</p>
          <p className="mt-0.5 text-[14px] font-bold text-ink">Desk yoga for 40 people</p>
          <p className="text-[12px] text-muted">Hybrid · Pune · ₹15,000 to ₹25,000</p>
        </div>
        <div className="ml-6 flex items-center gap-2.5 rounded-2xl bg-white p-3 shadow-[0_12px_30px_-18px_rgba(67,53,122,0.55)]">
          <span className="flex -space-x-2">
            {["bg-wellness text-wellness-ink", "bg-meetup text-meetup-ink", "bg-travel text-travel-ink"].map((c, i) => (
              <span key={i} className={`grid size-7 place-items-center rounded-full border-2 border-white text-[10px] font-bold ${c}`}>{["MI", "RS", "AK"][i]}</span>
            ))}
          </span>
          <span className="text-[12.5px] font-semibold text-ink">3 proposals from verified pros</span>
        </div>
      </div>
    );
  if (k === "facility")
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-2xl bg-white p-3.5 shadow-[0_12px_30px_-18px_rgba(122,38,74,0.45)]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-bold text-ink">Lotus Yoga &amp; Fitness</p>
            <span className="rounded-full bg-meetup px-2 py-0.5 text-[10.5px] font-bold text-meetup-ink">Free trial</span>
          </div>
          <p className="text-[12px] text-muted">Yoga · Strength · Pilates · Indiranagar</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {["6 am to 10 pm", "Women-only batches", "Showers"].map((t) => (
              <span key={t} className="rounded-full bg-move px-2 py-0.5 text-[11px] font-semibold text-move-ink">{t}</span>
            ))}
          </div>
        </div>
        <div className="ml-6 rounded-2xl bg-white p-3 shadow-[0_12px_30px_-18px_rgba(122,38,74,0.45)]">
          <p className="text-[12.5px] font-semibold text-ink">From ₹1,800 a month · corporate plans</p>
        </div>
      </div>
    );
  if (k === "homestay")
    return (
      <div className="rounded-2xl bg-white p-3.5 shadow-[0_12px_30px_-18px_rgba(29,79,122,0.55)]">
        <div className="flex items-baseline justify-between">
          <p className="text-[14px] font-bold text-ink">Garden room</p>
          <p className="text-[12px] text-muted">from <span className="font-bold text-ink">₹2,800</span>/night</p>
        </div>
        <div className="mt-2.5 grid grid-cols-7 gap-1 text-center text-[11px]">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="text-muted">{d}</span>
          ))}
          {[12, 13, 14, 15, 16, 17, 18].map((n) => (
            <span
              key={n}
              className={`rounded-md py-1 font-semibold ${n >= 14 && n <= 16 ? "bg-travel-ink text-white" : n === 18 ? "bg-ground text-muted line-through" : "bg-travel text-travel-ink"}`}
            >
              {n}
            </span>
          ))}
        </div>
        <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-travel-ink">
          <span className="size-1.5 rounded-full bg-travel-ink" /> New request · 3 nights · respond within 48 h
        </p>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-2xl bg-white p-3.5 shadow-[0_12px_30px_-18px_rgba(11,79,68,0.5)]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[14px] font-bold text-ink">Knee replacement package</p>
          <span className="rounded-full bg-wellness px-2 py-0.5 text-[10.5px] font-bold text-wellness-ink">NABH</span>
        </div>
        <p className="text-[12px] text-muted">Orthopaedics · 5 nights in hospital · recovery stay nearby</p>
      </div>
      <div className="ml-6 rounded-2xl bg-white p-3 shadow-[0_12px_30px_-18px_rgba(11,79,68,0.5)]">
        <p className="text-[12.5px] font-semibold text-ink">Quote request from a patient in Nairobi</p>
        <p className="text-[11.5px] text-muted">Name shared only if they accept your quote</p>
      </div>
    </div>
  );
}

export function AlsoOn({ care, counts, hospitals = false }: { care: boolean; counts: { homestays: number; hospitals: number; facilities: number }; hospitals?: boolean }) {
  const all: Card[] = [
    {
      key: "company",
      eyebrow: "For HR and wellness teams",
      title: "Companies",
      body: "Post what your teams need and book verified professionals, with proposals to compare and GST invoices.",
      points: ["Workshops, coaching and programmes", "Proposals within days", "Pay online, GST invoice included"],
      primary: { label: "Set up your company", href: "/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dcompany" },
      secondary: { label: "Find professionals", href: "/professionals" },
      tone: { bg: "bg-career", ink: "text-career-ink", ring: "ring-career-ink/15", dot: "text-career-ink" },
    },
    {
      key: "homestay",
      eyebrow: "For hosts",
      title: "Homestays",
      body: "Host guests who come to rest, recover or hold a small team retreat.",
      points: ["Calendar with your own nightly prices", "You accept each booking request", "Payouts after every stay"],
      primary: { label: "List your homestay", href: "/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dhomestay" },
      secondary: { label: "Browse homestays", href: "/homestays" },
      count: counts.homestays > 0 ? `${counts.homestays} verified` : undefined,
      tone: { bg: "bg-travel", ink: "text-travel-ink", ring: "ring-travel-ink/15", dot: "text-travel-ink" },
    },
    {
      key: "facility",
      eyebrow: "For gyms and studios",
      title: "Gyms, studios and wellness centres",
      body: "Reach working professionals nearby and companies looking for team memberships.",
      points: ["A verified listing with prices and timings", "Show free trials and women-only batches", "Get found by companies for team plans"],
      primary: { label: "List your facility", href: "/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dfacility" },
      secondary: { label: "Browse", href: "/facilities" },
      count: counts.facilities > 0 ? `${counts.facilities} verified` : undefined,
      tone: { bg: "bg-move", ink: "text-move-ink", ring: "ring-move-ink/15", dot: "text-move-ink" },
    },
    {
      key: "hospital",
      eyebrow: "Care & Travel",
      title: "Hospitals",
      body: care ? "Welcome patients who travel for treatment, from India and abroad." : "Welcome patients who travel for treatment. Treatment packages are live; quote requests open soon.",
      points: ["Treatment packages with clear prices", "Quote requests with patient consent", "Recovery stays at verified homestays"],
      primary: { label: "Register your hospital", href: "/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dhospital" },
      secondary: { label: "Browse hospitals", href: "/hospitals" },
      count: counts.hospitals > 0 ? `${counts.hospitals} verified` : undefined,
      tone: { bg: "bg-wellness", ink: "text-wellness-ink", ring: "ring-wellness-ink/15", dot: "text-brand" },
    },
  ];
  const cards = all.filter((c) => hospitals || c.key !== "hospital");

  return (
    <section id="more" aria-labelledby="more-h" className="mx-auto max-w-[1200px] scroll-mt-6 px-4 py-16 sm:px-8 sm:py-24">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-[640px] flex-col gap-3">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">For organisations</p>
          <h2 id="more-h" className="font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px]">Also on {BRAND.name}</h2>
          <p className="text-[17px] leading-relaxed text-[#3d4842]">Organisations that look after people join with the same account. Our team verifies each one before it appears.</p>
        </div>
        <p className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13.5px] font-semibold ring-1 ring-line">
          <svg aria-hidden viewBox="0 0 24 24" className="size-4 text-brand" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
          Every organisation is checked by our team
        </p>
      </div>

      <div className={`mt-10 grid gap-5 md:grid-cols-2 ${cards.length === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
        {cards.map((c) => (
          <article key={c.key} className="group flex flex-col overflow-hidden rounded-[28px] bg-white ring-1 ring-line transition-shadow hover:shadow-[0_30px_60px_-40px_rgba(24,33,29,0.45)]">
            <div className={`relative flex h-[220px] flex-col justify-center overflow-hidden px-6 ${c.tone.bg}`} role="img" aria-label={`Example of the ${c.title.toLowerCase()} workspace`}>
              <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-white/35" />
              <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 size-40 rounded-full bg-white/25" />
              <div className="relative transition-transform duration-500 group-hover:-translate-y-1">
                <Preview k={c.key} />
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-4 p-6 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`grid size-11 place-items-center rounded-2xl ${c.tone.bg} ${c.tone.ink}`}><Icon k={c.key} /></span>
                  <div>
                    <p className={`text-[12px] font-bold uppercase tracking-[0.1em] ${c.tone.ink}`}>{c.eyebrow}</p>
                    <h3 className="font-display text-[23px] font-bold leading-tight tracking-tight">{c.title}</h3>
                  </div>
                </div>
                {c.count && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${c.tone.bg} ${c.tone.ink}`}>{c.count}</span>}
              </div>
              <p className="text-[15px] leading-relaxed text-[#3d4842]">{c.body}</p>
              <ul className="flex flex-col gap-2 text-[14.5px]">
                {c.points.map((p) => (
                  <li key={p} className="flex gap-2.5"><Check className={c.tone.dot} />{p}</li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-5">
                <Link href={c.primary.href} className="btn bg-ink px-5 text-white hover:bg-brand-dark">{c.primary.label}</Link>
                {c.secondary && (
                  <Link href={c.secondary.href} className="inline-flex items-center gap-1 text-[14.5px] font-semibold text-brand underline-offset-4 hover:underline">
                    {c.secondary.label}
                    <span aria-hidden>→</span>
                  </Link>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
