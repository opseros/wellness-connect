"use client";
// A strip of photos that keeps moving right to left: the kind of moments people
// plan on the network. Pauses on hover, keyboard focus or the pause button, and
// stays still (scrollable by hand) for people who prefer reduced motion.
import Image from "next/image";
import { useState } from "react";
import { HOME_PHOTOS } from "../home-photos";

export function Moments() {
  const [paused, setPaused] = useState(false);
  const row = (copy: boolean) =>
    HOME_PHOTOS.map((p, i) => (
      <li key={`${copy ? "b" : "a"}-${p.src}`} aria-hidden={copy || undefined} className="relative aspect-[3/4] w-[220px] shrink-0 overflow-hidden rounded-[24px] bg-wellness shadow-[0_18px_40px_-28px_rgba(15,60,48,0.6)] sm:w-[260px]">
        <Image src={`${p.src}?auto=format&fit=crop&w=800&q=80`} alt={copy ? "" : p.alt} fill sizes="260px" className="object-cover" loading={i < 5 && !copy ? "eager" : "lazy"} />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="absolute right-4 bottom-4 left-4 text-[15px] font-semibold text-white">{p.caption}</span>
      </li>
    ));

  return (
    <section aria-labelledby="moments-h" className="overflow-hidden bg-[linear-gradient(180deg,#e4f1ea_0%,#eef4ec_100%)] py-16 text-ink sm:py-20">
      <div className="mx-auto mb-8 flex max-w-[1280px] flex-wrap items-end justify-between gap-4 px-4 sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">Out there</p>
          <h2 id="moments-h" className="max-w-[620px] font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance text-[#10231c] sm:text-[48px]">Moments worth logging off for.</h2>
        </div>
        <div className="flex items-center gap-4">
          <p className="max-w-[340px] text-[15px] text-[#33433b]">Plans start as a post, a question or a meet-up in your city.</p>
          <button
            type="button"
            onClick={() => setPaused((x) => !x)}
            aria-pressed={paused}
            aria-label={paused ? "Play photos" : "Pause photos"}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink shadow-sm ring-1 ring-black/5 hover:bg-[#f7f3ec] motion-reduce:hidden"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
              {paused ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
            </svg>
          </button>
        </div>
      </div>
      <div className="group motion-reduce:overflow-x-auto" aria-label="Photos of moments" role="region" tabIndex={-1}>
        <ul
          className={`flex w-max gap-4 pr-4 motion-safe:animate-[marquee_70s_linear_infinite] group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] ${paused ? "[animation-play-state:paused]" : ""}`}
        >
          {row(false)}
          {row(true)}
        </ul>
      </div>
    </section>
  );
}
