// Home hero: a dark rounded panel with the promise on the left, the sign-in /
// join card on the right, and large faint leaves behind them.
import { BrandMark } from "../brand-mark";
import { JoinPanel, type JoinRole } from "../join-panel";
import type { Providers } from "../auth-forms";

const POINTS = ["Free, always", "Verified wellness experts", "No health details asked"];

function BigLeaves() {
  return (
    <svg aria-hidden viewBox="0 0 64 64" className="pointer-events-none absolute -right-40 -bottom-40 size-[720px] opacity-[0.16] lg:-right-24 lg:-bottom-32">
      <path d="M31 54 C13 47 8 27 14 9 C29 15 36 34 31 54 Z" fill="#3fb39b" />
      <path d="M33 54 C51 47 56 27 50 9 C35 15 28 34 33 54 Z" fill="#a8e0d3" />
    </svg>
  );
}

export function HomeHero({ providers, initialMode, initialRole, cardFirst }: { providers: Providers; initialMode: "join" | "signin"; initialRole: JoinRole; cardFirst: boolean }) {
  return (
    <section aria-labelledby="hero-h" className="mx-auto max-w-[1280px] px-3 sm:px-6">
      <div className="relative overflow-hidden rounded-[36px] bg-[#0f1f1a] text-[#f4efe6]">
        <BigLeaves />
        <div className="relative grid items-center gap-x-14 gap-y-10 px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:py-20">
          <div className="flex flex-col gap-7">
            <p className="flex w-fit items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[12.5px] font-bold uppercase tracking-[0.16em] text-[#a8e0d3]">
              <BrandMark size={18} light />
              Every season of working life
            </p>
            <h1 id="hero-h" className="max-w-[640px] font-display text-[44px] leading-[0.98] font-extrabold tracking-[-0.04em] text-balance sm:text-[72px]">
              The professional network for a <span className="text-[#f2c46d]">better working life.</span>
            </h1>
            <p className="max-w-[540px] text-[18px] leading-relaxed text-[#f4efe6]/75">
              Meet people who care about the life around work. Join spaces, plan sunrise walks, book verified coaches and find quiet places to recharge.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="#join" className="btn bg-[#f2c46d] px-6 text-ink hover:bg-[#f6d48e]">Join free</a>
              <a href="#inside" className="btn border border-white/25 px-6 text-[#f4efe6] hover:bg-white/10">See what&apos;s inside</a>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[14px] font-semibold text-[#f4efe6]/85">
              {POINTS.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <svg aria-hidden viewBox="0 0 24 24" className="size-4 text-[#3fb39b]" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div id="join" className={`scroll-mt-6 rounded-[28px] bg-white p-6 text-ink shadow-[0_40px_80px_-40px_rgba(0,0,0,0.6)] sm:p-8 ${cardFirst ? "order-first lg:order-none" : ""}`}>
            <span id="signin" aria-hidden className="block scroll-mt-6" />
            <JoinPanel providers={providers} initialMode={initialMode} initialRole={initialRole} />
          </div>
        </div>
      </div>
    </section>
  );
}
