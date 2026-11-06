import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { BUDDY_ACTIVITIES, BUDDY_PACES, BUDDY_TIMES } from "@/db/schema";
import { BUDDY_ACTIVITY_LABEL, BUDDY_PACE_LABEL, BUDDY_TIME_LABEL, MAX_OPEN_BUDDY_REQUESTS, buddyDefaults, buddyOverview } from "@/modules/connect/social";
import { answerBuddyAction, closeBuddyAction, requestBuddyAction } from "../../actions";
import { Avatar, Flash } from "../../ui";

export const metadata: Metadata = { title: "Find a buddy" };

// Simple line pictograms (24×24, stroke). Heads are small circles.
const head = (x: number, y: number) => `M${x + 2} ${y}a2 2 0 1 1-4 0a2 2 0 1 1 4 0`;
const ICON: Record<(typeof BUDDY_ACTIVITIES)[number], string> = {
  walk: `${head(13, 4)}M10 21l2-6 3 2v4M9 13l1.5-5 3.5 1 2.5 3M7 21l3-8`,
  run: `${head(15, 4)}M6 20l3-5 4 2 1 4M9 15l2-6 4 2 4 1M5 11l4-3`,
  gym: "M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12",
  yoga: `${head(12, 4)}M4 20h16M12 8v5M6 10l6 3 6-3M8 20l4-7 4 7`,
  meditation: `${head(12, 5)}M4 18c3-.5 5-2.5 8-2.5s5 2 8 2.5M7 14c1.5-2 3-3 5-3s3.5 1 5 3`,
  cycling: "M8 17a3 3 0 1 1-6 0a3 3 0 1 1 6 0M22 17a3 3 0 1 1-6 0a3 3 0 1 1 6 0M5 17l4-7h6l4 7M9 10l-1.5-3H11",
  sports: "M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  swim: `${head(17, 7)}M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M6 14l5-4 3 3`,
};

function ActivityIcon({ a, className = "size-5" }: { a: (typeof BUDDY_ACTIVITIES)[number]; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON[a]} />
    </svg>
  );
}

