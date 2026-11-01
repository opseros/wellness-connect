import Link from "next/link";
import { redirect } from "next/navigation";
import { FeedCollage, LandingHeader, SpaceIcon, SPACES } from "@/components/landing";
import { JoinHero } from "@/components/join-hero";
import { HeroPhotos } from "@/components/hero-photos";
import { AlsoOn } from "@/components/also-on";
import { ExploreSection } from "@/components/explore-section";
import { BRAND } from "@/lib/brand";
import { enabledProviders } from "@/lib/providers";
import { getCurrentUser } from "@/modules/identity/session";
import { countVerifiedProfessionals } from "@/modules/professionals/service";
import { careTravelEnabled } from "@/modules/care/service";
import { directoryCounts } from "@/modules/listings/service";
import { hospitalsVisible } from "@/modules/platform/features";

const tile: Record<string, string> = {
  wellness: "bg-wellness text-wellness-ink",
  travel: "bg-travel text-travel-ink",
  meetup: "bg-meetup text-meetup-ink",
  move: "bg-move text-move-ink",
  food: "bg-food text-food-ink",
  career: "bg-career text-career-ink",
};

const TRUST = [
  { title: "Credentials checked", line: "Professionals get a verified badge only after we've seen their certificate.", tone: "bg-wellness text-wellness-ink", d: "M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Zm-3 9 2 2 4-4" },
  { title: "Real places, verified", line: "Homestays and gyms show us their registration, ID and real photos first.", tone: "bg-travel text-travel-ink", d: "M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5m-8.5 5 2 2 4-4" },
  { title: "No health details asked", line: "Your network is about wellbeing, never your medical history.", tone: "bg-meetup text-meetup-ink", d: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10ZM9 11h6" },
  { title: "Safe payments", line: "Pay online through Razorpay, with a GST invoice for every booking.", tone: "bg-career text-career-ink", d: "M3 7h18v10H3zM3 11h18M7 15h3" },
];

const PRO_STEPS = [
  { t: "Create your profile", d: "Your specialities, experience, languages, and where you work: in person, online or both." },
  { t: "List your services", d: "Workshops, coaching and programmes with your own price ranges in rupees." },
  { t: "Get verified", d: "Upload a certificate. Our team checks it, usually within 2 working days, and your profile gets the verified badge." },
  { t: "Get booked", d: "Companies send enquiries that match what you offer. You propose, they book and pay, and your share is paid after the session." },
];

/**
 * Public home page: a professional network first. The hero's role choice
 * (member or wellness professional) drives the join card; companies, homestays
 * and hospitals have a short section further down. Signed-in people go
 * straight to the app (or ?next=).
 */
function footerLinks(hospitals: boolean) {
  return [
    {
      title: "Explore",
      links: [
        { label: "Wellness professionals", href: "/professionals" },
        { label: "Homestays", href: "/homestays" },
        { label: "Gyms & studios", href: "/facilities" },
        ...(hospitals ? [{ label: "Hospitals", href: "/hospitals" }] : []),
        { label: "Spaces", href: "/#spaces" },
      ],
    },
    {
      title: "Join as",
      links: [
        { label: "A member", href: "/sign-up" },
        { label: "A wellness professional", href: "/sign-up?as=pro" },
        { label: "A company", href: "/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dcompany" },
        { label: "A homestay host", href: "/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dhomestay" },
        { label: "A gym or studio", href: "/sign-up?next=%2Fapp%2Fonboarding%3Fas%3Dfacility" },
      ],
    },
    { title: "Account", links: [{ label: "Sign in", href: "/sign-in" }, { label: "Join free", href: "/sign-up" }, { label: "Forgot password", href: "/forgot-password" }] },
  ];
}

export default async function Home({ searchParams }: { searchParams: Promise<{ reset?: string; next?: string; as?: string }> }) {
  const user = await getCurrentUser();
  const { reset, next, as } = await searchParams;
  if (user) redirect(next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/app");
  const returning = Boolean(reset || next);
  const [verified, counts, showHospitals] = await Promise.all([countVerifiedProfessionals(), directoryCounts(), hospitalsVisible(null)]);
  const care = careTravelEnabled();

  const FOOTER = footerLinks(showHospitals);

  return (
    <div className="overflow-x-clip bg-ground">
      <LandingHeader />
      {reset && <p role="status" className="mx-auto max-w-[1200px] px-4 sm:px-8"><span className="block rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-dark">Password changed. Sign in with your new password.</span></p>}
      <JoinHero providers={enabledProviders()} initialMode={returning ? "signin" : "join"} initialRole={as === "pro" ? "pro" : "member"} photos={<HeroPhotos />} />

      <section aria-label="Why people trust us" className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-8">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t) => (
            <li key={t.title} className="flex gap-3.5 rounded-[22px] bg-white p-5 ring-1 ring-line">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${t.tone}`}>
                <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d={t.d} /></svg>
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-[15px] font-bold">{t.title}</span>
                <span className="text-[13.5px] leading-snug text-[#3d4842]">{t.line}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="inside-h" className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex max-w-[480px] flex-col gap-5">
            <h2 id="inside-h" className="font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px]">A feed about the life around work, not just the work.</h2>
            <p className="text-[17px] leading-relaxed text-[#3d4842]">Share what keeps you going, ask the people who&apos;ve been there, and turn a good idea into a Saturday walk. Your feed comes from your connections, the people you follow and the spaces you join.</p>
            <ul className="flex flex-col gap-3 text-[15.5px]">
              <li><span className="font-semibold">Connections and messages.</span> Only people you&apos;re connected with can message you.</li>
              <li><span className="font-semibold">Meet-ups.</span> Walks, runs and chai circles in your city, with an &ldquo;I&apos;m going&rdquo; list.</li>
              <li><span className="font-semibold">Experts you can trust.</span> Wellness professionals show a verified badge once our team has checked their credentials.</li>
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <FeedCollage />
            <p className="text-center text-[12.5px] text-muted">Examples of posts in Connect.</p>
          </div>
        </div>
      </section>

      <ExploreSection counts={{ professionals: verified, homestays: counts.homestays, facilities: counts.facilities }} />

      <section id="spaces" aria-labelledby="spaces-h" className="scroll-mt-6 border-t border-line bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
          <div className="flex max-w-[640px] flex-col gap-3">
            <h2 id="spaces-h" className="font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px]">Spaces to start with</h2>
            <p className="text-[17px] leading-relaxed text-[#3d4842]">Join the ones you care about. Your feed fills with posts, questions and plans from people who share them.</p>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SPACES.map((s) => (
              <li key={s.key} className={`flex flex-col gap-4 rounded-[24px] p-6 ${tile[s.key]}`}>
                <span className="grid size-11 place-items-center rounded-2xl bg-white/70">
                  <SpaceIcon k={s.key} className="size-6" />
                </span>
                <div>
                  <h3 className="font-display text-[22px] font-bold tracking-tight">{s.name}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed opacity-90">{s.line}</p>
                </div>
                <p className="mt-auto rounded-2xl bg-white/75 px-4 py-3 text-[14px] text-ink">“{s.prompt}”</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="pro-h" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
        <div className="mb-8 flex max-w-[640px] flex-col gap-3">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">Who it&apos;s for</p>
          <p className="font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px]">One account, whichever side you&apos;re on.</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="flex flex-col justify-between gap-8 rounded-[28px] bg-wellness p-8 text-wellness-ink sm:p-10">
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-[30px] leading-tight font-extrabold tracking-[-0.02em] text-ink">For working professionals</h2>
              <p className="text-[16px] leading-relaxed text-ink/80">Build a profile in a minute, follow the topics you care about, and grow a network that looks after each other.</p>
              <ul className="flex flex-col gap-3 text-[15px] text-ink">
                <li className="flex gap-2.5"><svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Join spaces for wellness, travel, meet-ups, fitness, food and careers</li>
                <li className="flex gap-2.5"><svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Start or join communities, open to all or moderated</li>
                <li className="flex gap-2.5"><svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Find verified coaches, nutritionists and therapists</li>
                <li className="flex gap-2.5"><svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Discover gyms, yoga studios and wellness centres near you</li>
                <li className="flex gap-2.5"><svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Book quiet homestays for a proper break</li>
              </ul>
            </div>
            <a href="#join" className="btn self-start bg-brand px-6 text-white hover:bg-brand-dark">Join free</a>
          </div>
          <div className="flex flex-col gap-7 rounded-[28px] bg-ink p-8 text-white sm:p-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="pro-h" className="max-w-[440px] font-display text-[30px] leading-tight font-extrabold tracking-[-0.02em]">For wellness professionals</h2>
              {verified > 0 && <Link href="/professionals" className="text-[14px] font-semibold text-white/80 underline-offset-4 hover:underline">{verified} verified professional{verified === 1 ? "" : "s"} already here</Link>}
            </div>
            <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {PRO_STEPS.map((s, i) => (
                <li key={s.t} className="flex gap-4">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 font-display text-[17px] font-bold">{i + 1}</span>
                  <span className="flex flex-col gap-1">
                    <span className="text-[16px] font-bold">{s.t}</span>
                    <span className="text-[14.5px] leading-relaxed text-white/75">{s.d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-4 border-t border-white/15 pt-6">
              <Link href="/sign-up?as=pro" className="btn bg-white px-6 text-ink hover:bg-brand-soft">Join as a professional</Link>
              <span className="text-[14px] text-white/70">Free to join. A commission applies only to bookings.</span>
            </div>
          </div>
        </div>
      </section>

      <AlsoOn care={care} counts={counts} hospitals={showHospitals} />

      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-brand p-8 text-white sm:p-12">
          <div className="flex max-w-[560px] flex-col gap-2">
            <h2 className="font-display text-[30px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[38px]">Your profile takes a minute.</h2>
            <p className="text-[16px] text-white/85">Join free with Google, Microsoft or your email.</p>
          </div>
          <span className="flex flex-wrap gap-3">
            <a href="#join" className="btn bg-white px-6 text-brand-dark hover:bg-brand-soft">Join free</a>
            <Link href="/sign-up?as=pro" className="btn border border-white/50 px-6 text-white hover:bg-white/10">Join as a professional</Link>
          </span>
        </div>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-8 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex flex-col gap-3">
            <span className="flex items-center gap-2.5">
              <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-brand font-display text-[17px] font-extrabold text-white">{BRAND.name[0]}</span>
              <span className="flex flex-col leading-none">
                <span className="font-display text-[18px] font-extrabold">{BRAND.name}</span>
                <span className="mt-1 text-[11px] font-semibold text-muted">{BRAND.tagline}</span>
              </span>
            </span>
            <p className="max-w-[320px] text-[14px] leading-relaxed text-muted">The professional network for a better working life. Everything listed here is checked by our team.</p>
            <p className="text-[12.5px] text-muted">Connect is for everyday wellbeing, not medical advice. Photos: Unsplash.</p>
          </div>
          {FOOTER.filter((c) => c.links.length).map((c) => (
            <nav key={c.title} aria-label={c.title} className="flex flex-col gap-3 text-[14px]">
              <span className="font-bold">{c.title}</span>
              {c.links.map((l) => (
                <Link key={l.label} href={l.href} className="text-muted hover:text-ink">{l.label}</Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-[1200px] px-4 py-5 text-[12.5px] text-muted sm:px-8">© {new Date().getFullYear()} {BRAND.name}. Made in India.</p>
        </div>
      </footer>
    </div>
  );
}
