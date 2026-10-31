import Image from "next/image";

/**
 * Photos under the home page headline. Stock photos (Unsplash License, free
 * for commercial use, no attribution required); swap in photos from your own
 * pilot meet-ups by editing this list. They illustrate the kind of moments
 * Connect is for; captions describe activities, not real members.
 */
const PHOTOS = [
  { src: "https://images.unsplash.com/photo-1758599668780-60d53c35135d", alt: "Friends laughing together on a forest trek", caption: "Weekend treks", credit: "Vitaly Gariev" },
  { src: "https://images.unsplash.com/photo-1758274525946-2d3a5be67b5d", alt: "A small group doing yoga together in a park", caption: "Yoga in the park", credit: "Vitaly Gariev" },
  { src: "https://images.unsplash.com/photo-1758519288551-e22d8425d512", alt: "Two colleagues laughing over coffee at a café", caption: "Coffee with colleagues", credit: "Vitaly Gariev" },
  { src: "https://images.unsplash.com/photo-1625463006115-09f08489f591", alt: "Two friends laughing at something on a phone outdoors", caption: "Old friends, new plans", credit: "Unsplash" },
] as const;

const tones = ["bg-wellness", "bg-meetup", "bg-career", "bg-travel"];

function Tile({ i, className, sizes }: { i: number; className: string; sizes: string }) {
  const p = PHOTOS[i];
  return (
    <figure className={`relative overflow-hidden rounded-[22px] ${tones[i]} ${className}`}>
      <Image src={`${p.src}?auto=format&fit=crop&q=70`} alt={p.alt} fill sizes={sizes} className="object-cover" priority={i === 0} />
      <figcaption className="absolute bottom-2.5 left-2.5 rounded-full bg-white/90 px-3 py-1 text-[12.5px] font-semibold text-ink backdrop-blur-sm">{p.caption}</figcaption>
    </figure>
  );
}

/** A photo collage for the empty space under the hero copy (desktop only; on phones the join card comes first). */
export function HeroPhotos() {
  return (
    <div className="hidden h-[340px] grid-cols-[1.25fr_1fr_1fr] grid-rows-2 gap-3 lg:grid">
      <Tile i={0} className="row-span-2" sizes="(min-width: 1024px) 260px, 0px" />
      <Tile i={1} className="" sizes="(min-width: 1024px) 200px, 0px" />
      <Tile i={3} className="row-span-2" sizes="(min-width: 1024px) 200px, 0px" />
      <Tile i={2} className="" sizes="(min-width: 1024px) 200px, 0px" />
    </div>
  );
}

