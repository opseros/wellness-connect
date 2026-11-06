// A slow strip of everyday moments under the hero. Still for people who prefer reduced motion.
const ITEMS = ["Desk yoga", "Sunrise walks", "Chai circles", "Workcations", "Pilates after work", "Run clubs", "Nutrition chats", "Team retreats", "Career mentoring", "Quiet weekends"];
const DOTS = ["text-[#0f6b5c]", "text-[#e0a32e]", "text-[#b3487f]", "text-[#1d4f7a]"];

export function Marquee() {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-8 pr-8">
      {ITEMS.map((t, i) => (
        <li key={t} className="flex items-center gap-8 whitespace-nowrap font-display text-[26px] font-bold tracking-[-0.02em] text-ink/80 sm:text-[32px]">
          {t}
          <span aria-hidden className={`text-[18px] ${DOTS[i % DOTS.length]}`}>●</span>
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Things people do on the network" className="overflow-hidden py-8 sm:py-10">
      <div className="flex w-max motion-safe:animate-[marquee_45s_linear_infinite]">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}
