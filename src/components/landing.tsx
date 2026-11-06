// Public landing page pieces. Sample posts are illustrations of what Connect
// looks like (fictional people, no counts), not real activity.
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { BrandLockup } from "./brand-mark";

export type SpaceKey = "wellness" | "travel" | "meetup" | "move" | "food" | "career";

export const SPACES: { key: SpaceKey; name: string; line: string; prompt: string }[] = [
  { key: "wellness", name: "Wellness & mindfulness", line: "Breathwork, sleep, stress and the small habits that actually stick.", prompt: "What's your 5-minute reset between meetings?" },
  { key: "travel", name: "Travel", line: "Retreats, slow weekends and work trips that leave you rested.", prompt: "Quiet homestays in Coorg for a digital detox?" },
  { key: "meetup", name: "Meet-ups", line: "Sunrise walks, run clubs and chai circles in your city.", prompt: "Saturday 7 am walk at Cubbon Park. Who's in?" },
  { key: "move", name: "Fitness & movement", line: "Desk yoga, strength, cycling and getting back into sport.", prompt: "Best stretches after a long day at the laptop?" },
  { key: "food", name: "Food & nutrition", line: "Lunchbox ideas, mindful eating and recipes worth sharing.", prompt: "High-protein vegetarian lunches that travel well?" },
  { key: "career", name: "Careers & mentoring", line: "Burnout, boundaries, growth and finding a mentor.", prompt: "How do you say no to a meeting without guilt?" },
];

export const SPACE_TINT: Record<SpaceKey, string> = {
  wellness: "bg-wellness text-wellness-ink",
  travel: "bg-travel text-travel-ink",
  meetup: "bg-meetup text-meetup-ink",
  move: "bg-move text-move-ink",
  food: "bg-food text-food-ink",
  career: "bg-career text-career-ink",
};
const tint: Record<SpaceKey, string> = {
  wellness: "bg-wellness text-wellness-ink",
  travel: "bg-travel text-travel-ink",
  meetup: "bg-meetup text-meetup-ink",
  move: "bg-move text-move-ink",
  food: "bg-food text-food-ink",
  career: "bg-career text-career-ink",
};

export function SpaceIcon({ k, className = "size-5" }: { k: SpaceKey; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {k === "wellness" && <path {...p} d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14m0 0 7-7" />}
      {k === "travel" && <path {...p} d="M3 14l18-7-6 13-3-6-6-1-3 1Zm9 0 9-7" />}
      {k === "meetup" && (
        <>
          <circle {...p} cx="8" cy="9" r="3" />
          <circle {...p} cx="16" cy="9" r="3" />
          <path {...p} d="M3 19c.8-3 2.7-4.5 5-4.5s4.2 1.5 5 4.5m-2 0c.8-3 2.7-4.5 5-4.5s4.2 1.5 5 4.5" />
        </>
      )}
      {k === "move" && <path {...p} d="M6 8v8M3 10v4m15-6v8m3-6v4M6 12h12" />}
      {k === "food" && <path {...p} d="M4 12h16a8 8 0 0 1-16 0Zm4-4c0-2 2-2 2-4m4 4c0-2 2-2 2-4" />}
      {k === "career" && <path {...p} d="M4 19V9l8-5 8 5v10M9 19v-6h6v6M4 19h16" />}
    </svg>
  );
}

export function SpaceTag({ k }: { k: SpaceKey }) {
  const s = SPACES.find((x) => x.key === k)!;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${tint[k]}`}>
      <SpaceIcon k={k} className="size-3.5" />
      {s.name}
    </span>
  );
}

export function LandingHeader({ home = true, signedIn = false }: { home?: boolean; signedIn?: boolean }) {
  const link = "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-ink hover:bg-white";
  return (
    <header className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-8">
      <Link href="/" aria-label={`${BRAND.name}, ${BRAND.tagline}`} className="flex items-center">
        <BrandLockup size="md" name={BRAND.name} tag={BRAND.tagline} />
      </Link>
      <nav aria-label="Explore" className="order-last flex w-full gap-1 overflow-x-auto text-sm font-semibold md:order-none md:w-auto">
        <Link href="/professionals" className={link}>Find professionals</Link>
        <a href={home ? "#inside" : "/#inside"} className={link}>Explore</a>
        <a href={home ? "#spaces" : "/#spaces"} className={link}>Spaces</a>
        <a href={home ? "#more" : "/#more"} className={link}>For organisations</a>
      </nav>
      <nav aria-label="Account" className="flex items-center gap-2 text-sm font-semibold">
        {signedIn ? (
          <Link href="/app" className="rounded-full bg-ink px-4 py-2.5 text-white hover:bg-brand-dark">Open {BRAND.name}</Link>
        ) : (
          <>
            <Link href={home ? "#signin" : "/sign-in"} className="rounded-lg px-3 py-2 text-ink hover:bg-white">Sign in</Link>
            <Link href={home ? "#join" : "/sign-up"} className="rounded-full bg-ink px-4 py-2.5 text-white hover:bg-brand-dark">Join free</Link>
          </>
        )}
      </nav>
    </header>
  );
}
