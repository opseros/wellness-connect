import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth-forms";
import { FeedCollage, LandingHeader, SpaceIcon, SPACES } from "@/components/landing";
import { BRAND } from "@/lib/brand";
import { enabledProviders } from "@/lib/providers";
import { getCurrentUser } from "@/modules/identity/session";
import { AudienceTabs, type Audience } from "@/components/audience-tabs";
import { listDirectory } from "@/modules/listings/service";
import { countVerifiedProfessionals } from "@/modules/professionals/service";

const join = (as: string) => `/sign-up?next=${encodeURIComponent(`/app/onboarding?as=${as}`)}`;
const white = "bg-white border border-line text-ink";
const plural = (n: number, one: string, many: string) => `${n} verified ${n === 1 ? one : many}`;

async function audiences(): Promise<Audience[]> {
  const [pros, stays, hospitals] = await Promise.all([
    countVerifiedProfessionals(),
    listDirectory("homestay").then((r) => r.slice(0, 2)),
    listDirectory("hospital").then((r) => r.slice(0, 2)),
  ]);
  return [
    {
      key: "members",
      label: "Members",
      who: "For everyone",
      title: "Your people for walks, retreats and better workdays.",
      body: "A free social space for working professionals: share what keeps you well, join meet-ups near you and follow verified experts.",
      points: ["Post, reply and message your connections", "Join spaces: wellness, travel, meet-ups, fitness, food, careers", "Find verified homestays for a restful break"],
      cta: { label: "Join free as a member", href: "/sign-up" },
      verify: "Only a verified email is needed.",
      cards: [
        { kicker: "Meet-ups", title: "Sunrise walk and chai, Sat 7 am", line: "An example of a meet-up post", tone: "bg-meetup text-meetup-ink" },
        { kicker: "Travel", title: "Quiet homestays in Coorg?", line: "An example question in the Travel space", tone: "bg-travel text-travel-ink" },
      ],
    },
    {
      key: "pros",
      label: "Professionals",
      who: "For wellness professionals",
      title: "Get verified once. Win work from companies.",
      body: "Coaches, nutritionists, physiotherapists and therapists list services with their own prices and answer enquiries from companies.",
      points: ["Profile, services and price ranges in rupees", "Credentials checked by our team", "Enquiries, proposals, bookings and payouts in one place"],
      cta: { label: "Join as a professional", href: join("pro") },
      more: { label: "Browse professionals", href: "/professionals" },
      verify: "Needs a verified credential for most categories.",
      cards: [
        { kicker: "Directory", title: pros ? plural(pros, "professional", "professionals") : "Be one of the first verified professionals", line: "Credentials checked before anyone can find you", tone: "bg-move text-move-ink", href: "/professionals" },
        { kicker: "How it works", title: "Enquiry → proposal → booking → payout", line: "Your share is paid after each session", tone: white },
      ],
    },
    {
      key: "companies",
      label: "Companies",
      who: "For HR and wellness teams",
      title: "Book verified professionals and programs for your teams.",
      body: "Post what your teams need, see professionals ranked by fit, compare proposals and pay online or by invoice with GST.",
      points: ["Matching with must-haves and explained scores", "Side-by-side proposals, bookings and GST invoices", "Homestays with space for team retreats"],
      cta: { label: "Set up your company", href: join("company") },
      verify: "Your work email links colleagues to your company.",
      cards: [
        { kicker: "Compare", title: "Proposals side by side", line: "Fee, dates, approach and reviews in one view", tone: "bg-career text-career-ink" },
        { kicker: "Retreats", title: "Team stays with meeting space", line: "Filter homestays by “Space for team sessions”", tone: white, href: "/homestays?feature=meeting_space" },
      ],
    },
    {
      key: "homestays",
      label: "Homestays",
      who: "For hosts",
      title: "Host travellers who come to rest, recover or reset.",
      body: "List rooms or a whole home and mark what makes it right for recovery: step-free access, distance to hospitals, a kitchen for special diets, room for a caregiver.",
      points: ["A verified listing in the homestay directory", "Recovery-friendly features travellers can filter by", "Bookings and payouts through the site (coming next)"],
      cta: { label: "List your homestay", href: join("homestay") },
      more: { label: "Browse homestays", href: "/homestays" },
      verify: "Needs your homestay or tourism registration, the owner's ID and real photos.",
      cards: stays.length
        ? stays.map((s) => ({ kicker: "Verified homestay", title: s.name, line: [s.listing.area, s.listing.city].filter(Boolean).join(", "), tone: "bg-meetup text-meetup-ink", href: `/homestays/${s.slug}` }))
        : [{ kicker: "Directory", title: "Be one of the first verified homestays", line: "Listings appear once our team has checked them", tone: "bg-meetup text-meetup-ink" }],
    },
    {
      key: "hospitals",
      label: "Hospitals",
      who: "For hospitals and clinics",
      title: "Welcome patients who travel to you for care.",
      body: "Show your specialties, accreditations and international patient desk. Patients will ask for quotes without sharing records, and share them only with you if they choose.",
      points: ["Verified profile: registration and NABH or JCI accreditation", "Specialties, languages and visa-letter support", "Quote requests and recovery stays nearby (coming with Care & Travel)"],
      cta: { label: "Register your hospital", href: join("hospital") },
      more: { label: "Browse hospitals", href: "/hospitals" },
      verify: "Needs the hospital registration and an authorisation letter; accreditations are shown once we've seen the certificate.",
      cards: hospitals.length
        ? hospitals.map((h) => ({ kicker: h.listing.accreditations.length ? `${h.listing.accreditations.join(", ")} accredited` : "Verified hospital", title: h.name, line: h.listing.specialties.slice(0, 3).join(", ") || h.listing.city, tone: "bg-travel text-travel-ink", href: `/hospitals/${h.slug}` }))
        : [{ kicker: "Directory", title: "Be one of the first verified hospitals", line: "Profiles appear once our team has checked them", tone: "bg-travel text-travel-ink" }],
    },
  ];
}

