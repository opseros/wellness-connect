import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/ui";
import { getSchedule, hhmm, WEEKDAYS } from "@/modules/sessions/service";
import { addTimeOffAction, removeTimeOffAction, saveHoursAction, saveSettingsAction } from "@/app/sessions/actions";
import { getProOrExit } from "../me";

export const metadata: Metadata = { title: "Schedule" };

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const field = "flex flex-col gap-1.5 text-sm font-semibold";
const fmtDay = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** When members can book you: on/off, notice, hours per weekday and days off. */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { me, profile } = await getProOrExit();
  const [s, sp] = await Promise.all([getSchedule(me.id), searchParams]);
  const verified = profile.verificationStatus === "verified";
  const win = (w: number, i: number) => s.windows.filter((x) => x.weekday === w)[i];
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">Schedule</h1>
        <p className="text-[15px] text-muted">Members book one-to-one sessions from your profile at these times. Set a member price on a service to make it bookable.</p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      {!verified && <p className="rounded-xl bg-[#fff4dc] px-4 py-3 text-sm text-[#7a4b00]">You can switch bookings on once your profile is verified.</p>}

      <form action={saveSettingsAction} className="card flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Bookings by members</h2>
          <label className="flex items-center gap-2.5 text-[15px] font-semibold">
            <input type="checkbox" name="enabled" defaultChecked={s.settings.enabled} disabled={!verified} className="size-5 accent-brand" />
            Members can book me
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={field}>Book at least (hours ahead)<input name="minNoticeHours" type="number" min={1} max={168} defaultValue={s.settings.minNoticeHours} className="input" /></label>
          <label className={field}>Up to (days ahead)<input name="maxDaysAhead" type="number" min={1} max={90} defaultValue={s.settings.maxDaysAhead} className="input" /></label>
          <label className={field}>Break between sessions (minutes)<input name="bufferMinutes" type="number" min={0} max={120} step={5} defaultValue={s.settings.bufferMinutes} className="input" /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={field}>Meeting link for online sessions<input name="meetingLink" type="url" defaultValue={s.settings.meetingLink} className="input" placeholder="https://meet.google.com/…" /></label>
          <label className={field}>Address for in-person sessions<input name="inPersonAddress" maxLength={300} defaultValue={s.settings.inPersonAddress} className="input" placeholder="Studio 4, 12th Main, Indiranagar" /></label>
        </div>
        <p className="text-[13px] text-muted">Members see the link or address only once a session is confirmed.</p>
        <button className="btn-primary self-start">Save settings</button>
      </form>

      <form action={saveHoursAction} className="card flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-bold">Weekly hours (India time)</h2>
          <p className="text-sm text-muted">Up to two blocks a day. Leave a day empty when you&apos;re not available.</p>
        </div>
        <div className="flex flex-col divide-y divide-line">
          {ORDER.map((w) => (
            <fieldset key={w} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
              <legend className="sr-only">{WEEKDAYS[w]}</legend>
              <span className="w-28 text-[15px] font-semibold" aria-hidden>{WEEKDAYS[w]}</span>
              {[0, 1].map((i) => {
                const x = win(w, i);
                const k = i === 0 ? "a" : "b";
                return (
                  <span key={i} className="flex items-center gap-2 text-sm">
                    <label className="sr-only" htmlFor={`d${w}${k}s`}>{WEEKDAYS[w]} block {i + 1} start</label>
                    <input id={`d${w}${k}s`} name={`d${w}${k}s`} type="time" step={1800} defaultValue={x ? hhmm(x.startMinute) : ""} className="input min-h-10 w-[130px]" />
                    <span aria-hidden>to</span>
                    <label className="sr-only" htmlFor={`d${w}${k}e`}>{WEEKDAYS[w]} block {i + 1} end</label>
                    <input id={`d${w}${k}e`} name={`d${w}${k}e`} type="time" step={1800} defaultValue={x ? hhmm(x.endMinute) : ""} className="input min-h-10 w-[130px]" />
                  </span>
                );
              })}
            </fieldset>
          ))}
        </div>
        <button className="btn-primary self-start">Save hours</button>
      </form>

      <section id="off" className="card flex scroll-mt-24 flex-col gap-4 p-6">
        <h2 className="text-lg font-bold">Days off</h2>
        <form action={addTimeOffAction} className="flex flex-wrap items-end gap-3">
          <label className={field}>Date<input name="day" type="date" required className="input" /></label>
          <button className="btn-outline">Add day off</button>
        </form>
        {s.timeOff.length === 0 ? (
          <p className="text-sm text-muted">No days off coming up.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {s.timeOff.map((d) => (
              <li key={d} className="flex items-center gap-2 rounded-full bg-ground px-3.5 py-1.5 text-sm font-semibold">
                {fmtDay(d)}
                <form action={removeTimeOffAction}>
                  <input type="hidden" name="day" value={d} />
                  <button aria-label={`Remove ${fmtDay(d)}`} className="text-muted hover:text-ink">×</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-sm text-muted">Requests arrive in <Link href="/pro/sessions" className="font-semibold text-brand underline">Sessions</Link>. You have 24 hours to accept each one.</p>
    </>
  );
}
