import Link from "next/link";
import { redirect } from "next/navigation";
import { FeedCollage, LandingHeader, SpaceIcon, SPACES } from "@/components/landing";
import { JoinHero } from "@/components/join-hero";
import { HeroPhotos } from "@/components/hero-photos";
import { AlsoOn } from "@/components/also-on";
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
export default async function Home({ searchParams }: { searchParams: Promise<{ reset?: string; next?: string; as?: string }> }) {
  const user = await getCurrentUser();
  const { reset, next, as } = await searchParams;
  if (user) redirect(next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/app");
  const returning = Boolean(reset || next);
  const [verified, counts, showHospitals] = await Promise.all([countVerifiedProfessionals(), directoryCounts(), hospitalsVisible(null)]);
  const care = careTravelEnabled();

  return (
    <div className="overflow-x-clip bg-ground">
      <LandingHeader />
      {reset && <p role="status" className="mx-auto max-w-[1200px] px-4 sm:px-8"><span className="block rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-dark">Password changed. Sign in with your new password.</span></p>}
      <JoinHero providers={enabledProviders()} initialMode={returning ? "signin" : "join"} initialRole={as === "pro" ? "pro" : "member"} photos={<HeroPhotos />} />

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

      <section aria-labelledby="pro-h" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="flex flex-col justify-between gap-8 rounded-[28px] bg-white p-8 ring-1 ring-line sm:p-10">
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-[30px] leading-tight font-extrabold tracking-[-0.02em]">For working professionals</h2>
              <p className="text-[16px] leading-relaxed text-[#3d4842]">Build a profile in a minute, follow the topics you care about, and grow a network that looks after each other.</p>
              <ul className="flex flex-col gap-2.5 text-[15px]">
                <li>Join spaces for wellness, travel, meet-ups, fitness, food and careers</li>
                <li>Start or join communities, open to all or moderated</li>
                <li>Find verified coaches, nutritionists and therapists</li>
                <li>Book quiet homestays for a proper break</li>
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

      <AlsoOn care={care} counts={counts} hospitals={showHospitals} />

      <section className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-8 sm:pb-20">
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
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-8">
          <span>
            <span className="font-display font-bold text-ink">{BRAND.name}</span> {BRAND.tagline}
          </span>
          <span className="text-[13px]">Connect is for everyday wellbeing, not medical advice. Photos: Unsplash.</span>
          <span className="flex flex-wrap gap-5">
            <Link href="/professionals" className="hover:text-ink">Professionals</Link>
            <Link href="/homestays" className="hover:text-ink">Homestays</Link>
            <Link href="/facilities" className="hover:text-ink">Gyms &amp; studios</Link>
            {showHospitals && <Link href="/hospitals" className="hover:text-ink">Hospitals</Link>}
            <Link href="/sign-in" className="hover:text-ink">Sign in</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
