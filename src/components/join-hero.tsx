"use client";
import { useState } from "react";
import type { Providers } from "./auth-forms";
import { JoinPanel, type JoinRole } from "./join-panel";

const COPY: Record<JoinRole, { title: string; body: string; points: string[] }> = {
  member: {
    title: "The professional network for a better working life.",
    body: "Connect with colleagues and peers, join spaces for wellness, travel and careers, plan meet-ups near you, find gyms and yoga studios, and learn from verified experts. Free for every working professional.",
    points: ["Free, always", "Verified wellness experts", "No health details asked"],
  },
  pro: {
    title: "Get verified once. Get booked by companies.",
    body: "Coaches, nutritionists, physiotherapists and therapists: show companies your checked credentials, list services at your own prices, and grow a following on Connect.",
    points: ["Verified badge on your profile", "Enquiries from companies", "Paid after each session"],
  },
};

/** Home page hero: choosing a role changes the promise and what the join card sets up. */
export function JoinHero({ providers, initialMode, initialRole = "member", photos }: { providers: Providers; initialMode: "join" | "signin"; initialRole?: JoinRole; photos?: React.ReactNode }) {
  const [role, setRole] = useState<JoinRole>(initialRole);
  const c = COPY[role];
  return (
    <section aria-labelledby="hero-h" className="mx-auto grid max-w-[1200px] items-start gap-x-14 gap-y-10 px-4 pt-6 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-14">
      <div className="flex flex-col gap-7 lg:pt-6" aria-live="polite">
        <h1 id="hero-h" className="max-w-[640px] font-display text-[44px] leading-[1.0] font-extrabold tracking-[-0.035em] text-balance sm:text-[68px]">
          {c.title}
        </h1>
        <p className="max-w-[540px] text-[17.5px] leading-relaxed text-[#3d4842]">{c.body}</p>
        {photos}
        <ul className="flex flex-wrap gap-2">
          {c.points.map((p) => (
            <li key={p} className="flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[14px] font-semibold ring-1 ring-line">
              <svg aria-hidden viewBox="0 0 24 24" className="size-4 text-brand" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div id="join" className={`scroll-mt-6 rounded-[28px] border border-line bg-white p-6 shadow-[0_30px_60px_-40px_rgba(24,33,29,0.35)] sm:p-8 ${initialMode === "signin" ? "order-first lg:order-none" : ""}`}>
        <JoinPanel providers={providers} initialMode={initialMode} initialRole={initialRole} onRoleChange={setRole} />
      </div>
    </section>
  );
}
