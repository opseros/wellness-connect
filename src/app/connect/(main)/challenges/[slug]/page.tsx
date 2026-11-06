import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { LOG_DAYS_BACK, UNIT_LABEL, addDays, getChallenge, istToday } from "@/modules/connect/challenges";
import { leaveChallengeAction, logChallengeAction } from "../../../actions";
import { GroupLine, JoinButton, Ring, StateChip, dayLabel, fmtNum, range, unitText } from "../../../challenge-ui";
import { Flash } from "../../../ui";

export const metadata: Metadata = { title: "Challenge" };

export default async function ChallengePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const c = await getChallenge(me.id, slug).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const today = istToday();
  const yesterday = addDays(today, -1);
  const here = `/connect/challenges/${c.slug}`;
  const byDay = new Map(c.logs.map((l) => [l.day, l.amount]));
  const best = Math.max(1, ...c.logs.map((l) => l.amount));
  const left = Math.max(0, c.goal - c.myTotal);

  return (
    <main className="flex max-w-[760px] flex-col gap-4">
      <Link href="/connect/challenges" className="text-sm font-semibold text-brand hover:underline">← Challenges</Link>
      <Flash msg={sp.msg} error={sp.error} />

      <section className="card flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StateChip c={c} />
          {c.company && <span className="rounded-full bg-[#e3ecf5] px-2.5 py-0.5 text-[12px] font-semibold text-[#1d4f7a]">Your company</span>}
          <span className="text-[13px] text-muted">{range(c)}</span>
        </div>
        <div>
          <h1 className="font-display text-[28px] leading-tight font-extrabold tracking-[-0.02em]">{c.title}</h1>
          {c.about && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-[#3d4842]">{c.about}</p>}
        </div>

        {c.joined ? (
          <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-ground p-4">
            <Ring value={c.myTotal} goal={c.goal} size={96} done={c.completed} />
            <div className="flex flex-col gap-1">
              <span className="font-display text-[26px] font-extrabold tabular-nums">{fmtNum(c.myTotal)} <span className="text-[16px] font-semibold text-muted">/ {unitText(c, c.goal)}</span></span>
              <span className="text-[14px] text-[#3d4842]">
                {c.completed ? "You reached the goal. Keep going if you like." : c.state === "ended" ? "This challenge has ended." : `${unitText(c, left)} to go${c.daysLeft ? `, ${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"} left` : ""}.`}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ground p-4">
            <span className="text-[14.5px]">Goal: <b>{unitText(c, c.goal)}</b> each</span>
            {c.state !== "ended" && <JoinButton c={c} back={here} />}
          </div>
        )}

        <p className="text-[13.5px] text-muted"><GroupLine c={c} /></p>
      </section>

      {c.joined && c.loggable.length > 0 && (
        <section aria-labelledby="log-h" className="card flex flex-col gap-3 p-5">
          <h2 id="log-h" className="font-bold">Log your progress</h2>
          <form action={logChallengeAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="challengeId" value={c.id} />
            <input type="hidden" name="back" value={here} />
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Day
              <select name="day" className="input min-w-40" defaultValue={today}>
                {c.loggable.map((d) => <option key={d} value={d}>{dayLabel(d, today, yesterday)}{byDay.has(d) ? ` (${fmtNum(byDay.get(d)!)} logged)` : ""}</option>)}
              </select>
            </label>
            {c.unit === "days" ? (
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Did you do it?
                <select name="amount" className="input min-w-32" defaultValue="1">
                  <option value="1">Yes, done</option>
                  <option value="0">Not that day</option>
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {UNIT_LABEL[c.unit].many[0].toUpperCase() + UNIT_LABEL[c.unit].many.slice(1)}
                <input name="amount" type="number" inputMode="numeric" min={0} max={c.dailyMax} required className="input w-40" />
              </label>
            )}
            <button className="btn-primary">Save</button>
          </form>
          <p className="text-[13px] text-muted">You can log today and up to {LOG_DAYS_BACK} days back. Saving a day again replaces its number.</p>
        </section>
      )}

      {c.joined && c.logs.length > 0 && (
        <section aria-labelledby="days-h" className="card flex flex-col gap-3 p-5">
          <h2 id="days-h" className="font-bold">Your days</h2>
          <ul className="flex flex-col gap-1.5">
            {c.logs.map((l) => (
              <li key={l.day} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[14px]">
                <span className="text-muted">{dayLabel(l.day, today, yesterday)}</span>
                <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-ground">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${(l.amount / best) * 100}%` }} />
                </span>
                <span className="font-semibold tabular-nums">{c.unit === "days" ? (l.amount ? "Done" : "Skipped") : fmtNum(l.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.joined && (
        <form action={leaveChallengeAction} className="self-start">
          <input type="hidden" name="challengeId" value={c.id} />
          <button className="text-[13px] font-semibold text-muted hover:text-ink hover:underline">Leave this challenge (deletes your numbers for it)</button>
        </form>
      )}
    </main>
  );
}
