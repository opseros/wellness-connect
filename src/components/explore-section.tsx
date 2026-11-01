"use client";
// Home page "Explore": one section, three tabs (wellness professionals, homestays,
// gyms and studios) in the same layout, so each gets the same space.
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

type Tile = { href: string; label: string; line: string; tone: string; d: string };
type Tab = {
  key: string;
  tab: string;
  eyebrow: string;
  eyebrowTone: string;
  title: string;
  body: string;
  photo: { src: string; alt: string };
  photoTone: string;
  points: string[];
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  tiles: Tile[];
};

const T = {
  wellness: "bg-wellness text-wellness-ink",
  travel: "bg-travel text-travel-ink",
  meetup: "bg-meetup text-meetup-ink",
  move: "bg-move text-move-ink",
  food: "bg-food text-food-ink",
  career: "bg-career text-career-ink",
};

const ICON = {
  leaf: "M5 19c0-8 5-13 14-14 0 9-5 14-13 14m0 0 7-7",
  calm: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-3.5-6.5s1.2 1.5 3.5 1.5 3.5-1.5 3.5-1.5M9 10h.01M15 10h.01",
  bowl: "M4 12h16a8 8 0 0 1-16 0Zm4-4c0-2 2-2 2-4m4 4c0-2 2-2 2-4",
  desk: "M4 10h16M6 10v9m12-9v9M9 6h6l1 4H8l1-4Z",
  coach: "M4 19V9l8-5 8 5v10M9 19v-6h6v6M4 19h16",
  people: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 19c.8-3 2.7-4.5 5-4.5s4.2 1.5 5 4.5m-2 0c.8-3 2.7-4.5 5-4.5s4.2 1.5 5 4.5",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  team: "M3 20v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm-1 3h1a4 4 0 0 1 4 4v2",
  wifi: "M3 9.5a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0m-9 3.5a4 4 0 0 1 6 0M12 20h.01",
  access: "M12 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM9 8h5l-1 5h4l2 6M12 8l-1 5m-1.5 2A4 4 0 1 0 14 20",
  care: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  gym: "M6 8v8M3 10v4m15-6v8m3-6v4M6 12h12",
  yoga: "M12 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 10l7-1 7 1M12 9v5l-4 6m4-6 4 6",
  pilates: "M3 17h18M5 17v-4h14v4M8 13V9a4 4 0 0 1 8 0v4",
  swim: "M3 16c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0M3 20c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0M8 13V5a2 2 0 0 1 4 0m-4 4h6",
  spa: "M12 20c-4 0-7-2.5-7-6 2.5 0 5 1.2 7 3.5C14 15.2 16.5 14 19 14c0 3.5-3 6-7 6Zm0-2.5C10 14 10 10 12 6c2 4 2 8 0 11.5Z",
  centre: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Zm-3-9h6m-3-3v6",
};

const join = (as: string) => `/sign-up?next=${encodeURIComponent(`/app/onboarding?as=${as}`)}`;

