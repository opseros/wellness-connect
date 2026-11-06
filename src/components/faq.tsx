// Home page FAQ: short, honest answers. Native <details> so it works without JavaScript.
import { BRAND } from "@/lib/brand";

const QA = (name: string) => [
  {
    q: `Is ${name} free?`,
    a: "Yes. Joining, your profile, Connect, spaces and meet-ups are free for everyone. Wellness professionals and homestay hosts pay a commission only when they're booked; listing a gym or studio is free.",
  },
  {
    q: "Who checks the professionals and places?",
    a: "Our team does, before anything appears. Professionals show us their certificates and get a verified badge. Homestays and gyms show us their business registration, the owner's ID and real photos.",
  },
  {
    q: "Do you ask about my health?",
    a: "No. Connect is for everyday wellbeing, not medical advice. We never ask for health details, and we ask you not to put them in posts, notes or messages.",
  },
  {
    q: "How do bookings work?",
    a: "Pick a professional's free time and send a request; they accept or decline within a day. Homestays work the same way: request your dates and pay once the host accepts, online through Razorpay with a GST invoice.",
  },
  {
    q: "Can my company join?",
    a: "Yes. Set up your company with the same account, post what your teams need, compare proposals from verified professionals and pay online with GST invoices. A work email links colleagues to the company automatically.",
  },
  {
    q: "Can I cancel?",
    a: "Sessions can be cancelled by either side before they start. Homestay stays follow the cancellation policy shown before you book, and refunds go back to the way you paid.",
  },
];

export function Faq() {
  const items = QA(BRAND.name);
  return (
    <section id="faq" aria-labelledby="faq-h" className="mx-auto grid max-w-[1200px] scroll-mt-6 gap-10 px-4 pt-16 sm:px-8 sm:pt-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">Questions</p>
        <h2 id="faq-h" className="font-display text-[34px] leading-[1.08] font-extrabold tracking-[-0.02em] sm:text-[44px]">Good to know before you join.</h2>
        <p className="max-w-[420px] text-[16px] leading-relaxed text-[#3d4842]">The short answers to what people ask us most.</p>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((x) => (
          <details key={x.q} className="group rounded-[20px] bg-white ring-1 ring-line open:ring-brand/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[16px] font-bold [&::-webkit-details-marker]:hidden">
              {x.q}
              <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 text-muted transition-transform group-open:rotate-45" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </summary>
            <p className="px-5 pb-5 text-[15px] leading-relaxed text-[#3d4842]">{x.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
