// A slow strip of everyday moments under the hero. Still for people who prefer reduced motion.
const ITEMS = ["Desk yoga", "Sunrise walks", "Chai circles", "Workcations", "Pilates after work", "Run clubs", "Nutrition chats", "Team retreats", "Career mentoring", "Quiet weekends"];
const DOTS = ["text-[#0f6b5c]", "text-[#e0a32e]", "text-[#b3487f]", "text-[#1d4f7a]"];

export function Marquee() {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-6 pr-6">
      {ITEMS.map((t, i) => (
        <li key={t} className="flex items-center gap-6 whitespace-nowrap font-display text-[20px] font-bold tracking-[-0.02em] text-ink/80 sm:text-[24px]">
          {t}
          <span aria-hidden className={`text-[13px] ${DOTS[i % DOTS.length]}`}>●</span>
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Things people do on the network" className="overflow-hidden py-4 sm:py-5">
      <div className="flex w-max motion-safe:animate-[marquee_45s_linear_infinite]">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}
