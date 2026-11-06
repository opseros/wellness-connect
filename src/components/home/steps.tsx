// Getting started, in three steps.
const STEPS = [
  { n: "01", t: "Join free", d: "Sign up with Google, Microsoft or your email. Your profile takes a minute.", tone: "text-[#0f6b5c]" },
  { n: "02", t: "Find your people", d: "Pick spaces, follow topics and connect with colleagues and peers in your city.", tone: "text-[#c98a1d]" },
  { n: "03", t: "Show up", d: "Go to a meet-up, book a session with a verified expert, or take a proper break.", tone: "text-[#b3487f]" },
];

export function Steps() {
  return (
    <section aria-labelledby="steps-h" className="mx-auto max-w-[1280px] px-4 py-16 sm:px-8 sm:py-24">
      <h2 id="steps-h" className="mb-10 max-w-[640px] font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[48px]">Get started in three steps.</h2>
      <ol className="grid gap-5 md:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className="flex flex-col gap-3 border-t-2 border-ink pt-6">
            <span aria-hidden className={`font-display text-[56px] leading-none font-extrabold tracking-[-0.04em] ${s.tone}`}>{s.n}</span>
            <span className="text-[21px] font-bold">{s.t}</span>
            <span className="text-[15.5px] leading-relaxed text-[#4a5650]">{s.d}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
