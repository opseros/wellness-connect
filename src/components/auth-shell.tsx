import { BRAND } from "@/lib/brand";
import { Logo } from "./brand";

/**
 * Sign-up, sign-in and account-recovery pages. The left panel says what the
 * network is (with a clearly labelled example profile); the right holds the form.
 */
export function AuthShell({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col-reverse lg:flex-row">
      <section className="flex flex-col justify-between gap-10 bg-brand px-6 py-10 text-white sm:px-12 lg:w-[46%] lg:py-12">
        <span className="hidden lg:block"><Logo light href="/" /></span>
        <div className="flex max-w-[460px] flex-col gap-6">
          <h1 className="font-display text-[34px] leading-[1.02] font-extrabold tracking-[-0.03em] sm:text-[46px]">Your people and your experts, in one network.</h1>
          <p className="text-[16.5px] leading-relaxed text-white/85">
            Working professionals connect, join spaces and plan meet-ups. Wellness professionals get verified and get booked by companies. Both free to join.
          </p>
          <figure className="flex flex-col gap-2">
            <div className="rounded-[22px] bg-white p-5 text-ink shadow-[0_24px_50px_-30px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-3">
                <span aria-hidden className="grid size-12 place-items-center rounded-full bg-wellness font-bold text-wellness-ink">MI</span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    Meera Iyer
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-semibold text-brand-dark">
                      <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      Verified
                    </span>
                  </p>
                  <p className="text-[13.5px] text-muted">Mindfulness coach for teams, Bengaluru</p>
                </div>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-[#3d4842]">9 years running stress and focus programmes. In person in Bengaluru, online anywhere.</p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-[13px]">
                <span className="text-muted">412 connections</span>
                <span className="rounded-full bg-brand px-3.5 py-1.5 font-semibold text-white">Connect</span>
              </div>
            </div>
            <figcaption className="text-[12.5px] text-white/70">An example profile.</figcaption>
          </figure>
        </div>
        <p className="text-[13px] text-white/70">{BRAND.name} is for everyday wellbeing, not medical advice. We never ask for your health details to join.</p>
      </section>
      <section className="flex flex-1 flex-col px-6 py-8 sm:px-12 lg:py-12">
        <span className="lg:hidden"><Logo href="/" /></span>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="flex w-full max-w-[420px] flex-col gap-6">
            {title && (
              <div className="flex flex-col gap-1.5">
                <h2 className="font-display text-[30px] font-bold tracking-tight">{title}</h2>
                {subtitle && <p className="text-[15px] text-muted">{subtitle}</p>}
              </div>
            )}
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
