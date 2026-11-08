import type { Metadata } from "next";
import Link from "next/link";
import { rupees } from "@/components/directory";
import { getCurrentUser } from "@/modules/identity/session";
import { listMyBookings, type BookingTone, type MyBooking } from "@/modules/bookings/service";
import { myWallets } from "@/modules/marketplace/credits";
import { Flash, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "My bookings" };

const KIND: Record<MyBooking["kind"], string> = { session: "Session", stay: "Homestay", plan: "Gym plan" };
const TONE: Record<BookingTone, string> = {
  good: "bg-brand-soft text-brand-dark",
  wait: "bg-meetup text-meetup-ink",
  done: "bg-ground text-muted",
  stopped: "bg-[#f9e4e2] text-[#9b2c24]",
};

/** Prototype table on wider screens; stacked rows on phones. */
function Rows({ rows }: { rows: MyBooking[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-[18px] border border-line bg-white md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ground text-left text-[11.5px] font-bold tracking-[0.08em] text-muted uppercase">
              <th className="px-3.5 py-[11px]">Booking</th>
              <th className="px-3.5 py-[11px]">Type</th>
              <th className="px-3.5 py-[11px]">When</th>
              <th className="px-3.5 py-[11px] text-right">Amount</th>
              <th className="px-3.5 py-[11px]">Status</th>
              <th className="px-3.5 py-[11px]"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={`${b.kind}-${b.id}`} className="border-t border-line">
                <td className="px-3.5 py-[11px]">
                  <Link href={b.href} className="flex flex-col hover:underline">
                    <b className="text-[14.5px]">{b.title}</b>
                    <span className="text-[12.5px] text-muted">{b.detail}</span>
                  </Link>
                </td>
                <td className="px-3.5 py-[11px] text-muted">{KIND[b.kind]}</td>
                <td className="px-3.5 py-[11px] whitespace-nowrap">{b.whenLabel}</td>
                <td className="px-3.5 py-[11px] text-right tabular-nums">{b.amountPaise ? rupees(b.amountPaise) : "Free"}</td>
                <td className="px-3.5 py-[11px]"><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold whitespace-nowrap ${TONE[b.tone]}`}>{b.status}</span></td>
                <td className="px-3.5 py-[11px] text-right"><Link href={b.href} className="font-semibold text-brand hover:underline">Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-white ring-1 ring-line md:hidden">
        {rows.map((b) => (
          <li key={`${b.kind}-${b.id}`}>
            <Link href={b.href} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-ground">
              <span className="text-[11.5px] font-bold tracking-[0.1em] text-brand uppercase">{KIND[b.kind]}</span>
              <span className={`justify-self-end rounded-full px-2.5 py-0.5 text-[12px] font-bold ${TONE[b.tone]}`}>{b.status}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{b.title}</span>
                <span className="truncate text-[13px] text-muted">{b.detail} · {b.whenLabel}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums">{b.amountPaise ? rupees(b.amountPaise) : "Free"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function MyBookingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const sp = await searchParams;
  const [all, wallets] = await Promise.all([listMyBookings(me.id), myWallets(me.id)]);
  const w = wallets[0];
  const upcoming = all.filter((b) => b.upcoming);
  const past = all.filter((b) => !b.upcoming);
  return (
    <>
      <PageTitle title="My bookings" isNew subtitle="Sessions, gym plans and stays in one list. Open one to pay, cancel or see the details." actions={<Link href="/explore" className="btn-primary">Explore</Link>} />
      <Flash msg={sp.msg} error={sp.error} />
      {w && (
        <Link href="/benefits" className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-brand-soft px-5 py-4 ring-1 ring-[#0f6b5c]/15 hover:ring-[#0f6b5c]/40">
          <span className="flex flex-col">
            <span className="text-[13px] font-semibold text-brand-dark">{w.orgName} wellness credits</span>
            <span className="font-display text-[22px] font-extrabold text-ink">{w.funded ? `₹${(w.availablePaise / 100).toLocaleString("en-IN")} left this month` : "Waiting for this month's payment"}</span>
          </span>
          <span className="text-sm font-semibold text-brand">My benefits →</span>
        </Link>
      )}
      {all.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <p className="font-semibold">Nothing booked yet</p>
          <p className="text-sm text-muted">Find a verified coach, a gym or a homestay in Explore.</p>
          <Link href="/explore" className="btn-primary rounded-full">Explore</Link>
        </div>
      ) : (
        <>
          <section aria-labelledby="up-h" className="flex flex-col gap-3">
            <h2 id="up-h" className="text-[19px] font-bold">Coming up</h2>
            {upcoming.length ? <Rows rows={upcoming} /> : <p className="text-sm text-muted">Nothing coming up.</p>}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="past-h" className="flex flex-col gap-3">
              <h2 id="past-h" className="text-[19px] font-bold text-muted">Past and cancelled</h2>
              <Rows rows={past} />
            </section>
          )}
        </>
      )}
    </>
  );
}
