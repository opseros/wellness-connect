import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth-forms";
import { FeedCollage, LandingHeader, SpaceIcon, SPACES } from "@/components/landing";
import { BRAND } from "@/lib/brand";
import { enabledProviders } from "@/lib/providers";
import { getCurrentUser } from "@/modules/identity/session";

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
              <a href="#spaces" className="btn px-4 text-brand hover:bg-white">Explore the spaces</a>
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

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-8">
          <span>
            <span className="font-display font-bold text-ink">{BRAND.name}</span> · {BRAND.tagline}
          </span>
          <span className="flex gap-5">
            <a href="#sign-in" className="hover:text-ink">Sign in</a>
            <Link href="/sign-up" className="hover:text-ink">Create account</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
