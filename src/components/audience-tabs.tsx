"use client";
import Link from "next/link";
import { useRef, useState } from "react";

export type AudienceCard = { kicker: string; title: string; line: string; tone: string; href?: string };
export type Audience = {
  key: string;
  label: string;
  who: string;
  title: string;
  body: string;
  points: string[];
  cta: { label: string; href: string };
  more?: { label: string; href: string };
  verify: string;
  cards: AudienceCard[];
};

/** Home page "who it's for" tabs (WAI-ARIA tabs: arrow keys move between tabs). */
export function AudienceTabs({ audiences }: { audiences: Audience[] }) {
  const [i, setI] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const a = audiences[i];
  const move = (to: number) => {
    const n = (to + audiences.length) % audiences.length;
    setI(n);
    refs.current[n]?.focus();
  };
  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Who it's for" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {audiences.map((t, n) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[n] = el;
            }}
            id={`tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={n === i}
            aria-controls={`panel-${t.key}`}
            tabIndex={n === i ? 0 : -1}
            onClick={() => setI(n)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(n + 1);
              else if (e.key === "ArrowLeft") move(n - 1);
              else if (e.key === "Home") move(0);
              else if (e.key === "End") move(audiences.length - 1);
              else return;
              e.preventDefault();
            }}
            className={`min-h-11 shrink-0 rounded-full border px-5 text-[15px] font-semibold ${n === i ? "border-ink bg-ink text-white" : "border-[#c9d1cc] bg-white text-ink hover:border-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id={`panel-${a.key}`} role="tabpanel" aria-labelledby={`tab-${a.key}`} className="grid gap-6 rounded-[28px] border border-line bg-white p-6 sm:p-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-4">
          <span className="self-start rounded-full bg-brand-soft px-3 py-1 text-[13px] font-bold text-brand-dark">{a.who}</span>
          <h3 className="font-display text-[28px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[36px]">{a.title}</h3>
          <p className="text-[16px] leading-relaxed text-[#3d4842]">{a.body}</p>
          <ul className="flex flex-col gap-2.5">
            {a.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[15px]">
                <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href={a.cta.href} className="btn bg-brand px-6 text-white hover:bg-brand-dark">{a.cta.label}</Link>
            {a.more && <Link href={a.more.href} className="btn border border-brand px-5 text-brand hover:bg-brand-soft">{a.more.label}</Link>}
          </div>
          <p className="text-[13px] text-muted">{a.verify}</p>
        </div>
        <div className="flex flex-col gap-3 self-center">
          {a.cards.map((c) => {
            const inner = (
              <>
                <span className="text-[12px] font-bold uppercase tracking-wide opacity-80">{c.kicker}</span>
                <span className="font-display text-[19px] font-bold leading-snug">{c.title}</span>
                <span className="text-[14px] opacity-85">{c.line}</span>
              </>
            );
            return c.href ? (
              <Link key={c.title} href={c.href} className={`flex flex-col gap-1 rounded-[20px] p-5 hover:shadow-md ${c.tone}`}>{inner}</Link>
            ) : (
              <div key={c.title} className={`flex flex-col gap-1 rounded-[20px] p-5 ${c.tone}`}>{inner}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