export default async function BuddiesPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; a?: string }> }) {
  const me = (await getCurrentUser())!;
  const sp = await searchParams;
  const [{ requests, matches }, defaults] = await Promise.all([buddyOverview(me.id), buddyDefaults(me.id)]);
  const toAnswer = matches.filter((m) => m.status === "proposed" && !m.myAnswer);
  const waiting = matches.filter((m) => m.waiting);
  const matched = matches.filter((m) => m.status === "matched");
  const preset = (BUDDY_ACTIVITIES as readonly string[]).includes(sp.a ?? "") ? (sp.a as (typeof BUDDY_ACTIVITIES)[number]) : "walk";
  const full = requests.length >= MAX_OPEN_BUDDY_REQUESTS;

  return (
    <main className="flex flex-col gap-5">
      <header className="relative overflow-hidden rounded-[24px] bg-[#0f1f1a] px-6 py-7 text-[#f4efe6] sm:px-8">
        <svg aria-hidden viewBox="0 0 64 64" className="pointer-events-none absolute -right-10 -bottom-16 size-[260px] opacity-[0.14]">
          <path d="M31 54 C13 47 8 27 14 9 C29 15 36 34 31 54 Z" fill="#3fb39b" />
          <path d="M33 54 C51 47 56 27 50 9 C35 15 28 34 33 54 Z" fill="#a8e0d3" />
        </svg>
        <p className="text-[12.5px] font-bold uppercase tracking-[0.16em] text-[#a8e0d3]">Buddy match</p>
        <h1 className="mt-1.5 max-w-[520px] font-display text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[36px]">Habits stick better with someone beside you.</h1>
        <p className="mt-2 max-w-[540px] text-[15px] leading-relaxed text-[#f4efe6]/75">
          Tell us what you&apos;d like to do, where and when. We suggest people looking for the same. You both say yes before you&apos;re introduced; a no is never shown.
        </p>
      </header>

      <Flash msg={sp.msg} error={sp.error} />

      {toAnswer.length > 0 && (
        <section aria-labelledby="new-h" className="flex flex-col gap-3">
          <h2 id="new-h" className="font-display text-[20px] font-bold">New suggestions · {toAnswer.length}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {toAnswer.map((m) => (
              <li key={m.id} className="card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={m.firstName} size={44} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-bold">{m.firstName}</span>
                    <span className="truncate text-[13px] text-muted">{m.headline || "Member"}</span>
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-move px-2.5 py-1 text-[12.5px] font-semibold text-move-ink">
                    <ActivityIcon a={m.activity} className="size-4" />
                    {BUDDY_ACTIVITY_LABEL[m.activity]}
                  </span>
                </div>
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
                  <div className="flex gap-1.5"><dt className="text-muted">You both like</dt><dd className="font-semibold">{m.sharedTimes.map((t) => BUDDY_TIME_LABEL[t as keyof typeof BUDDY_TIME_LABEL]).join(", ") || "Flexible"}</dd></div>
                  {m.pace && <div className="flex gap-1.5"><dt className="text-muted">Pace</dt><dd className="font-semibold">{BUDDY_PACE_LABEL[m.pace]}</dd></div>}
                </dl>
                {m.note && <p className="rounded-xl bg-ground px-3 py-2 text-[14px]">&ldquo;{m.note}&rdquo;</p>}
                <form action={answerBuddyAction} className="mt-auto flex gap-2">
                  <input type="hidden" name="matchId" value={m.id} />
                  <button name="answer" value="yes" className="btn-primary flex-1 rounded-full">Yes, introduce us</button>
                  <button name="answer" value="no" className="btn-outline rounded-full px-4">Not now</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {matched.length > 0 && (
        <section aria-labelledby="matched-h" className="card flex flex-col gap-3 p-5">
          <h2 id="matched-h" className="font-display text-[20px] font-bold">Your buddies</h2>
          <ul className="flex flex-col divide-y divide-line">
            {matched.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={m.firstName} size={40} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/connect/members/${m.otherId}`} className="font-bold hover:underline">{m.firstName}</Link>
                  <span className="text-[13px] text-muted">{BUDDY_ACTIVITY_LABEL[m.activity]} · {m.sharedTimes.map((t) => BUDDY_TIME_LABEL[t as keyof typeof BUDDY_TIME_LABEL]).join(", ")}</span>
                </span>
                <Link href={`/connect/members/${m.otherId}`} className="btn-primary min-h-10 rounded-full px-4 text-sm">Message to plan</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <section aria-labelledby="ask-h" className="card flex min-w-0 flex-[999_1_420px] flex-col gap-5 p-5 sm:p-6">
          <div>
            <h2 id="ask-h" className="font-display text-[20px] font-bold">Find a buddy</h2>
            <p className="text-[14px] text-muted">Asking again for the same activity updates your request.</p>
          </div>
          {full ? (
            <p className="rounded-xl bg-ground px-4 py-3 text-[14px]">You&apos;re looking for buddies for {MAX_OPEN_BUDDY_REQUESTS} activities, the most at once. Stop one to add another.</p>
          ) : (
            <form action={requestBuddyAction} className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="label mb-2">Activity</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {BUDDY_ACTIVITIES.map((a) => (
                    <label key={a} className="flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-white px-2.5 text-[14px] font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand-dark has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
                      <input type="radio" name="activity" value={a} defaultChecked={a === preset} className="sr-only" />
                      <ActivityIcon a={a} className="size-5 shrink-0" />
                      {BUDDY_ACTIVITY_LABEL[a]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="label mb-2">When suits you</legend>
                <div className="flex flex-wrap gap-2">
                  {BUDDY_TIMES.map((t) => (
                    <label key={t} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-4 text-[14.5px] font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand-dark">
                      <input type="checkbox" name="times" value={t} defaultChecked={t === "early"} className="size-4 accent-[var(--color-brand)]" />
                      {BUDDY_TIME_LABEL[t]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="b-city" className="label">City</label>
                  <input id="b-city" name="city" required maxLength={80} defaultValue={defaults.city} className="input" placeholder="Bengaluru" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="b-pace" className="label">Pace</label>
                  <select id="b-pace" name="pace" defaultValue="steady" className="input">
                    {BUDDY_PACES.map((p) => <option key={p} value={p}>{BUDDY_PACE_LABEL[p]}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="b-note" className="label">A note for your match <span className="font-medium text-muted">(optional)</span></label>
                <input id="b-note" name="note" maxLength={200} className="input" placeholder="Beginner, aiming for 5k by December" />
                <span className="text-[13px] text-muted">Only your first name, headline and this note are shown until you both say yes. No phone numbers or emails.</span>
              </div>
              <button className="btn-primary self-start rounded-full px-6">Find my buddy</button>
            </form>
          )}
        </section>

        <aside className="flex flex-[1_1_260px] flex-col gap-4">
          <section aria-labelledby="mine-h" className="card flex flex-col gap-3 p-4">
            <h2 id="mine-h" className="font-bold">You&apos;re looking for</h2>
            {requests.length === 0 ? (
              <p className="text-sm text-muted">Nothing yet. Pick an activity to start.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {requests.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl bg-ground px-3 py-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-move text-move-ink"><ActivityIcon a={r.activity} /></span>
                    <span className="flex min-w-0 flex-1 flex-col text-sm">
                      <span className="font-semibold">{BUDDY_ACTIVITY_LABEL[r.activity]}</span>
                      <span className="truncate text-[12.5px] text-muted"><span className="capitalize">{r.city}</span> · {r.times.map((t) => BUDDY_TIME_LABEL[t as keyof typeof BUDDY_TIME_LABEL]).join(", ")}</span>
                    </span>
                    <form action={closeBuddyAction}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <button className="rounded-lg px-2 py-1.5 text-[13px] font-semibold text-muted hover:bg-white" aria-label={`Stop looking for a ${BUDDY_ACTIVITY_LABEL[r.activity].toLowerCase()} buddy`}>Stop</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {waiting.length > 0 && <p className="text-[13px] text-muted">You said yes to {waiting.length === 1 ? "1 person" : `${waiting.length} people`}; waiting for their answer.</p>}
          </section>
          <section className="card flex flex-col gap-2 p-4 text-[13.5px] text-[#3d4842]">
            <h2 className="font-bold text-ink">Staying safe</h2>
            <p>Meet somewhere public for the first time, and tell a friend where you&apos;re going.</p>
            <p>Anything feel off? Block or report the person from their profile. Our team reviews every report.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
