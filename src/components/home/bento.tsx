// "Everything in one place": the main things people do, as tiles of different sizes.
// The small previews are illustrations (fictional names and times), labelled as examples.
import Image from "next/image";
import Link from "next/link";
import { SPACE_TINT, SpaceIcon, SPACES } from "../landing";
import { HOME_PHOTOS } from "../home-photos";

const photo = (i: number) => HOME_PHOTOS[i];
const many = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;
const arrow = <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>;

function Tile({ className, children, href, label }: { className: string; children: React.ReactNode; href: string; label: string }) {
  return (
    <article className={`group relative flex flex-col overflow-hidden rounded-[28px] ${className}`}>
      {children}
      <Link href={href} className="absolute inset-0 rounded-[28px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <span className="sr-only">{label}</span>
      </Link>
    </article>
  );
}

export function Bento({ counts }: { counts: { professionals: number; homestays: number; facilities: number } }) {
  return (
    <section id="inside" aria-labelledby="inside-h" className="mx-auto max-w-[1280px] scroll-mt-6 px-4 pb-16 sm:px-8 sm:pb-24">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-[680px] flex-col gap-3">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">What&apos;s inside</p>
          <h2 id="inside-h" className="font-display text-[36px] leading-[1.04] font-extrabold tracking-[-0.03em] sm:text-[52px]">Everything for the life around work, in one place.</h2>
        </div>
        <p className="max-w-[340px] text-[15px] text-[#4a5650]">One free account. Every person, place and expert is checked by our team before they appear.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-6 lg:grid-cols-12 lg:auto-rows-[minmax(150px,auto)]">
        <Tile className="bg-white ring-1 ring-black/5 md:col-span-6 lg:col-span-7 lg:row-span-2" href="#join" label="Join Connect">
          <div className="flex flex-col gap-3 p-7 pb-0 sm:p-9 sm:pb-0">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">Connect</p>
            <h3 className="max-w-[460px] font-display text-[28px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[34px]">A feed about the life around work, not just the work.</h3>
            <p className="max-w-[460px] text-[15.5px] text-[#4a5650]">Share what keeps you going, ask people who&apos;ve been there, and turn a good idea into a Saturday walk.</p>
          </div>
          <div aria-hidden className="mt-7 flex flex-1 items-end gap-4 px-7 sm:px-9">
            <div className="w-[58%] rounded-t-[22px] bg-ground p-5 pb-6 shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.25)]">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-full bg-wellness text-[12px] font-bold text-wellness-ink">MI</span>
                <span className="flex flex-col leading-tight"><span className="text-[13.5px] font-bold">Meera Iyer</span><span className="text-[11.5px] text-muted">Mindfulness coach · Bengaluru</span></span>
              </div>
              <p className="mt-3 text-[13.5px] leading-snug">Trying a 5-minute breathing reset before stand-ups this week. Anyone want to compare notes on Friday?</p>
              <div className="mt-3 flex gap-4 text-[12px] font-semibold text-muted"><span>♥ 24</span><span>8 replies</span></div>
            </div>
            <div className="mb-6 flex w-[42%] flex-col gap-3">
              <div className="rounded-[18px] bg-meetup p-4 text-meetup-ink">
                <p className="text-[11px] font-bold uppercase">Sat · 7:00 am</p>
                <p className="mt-1 font-display text-[16px] font-bold leading-tight">Sunrise walk and chai</p>
                <p className="mt-1 text-[12px]">Cubbon Park · 12 going</p>
              </div>
              <div className="rounded-[18px] bg-travel p-4 text-travel-ink">
                <p className="text-[12.5px] font-semibold leading-snug">&ldquo;Quiet homestays in Coorg for a digital detox?&rdquo;</p>
                <p className="mt-1 text-[11.5px]">in Travel · 6 replies</p>
              </div>
            </div>
          </div>
        </Tile>

        <Tile className="bg-wellness text-wellness-ink md:col-span-3 lg:col-span-5" href="/professionals" label="Find wellness professionals">
          <div className="flex h-full flex-col gap-3 p-7">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em]">Book a session</p>
            <h3 className="font-display text-[24px] leading-tight font-extrabold tracking-[-0.02em] text-ink">Verified coaches, yoga teachers and nutritionists.</h3>
            <div aria-hidden className="flex flex-wrap gap-1.5">
              {["Tue 10:00", "10:30", "11:00", "Wed 9:00"].map((s, i) => (
                <span key={s} className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${i === 1 ? "bg-brand text-white" : "bg-white/80 text-ink"}`}>{s}</span>
              ))}
            </div>
            <span className="mt-auto flex items-center gap-1.5 text-[14px] font-bold">{counts.professionals > 0 ? many(counts.professionals, "verified professional", "verified professionals") : "Find professionals"} {arrow}</span>
          </div>
        </Tile>

        <Tile className="bg-meetup text-meetup-ink md:col-span-3 lg:col-span-5" href="#join" label="Join meet-ups">
          <div className="flex h-full items-start gap-5 p-7">
            <div aria-hidden className="flex w-16 shrink-0 flex-col items-center rounded-2xl bg-white py-2 leading-tight text-ink shadow-sm">
              <span className="text-[11px] font-bold uppercase">Sat</span>
              <span className="font-display text-[28px] font-extrabold">14</span>
              <span className="text-[11px] font-bold uppercase">Nov</span>
            </div>
            <div className="flex h-full flex-col gap-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em]">Meet-ups</p>
              <h3 className="font-display text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-ink">Walks, runs and chai circles near you.</h3>
              <span className="mt-auto flex items-center gap-1.5 text-[14px] font-bold">Plan one in your city {arrow}</span>
            </div>
          </div>
        </Tile>

        <Tile className="bg-travel text-travel-ink md:col-span-3 lg:col-span-4" href="/homestays" label="Browse homestays">
          <div className="relative h-44 bg-travel">
            <Image src={`${photo(9).src}?auto=format&fit=crop&w=900&q=80`} alt="" fill sizes="(min-width:1024px) 400px, 50vw" className="object-cover" />
          </div>
          <div className="flex flex-col gap-1.5 p-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em]">Homestays</p>
            <h3 className="font-display text-[21px] leading-tight font-extrabold text-ink">Quiet breaks, workcations and team retreats.</h3>
            <span className="mt-1 flex items-center gap-1.5 text-[14px] font-bold">{counts.homestays > 0 ? many(counts.homestays, "verified homestay", "verified homestays") : "Find a homestay"} {arrow}</span>
          </div>
        </Tile>

        <Tile className="bg-move text-move-ink md:col-span-3 lg:col-span-4" href="/facilities" label="Browse gyms and studios">
          <div className="relative h-44 bg-move">
            <Image src={`${photo(1).src}?auto=format&fit=crop&w=900&q=80`} alt="" fill sizes="(min-width:1024px) 400px, 50vw" className="object-cover" />
          </div>
          <div className="flex flex-col gap-1.5 p-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em]">Gyms &amp; studios</p>
            <h3 className="font-display text-[21px] leading-tight font-extrabold text-ink">Gyms, yoga and pilates studios, pools and spas.</h3>
            <span className="mt-1 flex items-center gap-1.5 text-[14px] font-bold">{counts.facilities > 0 ? many(counts.facilities, "verified place", "verified places") : "Find a place to move"} {arrow}</span>
          </div>
        </Tile>

        <Tile className="bg-white ring-1 ring-black/5 md:col-span-6 lg:col-span-4" href="#join" label="Join spaces">
          <div id="spaces" className="flex h-full scroll-mt-6 flex-col gap-4 p-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">Spaces</p>
            <h3 className="font-display text-[21px] leading-tight font-extrabold">Join the topics you care about.</h3>
            <ul className="flex flex-wrap gap-2">
              {SPACES.map((s) => (
                <li key={s.key} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${SPACE_TINT[s.key]}`}>
                  <SpaceIcon k={s.key} className="size-4" />
                  {s.name}
                </li>
              ))}
            </ul>
          </div>
        </Tile>
      </div>
      <p className="mt-4 text-[12.5px] text-muted">Previews are examples. Photos: Unsplash.</p>
    </section>
  );
}
