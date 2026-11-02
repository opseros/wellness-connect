import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { navOptions } from "@/components/nav-options";
import { Flash } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { getPublicProfile } from "@/modules/professionals/service";
import { bookingOptions, freeSlots, istDay } from "@/modules/sessions/service";
import { requestSessionAction } from "@/app/sessions/actions";

export const metadata: Metadata = { title: "Book a session", robots: { index: false } };
const rs = (p: number) => (p === 0 ? "Free" : `₹${(p / 100).toLocaleString("en-IN")}`);
const dayLabel = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Pick a service, a free time and online or in person, then send a request. */
export default async function BookPage({ params, searchParams }: { params: Promise<{ profileId: string }>; searchParams: Promise<{ service?: string; from?: string; msg?: string; error?: string }> }) {
  const me = await getCurrentUser();
  const { profileId } = await params;
  if (!me) redirect(`/sign-in?next=/p/${profileId}/book`);
  if (!me.emailVerified) redirect("/check-email");
  const sp = await searchParams;
  const d = await getPublicProfile(me.id, profileId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const options = await bookingOptions(profileId);
  const bookable = d.services.filter((s) => s.service.memberPricePaise !== null);
  if (!options.enabled || bookable.length === 0 || d.isOwner) redirect(`/p/${profileId}`);
  const chosen = bookable.find((s) => s.service.id === sp.service) ?? bookable[0];
  const today = istDay(new Date());
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) && sp.from >= today ? sp.from : today;
  const days = await freeSlots(chosen.service.id, from, 7).catch(() => []);
  const modes = chosen.service.deliveryModes;
  const online = modes.includes("virtual") || modes.includes("hybrid");
  const inPerson = modes.includes("in_person") || modes.includes("hybrid");
  const base = `/p/${profileId}/book?service=${chosen.service.id}`;

  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "connect", await navOptions(me.id))} />
      <main className="mx-auto flex max-w-[880px] flex-col gap-5 px-6 py-8">
        <Link href={`/p/${profileId}`} className="text-sm font-semibold text-brand hover:underline">← {d.name}</Link>
        <h1 className="text-[28px] font-bold">Book a session with {d.name.split(" ")[0]}</h1>
        <Flash msg={sp.msg} error={sp.error} />

        <nav aria-label="Service" className="flex flex-wrap gap-2">
          {bookable.map((s) => (
            <Link
              key={s.service.id}
              href={`/p/${profileId}/book?service=${s.service.id}`}
              aria-current={s.service.id === chosen.service.id ? "page" : undefined}
              className={`flex flex-col rounded-2xl px-4 py-3 text-sm ${s.service.id === chosen.service.id ? "bg-ink text-white" : "bg-white ring-1 ring-line hover:ring-ink"}`}
            >
              <span className="font-semibold">{s.service.title}</span>
              <span className={s.service.id === chosen.service.id ? "text-white/75" : "text-muted"}>{s.service.durationMinutes} min · {rs(s.service.memberPricePaise ?? 0)}</span>
            </Link>
          ))}
        </nav>

        <form action={requestSessionAction} className="card flex flex-col gap-5 p-6">
          <input type="hidden" name="profileId" value={profileId} />
          <input type="hidden" name="serviceId" value={chosen.service.id} />
          <input type="hidden" name="key" value={randomUUID()} />
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 flex w-full flex-wrap items-center justify-between gap-2">
              <span className="text-lg font-bold">Choose a time (India time)</span>
              <span className="flex gap-3 text-sm font-semibold">
                {from > today && <Link href={`${base}&from=${addDays(from, -7) < today ? today : addDays(from, -7)}`} className="text-brand hover:underline">← Earlier</Link>}
                <Link href={`${base}&from=${addDays(from, 7)}`} className="text-brand hover:underline">Later →</Link>
              </span>
            </legend>
            {days.length === 0 && <p className="text-sm text-muted">No free times this week. Try later dates.</p>}
            {days.map((day) => (
              <div key={day.day} className="flex flex-col gap-2">
                <span className="text-sm font-semibold">{dayLabel(day.day)}</span>
                <div className="flex flex-wrap gap-2">
                  {day.slots.map((s) => (
                    <label key={s.startsAt} className="cursor-pointer rounded-full bg-ground px-3.5 py-2 text-sm font-semibold ring-1 ring-line has-[:checked]:bg-brand has-[:checked]:text-white has-[:checked]:ring-brand has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand">
                      <input type="radio" name="startsAt" value={s.startsAt} required className="sr-only" />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-2 text-sm font-semibold">How</legend>
            {online && (
              <label className="flex items-center gap-2 text-[15px]"><input type="radio" name="mode" value="online" defaultChecked required className="size-4 accent-brand" />Online</label>
            )}
            {inPerson && (
              <label className="flex items-center gap-2 text-[15px]"><input type="radio" name="mode" value="in_person" defaultChecked={!online} required className="size-4 accent-brand" />In person{d.profile.city ? ` (${d.profile.city})` : ""}</label>
            )}
          </fieldset>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Anything they should know? (optional)
            <textarea name="note" rows={2} maxLength={500} className="input py-2.5" placeholder="Your goals or experience level" />
            <span className="font-normal text-muted">Please don&apos;t share health details, phone numbers or email addresses.</span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <span className="text-sm text-muted">
              {chosen.service.memberPricePaise ? `${rs(chosen.service.memberPricePaise)} · you pay once ${d.name.split(" ")[0]} accepts` : "Free session"}
            </span>
            <button className="btn-primary">Send request</button>
          </div>
        </form>
      </main>
    </div>
  );
}