function tabs(counts: { professionals: number; homestays: number; facilities: number }): Tab[] {
  const browse = (n: number, noun: string, fallback: string) => (n > 0 ? `Browse ${n} verified ${noun}` : fallback);
  return [
    {
      key: "pros",
      tab: "Wellness professionals",
      eyebrow: "Coaches, nutritionists and therapists",
      eyebrowTone: "text-wellness-ink",
      title: "Learn from experts whose credentials we've checked.",
      body: "Yoga teachers, nutritionists, physiotherapists, coaches and therapists for you or your team, in person or online, with prices in rupees.",
      photo: { src: "https://images.unsplash.com/photo-1758274525946-2d3a5be67b5d", alt: "An instructor leading a small yoga group in a park" },
      photoTone: "bg-wellness",
      points: ["Verified credentials", "In person or online", "Workshops and programmes for teams"],
      primary: { label: browse(counts.professionals, counts.professionals === 1 ? "professional" : "professionals", "Find professionals"), href: "/professionals" },
      secondary: { label: "Are you a professional? Join free →", href: join("pro") },
      tiles: [
        { href: "/professionals?category=yoga-mindfulness", label: "Yoga & mindfulness", line: "Classes, breathwork, meditation", tone: T.wellness, d: ICON.leaf },
        { href: "/professionals?category=stress-resilience", label: "Stress & resilience", line: "Burnout, sleep and balance", tone: T.travel, d: ICON.calm },
        { href: "/professionals?category=corporate-nutrition", label: "Nutrition", line: "Eating well at work", tone: T.food, d: ICON.bowl },
        { href: "/professionals?category=workplace-ergonomics", label: "Ergonomics", line: "Desks, posture and physio", tone: T.move, d: ICON.desk },
        { href: "/professionals?category=executive-coaching", label: "Coaching", line: "Leadership and career growth", tone: T.career, d: ICON.coach },
        { href: "/professionals", label: "All professionals", line: "Search by city or speciality", tone: T.meetup, d: ICON.people },
      ],
    },
    {
      key: "homestays",
      tab: "Homestays",
      eyebrow: "Stays for rest, recovery and retreats",
      eyebrowTone: "text-travel-ink",
      title: "Take a proper break somewhere quiet.",
      body: "Verified homestays for a long weekend, a slow recovery or a small team retreat. Request the dates; you pay only once the host accepts.",
      photo: { src: "https://images.unsplash.com/photo-1625721838087-c46e51c89558", alt: "Coconut palms beside calm backwaters in Kerala" },
      photoTone: "bg-travel",
      points: ["Hosts verified by our team", "Pay after the host accepts", "Clear cancellation rules"],
      primary: { label: browse(counts.homestays, counts.homestays === 1 ? "homestay" : "homestays", "Find a homestay"), href: "/homestays" },
      secondary: { label: "Host guests? List your homestay →", href: join("homestay") },
      tiles: [
        { href: "/homestays?feature=quiet_hours", label: "Quiet breaks", line: "Switch off and sleep well", tone: T.travel, d: ICON.moon },
        { href: "/homestays?feature=meeting_space", label: "Team retreats", line: "Space for sessions together", tone: T.career, d: ICON.team },
        { href: "/homestays?feature=wifi_workspace", label: "Workcations", line: "Wi-Fi and a proper desk", tone: T.meetup, d: ICON.wifi },
        { href: "/homestays?feature=step_free", label: "Easy access", line: "Step-free, ground-floor rooms", tone: T.wellness, d: ICON.access },
        { href: "/homestays?feature=diet_kitchen", label: "Special diets", line: "A kitchen for your meals", tone: T.food, d: ICON.bowl },
        { href: "/homestays?feature=caregiver_room", label: "With family", line: "Room for a companion", tone: T.move, d: ICON.care },
      ],
    },
    {
      key: "gyms",
      tab: "Gyms & studios",
      eyebrow: "Gyms, studios and wellness centres",
      eyebrowTone: "text-move-ink",
      title: "Find a place to move, stretch and recharge.",
      body: "Verified gyms, yoga and pilates studios, pools, spas and wellness centres near your home or office, with prices and timings up front.",
      photo: { src: "https://images.unsplash.com/photo-1517130038641-a774d04afb3c", alt: "A group working out together in a gym" },
      photoTone: "bg-move",
      points: ["Free trials marked", "Women-only batches", "Corporate memberships"],
      primary: { label: browse(counts.facilities, counts.facilities === 1 ? "place" : "places", "Browse gyms and studios"), href: "/facilities" },
      secondary: { label: "Run a gym or studio? List it free →", href: join("facility") },
      tiles: [
        { href: "/facilities?type=gym", label: "Gyms", line: "Strength, cardio and trainers", tone: T.move, d: ICON.gym },
        { href: "/facilities?type=yoga", label: "Yoga studios", line: "Hatha, vinyasa and breathwork", tone: T.wellness, d: ICON.yoga },
        { href: "/facilities?type=pilates", label: "Pilates", line: "Mat and reformer classes", tone: T.career, d: ICON.pilates },
        { href: "/facilities?type=swimming", label: "Swimming pools", line: "Laps, lessons and aqua fitness", tone: T.travel, d: ICON.swim },
        { href: "/facilities?type=spa", label: "Spas", line: "Massage, steam and recovery", tone: T.food, d: ICON.spa },
        { href: "/facilities?type=wellness_centre", label: "Wellness centres", line: "Ayurveda, physio and holistic care", tone: T.meetup, d: ICON.centre },
      ],
    },
  ];
}

