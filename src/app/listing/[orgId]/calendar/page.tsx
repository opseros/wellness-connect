import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { getHostCalendar } from "@/modules/stays/service";
import { getListingWorkspace } from "@/modules/listings/service";
import { Flash } from "@/components/ui";
import { calendarAction } from "../../actions";

export const metadata: Metadata = { title: "Calendar & prices" };
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const rs = (p: number | null) => (p === null ? "—" : `₹${(p / 100).toLocaleString("en-IN")}`);

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ month?: string; msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const w = await getListingWorkspace(me.id, orgId);
  if (w.listing.kind !== "homestay") notFound();
  const cal = await getHostCalendar(me.id, orgId, sp.month ?? "").catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const first = new Date(`${cal.month}-01T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const title = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const field = "flex flex-col gap-1.5 text-sm font-semibold";
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">Calendar &amp; prices</h1>
        <p className="text-[15px] text-muted">
          Prices are per room per night. Your usual price is {rs(cal.basePricePaise)} (change it under Listing); set a different price for festivals or weekends, and block dates you&apos;re closed. You have {cal.rooms} room{cal.rooms === 1 ? "" : "s"}.
        </p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      {w.listing.status !== "verified" && <p className="rounded-xl bg-[#fbf0dc] px-4 py-3 text-sm text-[#7a4b00]">Guests can book once your listing is verified. You can set up your calendar now.</p>}

      <section className="card flex flex-col gap-4 p-5" aria-labelledby="cal-h">
        <div className="flex items-center justify-between gap-3">
          <Link href={`?month=${cal.prev}`} className="btn-outline min-h-10 px-4 text-sm" aria-label="Previous month">←</Link>
          <h2 id="cal-h" className="text-lg font-bold">{title}</h2>
          <Link href={`?month=${cal.next}`} className="btn-outline min-h-10 px-4 text-sm" aria-label="Next month">→</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] table-fixed border-separate border-spacing-1 text-left">
            <thead><tr>{WEEK.map((d) => <th key={d} scope="col" className="px-1 text-xs font-semibold text-muted">{d}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: Math.ceil((lead + cal.days.length) / 7) }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: 7 }, (_, c) => {
                    const d = cal.days[r * 7 + c - lead];
                    if (!d) return <td key={c} />;
                    const past = d.day < cal.today;
                    const full = d.booked >= cal.rooms;
                    return (
                      <td key={c} className={`h-[74px] rounded-lg p-2 align-top text-[12.5px] ${past ? "bg-ground text-muted" : d.blocked ? "bg-[#eceeed]" : full ? "bg-meetup" : "bg-white ring-1 ring-line"}`}>
                        <span className="block font-bold">{Number(d.day.slice(8))}</span>
                        {d.blocked ? <span className="text-[#5b6660]">Blocked</span> : <span className={d.custom ? "font-semibold text-brand-dark" : ""}>{rs(d.pricePaise)}</span>}
                        {d.booked > 0 && <span className="block text-meetup-ink">{d.booked}/{cal.rooms} booked</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">Green prices are your custom prices. Yellow days are fully booked.</p>
      </section>

      {w.canEdit && (
        <section className="card p-5" aria-labelledby="change-h">
          <h2 id="change-h" className="mb-3 text-lg font-bold">Change dates</h2>
          <form action={calendarAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="month" value={cal.month} />
            <label className={field}>From<input name="from" type="date" required min={cal.today} className="input" /></label>
            <label className={field}>To (inclusive)<input name="to" type="date" min={cal.today} className="input" /></label>
            <label className={field}>Do this
              <select name="action" className="input">
                <option value="price">Set price</option>
                <option value="clear_price">Use usual price</option>
                <option value="block">Block (closed)</option>
                <option value="unblock">Unblock</option>
              </select>
            </label>
            <label className={field}>Price per room per night (₹)<input name="priceRupees" type="number" min={100} step={1} className="input" /></label>
            <button className="btn-primary">Apply</button>
          </form>
          <p className="mt-3 text-[13px] text-muted">Changes apply to new requests. Requests already sent keep the price the guest saw.</p>
        </section>
      )}
    </>
  );
}
