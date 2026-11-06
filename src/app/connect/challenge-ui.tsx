// Pieces shared by the challenge pages and the feed card.
import Link from "next/link";
import { UNIT_LABEL, type ChallengeView } from "@/modules/connect/challenges";
import { joinChallengeAction, logChallengeAction } from "./actions";

export const fmtNum = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
const fmtDay = (d: string, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => new Intl.DateTimeFormat("en-IN", { ...o, timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
export const dayLabel = (d: string, today: string, yesterday: string) => (d === today ? "Today" : d === yesterday ? "Yesterday" : fmtDay(d, { weekday: "short", day: "numeric", month: "short" }));
export const range = (c: Pick<ChallengeView, "startsOn" | "endsOn">) => `${fmtDay(c.startsOn)} to ${fmtDay(c.endsOn)}`;
export const unitText = (c: Pick<ChallengeView, "unit">, n: number) => `${fmtNum(n)} ${n === 1 ? UNIT_LABEL[c.unit].one : UNIT_LABEL[c.unit].many}`;

/** Progress ring. Decorative: the numbers are always written out next to it. */
export function Ring({ value, goal, size = 72, done = false }: { value: number; goal: number; size?: number; done?: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, goal ? value / goal : 0);
  return (
    <svg aria-hidden viewBox="0 0 64 64" width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#e3ece7" strokeWidth="8" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={done ? "#e0a32e" : "#0f6b5c"} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />
      {done && <path d="M24 33l6 6 11-13" transform="rotate(90 32 32)" fill="none" stroke="#0f6b5c" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export function StateChip({ c }: { c: ChallengeView }) {
  const text = c.state === "upcoming" ? `Starts ${fmtDay(c.startsOn)}` : c.state === "ended" ? "Ended" : c.daysLeft === 1 ? "Last day" : `${c.daysLeft} days left`;
  const tone = c.state === "live" ? "bg-brand-soft text-brand-dark" : c.state === "upcoming" ? "bg-meetup text-meetup-ink" : "bg-ground text-muted";
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${tone}`}>{text}</span>;
}

/** Today's quick log (or "done today" for a habit). */
export function QuickLog({ c, today, back, current }: { c: ChallengeView; today: string; back: string; current?: number }) {
  if (c.state !== "live") return null;
  return (
    <form action={logChallengeAction} className="flex min-w-0 flex-wrap items-center gap-2">
      <input type="hidden" name="challengeId" value={c.id} />
      <input type="hidden" name="day" value={today} />
      <input type="hidden" name="back" value={back} />
      {c.unit === "days" ? (
        current ? (
          <>
            <input type="hidden" name="amount" value="0" />
            <span className="text-[13.5px] font-semibold text-brand-dark">Done today</span>
            <button className="text-[13px] font-semibold text-muted hover:underline">Undo</button>
          </>
        ) : (
          <>
            <input type="hidden" name="amount" value="1" />
            <button className="btn-primary min-h-10 rounded-full px-4 text-sm">Mark today done</button>
          </>
        )
      ) : (
        <>
          <label className="sr-only" htmlFor={`q-${c.id}`}>{UNIT_LABEL[c.unit].verb}</label>
          <input id={`q-${c.id}`} name="amount" type="number" inputMode="numeric" min={0} max={c.dailyMax} required defaultValue={current || undefined} placeholder={UNIT_LABEL[c.unit].verb} className="input min-h-10 w-36 min-w-0" />
          <button className="btn-primary min-h-10 rounded-full px-4 text-sm">Save</button>
        </>
      )}
    </form>
  );
}

export function JoinButton({ c, back }: { c: ChallengeView; back: string }) {
  return (
    <form action={joinChallengeAction}>
      <input type="hidden" name="challengeId" value={c.id} />
      <input type="hidden" name="back" value={back} />
      <button className="btn-outline min-h-10 rounded-full px-5 text-sm">Join</button>
    </form>
  );
}

export function GroupLine({ c }: { c: ChallengeView }) {
  if (c.together === null) return <span>{c.participants === 0 ? "Be the first to join" : `${c.participants} joined`}</span>;
  return (
    <span>
      {c.participants} joined · {unitText(c, c.together)} together{c.finishers ? ` · ${c.finishers} reached the goal` : ""}
    </span>
  );
}

export function ChallengeLink({ c, children, className = "" }: { c: ChallengeView; children: React.ReactNode; className?: string }) {
  return <Link href={`/connect/challenges/${c.slug}`} className={className}>{children}</Link>;
}
