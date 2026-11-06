// A sideways strip of photos: the kind of moments people plan on the network.
import Image from "next/image";
import { HOME_PHOTOS } from "../home-photos";

export function Moments() {
  return (
    <section aria-labelledby="moments-h" className="bg-[#0f1f1a] py-16 text-[#f4efe6] sm:py-20">
      <div className="mx-auto mb-8 flex max-w-[1280px] flex-wrap items-end justify-between gap-4 px-4 sm:px-8">
        <h2 id="moments-h" className="max-w-[620px] font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[48px]">Moments worth logging off for.</h2>
        <p className="max-w-[360px] text-[15px] text-[#f4efe6]/70">Plans start as a post, a question or a meet-up in your city. Swipe to see a few.</p>
      </div>
      <ul tabIndex={0} aria-label="Photos of moments" className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-[#f2c46d] sm:px-8 lg:px-[max(2rem,calc((100vw_-_1280px)/2_+_2rem))]">
        {HOME_PHOTOS.map((p, i) => (
          <li key={p.src} className="relative aspect-[3/4] w-[240px] shrink-0 snap-start overflow-hidden rounded-[24px] bg-white/10 sm:w-[280px]">
            <Image src={`${p.src}?auto=format&fit=crop&w=800&q=80`} alt={p.alt} fill sizes="280px" className="object-cover" loading={i < 4 ? "eager" : "lazy"} />
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
            <span className="absolute bottom-4 left-4 right-4 text-[15px] font-semibold">{p.caption}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
