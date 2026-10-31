"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Photo slider under the home page headline. Stock photos (Unsplash License,
 * free for commercial use, no attribution required); swap in photos from your
 * own pilot meet-ups by editing this list. They illustrate the kind of moments
 * Connect is for; captions describe activities, not real members.
 */
const PHOTOS = [
  { src: "https://images.unsplash.com/photo-1758599668780-60d53c35135d", alt: "Friends laughing together on a forest trek", caption: "Weekend treks" },
  { src: "https://images.unsplash.com/photo-1758274525946-2d3a5be67b5d", alt: "A small group doing yoga together in a park", caption: "Yoga in the park" },
  { src: "https://images.unsplash.com/photo-1758519288551-e22d8425d512", alt: "Two colleagues laughing over coffee at a café", caption: "Coffee with colleagues" },
  { src: "https://images.unsplash.com/photo-1625463006115-09f08489f591", alt: "Two friends laughing at something on a phone outdoors", caption: "Old friends, new plans" },
] as const;

const INTERVAL_MS = 5000;

function Arrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

/**
 * Full-width sliding photos (desktop only; on phones the join card comes first).
 * Moves every 5 seconds, pauses on hover or keyboard focus, never autoplays when
 * the visitor prefers reduced motion, and can be swiped, clicked or arrowed.
 */
export function HeroPhotos() {
  const n = PHOTOS.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const startX = useRef<number | null>(null);
  const go = useCallback((to: number) => setI(((to % n) + n) % n), [n]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || reduced) return;
    const t = setTimeout(() => setI((x) => (x + 1) % n), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [i, paused, reduced, n]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Moments on Connect"
      className="group relative hidden aspect-[16/10] w-full overflow-hidden rounded-[26px] bg-wellness lg:block"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(i - 1);
        if (e.key === "ArrowRight") go(i + 1);
      }}
      onPointerDown={(e) => { startX.current = e.clientX; }}
      onPointerUp={(e) => {
        if (startX.current === null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
      }}
    >
      <ul className="flex h-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" style={{ transform: `translateX(-${i * 100}%)` }}>
        {PHOTOS.map((p, k) => (
          <li key={p.src} className="relative h-full w-full shrink-0" role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${n}: ${p.caption}`} aria-hidden={k !== i}>
            <Image
              src={`${p.src}?auto=format&fit=crop&w=2000&q=90`}
              alt={p.alt}
              fill
              quality={90}
              sizes="(min-width: 1200px) 620px, (min-width: 1024px) 52vw, 0px"
              className="pointer-events-none object-cover select-none"
              draggable={false}
              priority={k === 0}
            />
          </li>
        ))}
      </ul>

      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/45 to-transparent" />
      <p className="absolute bottom-5 left-5 text-[15px] font-semibold text-white drop-shadow" aria-live={paused ? "polite" : "off"}>{PHOTOS[i].caption}</p>

      <div className="absolute right-5 bottom-5 flex items-center gap-2">
        {PHOTOS.map((p, k) => (
          <button key={p.src} type="button" onClick={() => go(k)} aria-label={`Show photo ${k + 1}: ${p.caption}`} aria-current={k === i} className={`h-2 rounded-full transition-all ${k === i ? "w-6 bg-white" : "w-2 bg-white/60 hover:bg-white/90"}`} />
        ))}
      </div>

      <button type="button" onClick={() => go(i - 1)} aria-label="Previous photo" className="absolute top-1/2 left-4 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink opacity-0 shadow transition group-hover:opacity-100 focus-visible:opacity-100">
        <Arrow dir="prev" />
      </button>
      <button type="button" onClick={() => go(i + 1)} aria-label="Next photo" className="absolute top-1/2 right-4 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink opacity-0 shadow transition group-hover:opacity-100 focus-visible:opacity-100">
        <Arrow dir="next" />
      </button>
    </section>
  );
}
