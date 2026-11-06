// Home hero: a light mint panel with the promise and a photo slider on the left,
// and the sign-in / join card on the right. Sized so the activity strip below
// still shows on a laptop screen before scrolling.
import { BrandMark } from "../brand-mark";
import { JoinPanel, type JoinRole } from "../join-panel";
import type { Providers } from "../auth-forms";
import { HeroSlider } from "./hero-slider";

const POINTS = ["Free, always", "Verified wellness experts", "No health details asked"];

function Leaves() {
  return (
    <svg aria-hidden viewBox="0 0 64 64" className="pointer-events-none absolute -top-24 -right-24 size-[420px] opacity-[0.07]">
      <path d="M31 54 C13 47 8 27 14 9 C29 15 36 34 31 54 Z" fill="#0f6b5c" />
      <path d="M33 54 C51 47 56 27 50 9 C35 15 28 34 33 54 Z" fill="#0f6b5c" />
    </svg>
  );
}

export function HomeHero({ providers, initialMode, initialRole, cardFirst }: { providers: Providers; initialMode: "join" | "signin"; initialRole: JoinRole; cardFirst: boolean }) {
  return (
    <section aria-labelledby="hero-h" className="mx-auto max-w-[1280px] px-3 sm:px-6">
      <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#e4f1ea_0%,#eef4ec_55%,#f6efe0_100%)] text-ink ring-1 ring-[#0f6b5c]/10">
        <Leaves />
        <div className="relative grid items-start gap-x-10 gap-y-8 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col gap-5">
            <p className="flex w-fit items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.16em] text-brand-dark ring-1 ring-[#0f6b5c]/10">
              <BrandMark size={16} />
              Every season of working life
            </p>
            <h1 id="hero-h" className="max-w-[680px] font-display text-[38px] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance text-[#10231c] sm:text-[50px]">
              The professional network for a <span className="text-brand">better working life.</span>
            </h1>
            <p className="max-w-[600px] text-[16.5px] leading-relaxed text-[#33433b]">
              Meet people who care about the life around work. Join spaces, plan sunrise walks, book verified coaches and find quiet places to recharge.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex flex-wrap gap-3">
                <a href="#join" className="btn bg-brand px-6 text-white hover:bg-brand-dark">Join free</a>
                <a href="#inside" className="btn border border-[#10231c]/20 bg-white/70 px-6 text-[#10231c] hover:bg-white">See what&apos;s inside</a>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px] font-semibold text-[#33433b]">
                {POINTS.map((p) => (
                  <li key={p} className="flex items-center gap-1.5">
                    <svg aria-hidden viewBox="0 0 24 24" className="size-4 text-brand" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <HeroSlider />
          </div>
          <div id="join" className={`scroll-mt-6 rounded-[26px] bg-white p-5 text-ink shadow-[0_30px_60px_-36px_rgba(15,60,48,0.45)] ring-1 ring-black/5 sm:p-7 ${cardFirst ? "order-first lg:order-none" : ""}`}>
            <span id="signin" aria-hidden className="block scroll-mt-6" />
            <JoinPanel providers={providers} initialMode={initialMode} initialRole={initialRole} />
          </div>
        </div>
      </div>
    </section>
  );
}