const tile: Record<string, string> = {
  wellness: "bg-wellness text-wellness-ink",
  travel: "bg-travel text-travel-ink",
  meetup: "bg-meetup text-meetup-ink",
  move: "bg-move text-move-ink",
  food: "bg-food text-food-ink",
  career: "bg-career text-career-ink",
};

/**
 * Public home page: what Connect feels like, the spaces to explore, and
 * sign-in right there. Signed-in people go straight to the app (or ?next=).
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ reset?: string; next?: string }> }) {
  const user = await getCurrentUser();
  const { reset, next } = await searchParams;
  if (user) redirect(next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/app");
  const returning = Boolean(reset || next);
  const tabs = await audiences();

  return (
    <div className="overflow-x-clip bg-ground">
      <LandingHeader />

      <section className="mx-auto grid max-w-[1200px] items-center gap-x-10 gap-y-10 px-4 pt-6 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:pt-10">
        <div className="flex flex-col gap-8">
          <div className="flex max-w-[600px] flex-col gap-5">
            <h1 className="font-display text-[44px] leading-[1.02] font-extrabold tracking-[-0.03em] sm:text-[64px]">
              Find your people for walks, retreats and better workdays.
            </h1>
            <p className="max-w-[520px] text-[17px] leading-relaxed text-[#3d4842]">
              {BRAND.name} Connect is a free social space for working professionals. Share what keeps you well, plan meet-ups and trips with people near you,
              and learn from verified wellness experts.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/sign-up" className="btn bg-brand px-6 text-white hover:bg-brand-dark">Create your free account</Link>
              <a href="#who" className="btn px-4 text-brand hover:bg-white">Who it&apos;s for</a>
            </div>
          </div>
          <FeedCollage />
        </div>

        <div id="sign-in" className={`scroll-mt-6 lg:sticky lg:top-6 lg:self-start ${returning ? "order-first lg:order-none" : ""}`}>
          <div className="rounded-[28px] border border-line bg-white p-6 shadow-[0_30px_60px_-40px_rgba(24,33,29,0.35)] sm:p-8">
            <h2 className="font-display text-[26px] font-bold tracking-tight">{reset ? "Password changed" : "Welcome back"}</h2>
            <p className="mt-1 mb-6 text-[15px] text-muted">{reset ? "Sign in with your new password." : "Sign in to your feed, messages and bookings."}</p>
            <SignInForm providers={enabledProviders()} />
          </div>
        </div>
      </section>

      <section id="who" aria-labelledby="who-h" className="mx-auto max-w-[1200px] scroll-mt-6 px-4 pb-16 sm:px-8 sm:pb-20">
        <div className="mb-6 flex max-w-[720px] flex-col gap-3">
          <h2 id="who-h" className="font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px]">One place for everyone who keeps people well</h2>
          <p className="text-[17px] leading-relaxed text-[#3d4842]">Members connect and plan meet-ups. Professionals and companies work together. Homestays and hospitals welcome people who travel for rest and care.</p>
        </div>
        <AudienceTabs audiences={tabs} />
      </section>

      <section id="spaces" className="scroll-mt-6 border-t border-line bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
          <div className="flex max-w-[640px] flex-col gap-3">
            <h2 className="font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px]">Spaces for the life around your work</h2>
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

      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
        <h2 className="max-w-[640px] font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px]">What you can do in Connect</h2>
        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Post and ask", d: "Share a tip, a photo from the trail or a question. Like and reply to what others share." },
            { t: "Meet in person", d: "Start a walk, run or chai meet-up and see who's going. Or join one near you." },
            { t: "Grow your network", d: "Connect with colleagues, peers and wellness experts. Message people you're connected with." },
            { t: "Learn from experts", d: "Follow verified coaches, nutritionists and therapists, and see the programs they run for teams." },
          ].map((f) => (
            <div key={f.t} className="flex flex-col gap-2 border-l-2 border-brand pl-5">
              <h3 className="text-[17px] font-bold">{f.t}</h3>
              <p className="text-[15px] leading-relaxed text-[#3d4842]">{f.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 max-w-[640px] text-[14px] text-muted">
          Connect is for everyday wellbeing, not medical advice. Please don&apos;t share health details about yourself or other people.
        </p>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-8 sm:pb-20">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-[28px] bg-ink p-8 text-white sm:p-10">
            <h2 className="font-display text-[28px] leading-tight font-bold tracking-tight">For companies</h2>
            <p className="max-w-[460px] text-[16px] leading-relaxed text-white/80">
              Post what your teams need, see verified professionals ranked by fit, compare proposals side by side and book workshops, coaching and programs.
            </p>
            <Link href="/sign-up" className="btn mt-auto self-start bg-white px-6 text-ink hover:bg-brand-soft">Set up your company</Link>
          </div>
          <div className="flex flex-col gap-4 rounded-[28px] bg-brand p-8 text-white sm:p-10">
            <h2 className="font-display text-[28px] leading-tight font-bold tracking-tight">For wellness professionals</h2>
            <p className="max-w-[460px] text-[16px] leading-relaxed text-white/85">
              Get verified once, list your services with your own prices, and answer enquiries from companies looking for exactly what you offer.
            </p>
            <Link href="/sign-up" className="btn mt-auto self-start bg-white px-6 text-brand-dark hover:bg-brand-soft">Join as a professional</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-8 sm:pb-20">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-travel p-8 text-travel-ink sm:p-10">
          <div className="flex max-w-[620px] flex-col gap-2">
            <h2 className="font-display text-[28px] leading-tight font-bold tracking-tight">Travelling for treatment or to recover?</h2>
            <p className="text-[16px] leading-relaxed opacity-90">Browse verified hospitals and quiet, step-free homestays close by. Quote requests and care trip planning are coming soon.</p>
          </div>
          <span className="flex flex-wrap gap-3">
            <Link href="/hospitals" className="btn bg-travel-ink px-6 text-white hover:opacity-90">Browse hospitals</Link>
            <Link href="/homestays?feature=near_hospital" className="btn bg-white px-6 text-travel-ink">Recovery stays</Link>
          </span>
        </div>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-8">
          <span>
            <span className="font-display font-bold text-ink">{BRAND.name}</span> · {BRAND.tagline}
          </span>
          <span className="text-[13px]">Information on {BRAND.name} is not medical advice.</span>
          <span className="flex gap-5">
            <Link href="/professionals" className="hover:text-ink">Professionals</Link>
            <Link href="/homestays" className="hover:text-ink">Homestays</Link>
            <Link href="/hospitals" className="hover:text-ink">Hospitals</Link>
            <a href="#sign-in" className="hover:text-ink">Sign in</a>
            <Link href="/sign-up" className="hover:text-ink">Create account</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
