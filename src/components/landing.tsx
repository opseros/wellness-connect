// Public landing page pieces. Sample posts are illustrations of what Connect
// looks like (fictional people, no counts), not real activity.
import Link from "next/link";
import { BRAND } from "@/lib/brand";

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

function Avatar({ initials, tone }: { initials: string; tone: SpaceKey }) {
  return <span className={`grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-bold ${tint[tone]}`} aria-hidden>{initials}</span>;
}

/** The hero's memorable element: a hand of Connect posts dealt onto the page. */
export function FeedCollage() {
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3 sm:relative sm:block sm:h-[460px]" role="img" aria-label="Examples of posts in Connect: a mindfulness tip, a Saturday walk meet-up and a travel question">
      <article className="deal w-full rounded-[22px] sm:absolute sm:top-0 sm:left-0 border border-line bg-white p-4 shadow-[0_18px_40px_-24px_rgba(15,107,92,0.45)] sm:w-[78%]" style={{ ["--tilt" as string]: "-2.5deg", ["--delay" as string]: "80ms" }}>
        <div className="flex items-center gap-3">
          <Avatar initials="MI" tone="wellness" />
          <div className="min-w-0">
            <p className="text-[14px] font-bold">Meera Iyer</p>
            <p className="text-[12px] text-muted">Mindfulness coach, Bengaluru</p>
          </div>
        </div>
        <p className="mt-3 text-[14.5px] leading-relaxed">Trying a 5-minute breathing reset before stand-ups this week. Anyone want to try it with me and compare notes on Friday?</p>
        <div className="mt-3 flex items-center justify-between">
          <SpaceTag k="wellness" />
          <span className="text-[12px] font-semibold text-muted">Like · Reply</span>
        </div>
      </article>

      <article className="deal ml-auto w-[92%] overflow-hidden sm:absolute sm:top-[150px] sm:right-0 sm:ml-0 rounded-[22px] border border-line bg-white shadow-[0_18px_40px_-24px_rgba(107,67,0,0.5)] sm:w-[64%]" style={{ ["--tilt" as string]: "2deg", ["--delay" as string]: "220ms" }}>
        <div className="flex gap-3 bg-meetup p-4 text-meetup-ink">
          <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-white py-1.5 leading-none">
            <span className="text-[11px] font-semibold">Sat</span>
            <span className="font-display text-[22px] font-extrabold">14</span>
          </div>
          <div>
            <p className="font-display text-[17px] font-bold leading-tight">Sunrise walk and chai</p>
            <p className="mt-1 text-[12.5px]">7:00 am, Cubbon Park, Bengaluru</p>
          </div>
        </div>
        <div className="flex items-center justify-between p-3.5">
          <span className="flex -space-x-2">
            {(["AR", "KM", "SN"] as const).map((i, n) => (
              <span key={i} className={`grid size-7 place-items-center rounded-full border-2 border-white text-[10px] font-bold ${[tint.travel, tint.career, tint.move][n]}`}>{i}</span>
            ))}
          </span>
          <span className="rounded-full bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-white">I&apos;m going</span>
        </div>
      </article>

      <article className="deal w-[96%] rounded-[22px] sm:absolute sm:bottom-0 sm:left-[6%] border border-line bg-white p-4 shadow-[0_18px_40px_-24px_rgba(29,79,122,0.5)] sm:w-[70%]" style={{ ["--tilt" as string]: "-1deg", ["--delay" as string]: "360ms" }}>
        <div className="flex items-center gap-3">
          <Avatar initials="FS" tone="travel" />
          <div className="min-w-0">
            <p className="text-[14px] font-bold">Farah Siddiqui</p>
            <p className="text-[12px] text-muted">Product designer, Pune</p>
          </div>
        </div>
        <p className="mt-3 text-[14.5px] leading-relaxed">Taking my first proper break in a year. Quiet homestays in Coorg with no Wi-Fi guilt?</p>
        <div className="mt-3 flex items-center justify-between">
          <SpaceTag k="travel" />
          <span className="text-[12px] font-semibold text-muted">6 replies</span>
        </div>
      </article>
    </div>
  );
}

export function LandingHeader({ home = true, signedIn = false }: { home?: boolean; signedIn?: boolean }) {
  const link = "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-ink hover:bg-white";
  return (
    <header className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-8">
      <Link href="/" aria-label={`${BRAND.name}, ${BRAND.tagline}`} className="flex items-center gap-2.5">
        <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-brand font-display text-[19px] font-extrabold text-white">{BRAND.name[0]}</span>
        <span aria-hidden className="flex flex-col leading-none">
          <span className="font-display text-[20px] font-extrabold tracking-tight">{BRAND.name}</span>
          <span className="mt-1 text-[11px] font-semibold text-muted">{BRAND.tagline}</span>
        </span>
      </Link>
      <nav aria-label="Explore" className="order-last flex w-full gap-1 overflow-x-auto text-sm font-semibold md:order-none md:w-auto">
        <Link href="/professionals" className={link}>Find professionals</Link>
        <Link href="/facilities" className={link}>Gyms &amp; studios</Link>
        <a href={home ? "#spaces" : "/#spaces"} className={link}>Spaces</a>
        <a href={home ? "#more" : "/#more"} className={link}>For organisations</a>
      </nav>
      <nav aria-label="Account" className="flex items-center gap-2 text-sm font-semibold">
        {signedIn ? (
          <Link href="/app" className="rounded-full bg-ink px-4 py-2.5 text-white hover:bg-brand-dark">Open {BRAND.name}</Link>
        ) : (
          <>
            <Link href="/sign-in" className="rounded-lg px-3 py-2 text-ink hover:bg-white">Sign in</Link>
            <Link href={home ? "#join" : "/sign-up"} className="rounded-full bg-ink px-4 py-2.5 text-white hover:bg-brand-dark">Join free</Link>
          </>
        )}
      </nav>
    </header>
  );
}