/** Three equal tabs; every panel is in the page (hidden ones use `hidden`), so all of it is linkable and indexable. */
export function ExploreSection({ counts }: { counts: { professionals: number; homestays: number; facilities: number } }) {
  const all = tabs(counts);
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const go = (i: number) => {
    const n = (i + all.length) % all.length;
    setActive(n);
    refs.current[n]?.focus();
  };

  return (
    <section id="explore" aria-labelledby="explore-h" className="scroll-mt-6 border-t border-line">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-col gap-5">
          <div className="flex max-w-[640px] flex-col gap-3">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">Explore</p>
            <h2 id="explore-h" className="font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px]">Everything for a better working life, checked by our team.</h2>
          </div>
          <div role="tablist" aria-label="Explore" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {all.map((t, i) => (
              <button
                key={t.key}
                ref={(el) => { refs.current[i] = el; }}
                role="tab"
                id={`explore-tab-${t.key}`}
                aria-controls={`explore-panel-${t.key}`}
                aria-selected={i === active}
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") go(i + 1);
                  if (e.key === "ArrowLeft") go(i - 1);
                }}
                className={`shrink-0 whitespace-nowrap rounded-full px-5 py-2.5 text-[15px] font-semibold transition-colors ${i === active ? "bg-ink text-white" : "bg-white text-[#3d4842] ring-1 ring-line hover:ring-ink"}`}
              >
                {t.tab}
              </button>
            ))}
          </div>
        </div>

        {all.map((t, i) => (
          <div key={t.key} role="tabpanel" id={`explore-panel-${t.key}`} aria-labelledby={`explore-tab-${t.key}`} hidden={i !== active} className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <p className={`text-[13px] font-bold uppercase tracking-[0.12em] ${t.eyebrowTone}`}>{t.eyebrow}</p>
                <h3 className="font-display text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em] sm:text-[34px]">{t.title}</h3>
                <p className="max-w-[520px] text-[17px] leading-relaxed text-[#3d4842]">{t.body}</p>
              </div>
              <div className={`relative hidden aspect-[16/9] overflow-hidden rounded-[24px] sm:block ${t.photoTone}`}>
                <Image src={`${t.photo.src}?auto=format&fit=crop&w=1600&q=85`} alt={t.photo.alt} fill quality={90} sizes="(min-width: 1024px) 540px, 90vw" className="object-cover" />
              </div>
              <ul className="flex flex-wrap gap-2 text-[14px] font-semibold">
                {t.points.map((p) => (
                  <li key={p} className="flex items-center gap-2 rounded-full bg-white px-3.5 py-2 ring-1 ring-line">
                    <svg aria-hidden viewBox="0 0 24 24" className={`size-4 ${t.eyebrowTone}`} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    {p}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link href={t.primary.href} className="btn bg-ink px-6 text-white hover:bg-brand-dark">{t.primary.label}</Link>
                <Link href={t.secondary.href} className="text-[15px] font-semibold text-brand underline-offset-4 hover:underline">{t.secondary.label}</Link>
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {t.tiles.map((x) => (
                <li key={x.label}>
                  <Link href={x.href} className={`group flex h-full flex-col gap-3 rounded-[22px] p-5 transition-transform hover:-translate-y-0.5 ${x.tone}`}>
                    <span className="grid size-11 place-items-center rounded-2xl bg-white/75">
                      <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={x.d} /></svg>
                    </span>
                    <span className="font-display text-[19px] font-bold leading-tight">{x.label}</span>
                    <span className="text-[13.5px] leading-snug opacity-90">{x.line}</span>
                    <span className="mt-auto text-[13px] font-semibold underline-offset-4 group-hover:underline">Explore →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
