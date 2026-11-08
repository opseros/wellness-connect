import type { Metadata } from "next";
import Link from "next/link";
import { rupees } from "@/components/directory";
import { getCurrentUser } from "@/modules/identity/session";
import { listMyBookings, type BookingTone, type MyBooking } from "@/modules/bookings/service";
import { myWallets } from "@/modules/marketplace/credits";
import { Flash } from "@/components/ui";

export const metadata: Metadata = { title: "My bookings" };

const KIND: Record<MyBooking["kind"], string> = { session: "Session", stay: "Homestay", plan: "Gym plan" };
const TONE: Record<BookingTone, string> = {
  good: "bg-brand-soft text-brand-dark",
  wait: "bg-meetup text-meetup-ink",
  done: "bg-ground text-muted",
  stopped: "bg-[#f9e4e2] text-[#9b2c24]",
};

function Rows({ rows }: { rows: MyBooking[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-white ring-1 ring-line">
      {rows.map((b) => (
        <li key={`${b.kind}-${b.id}`}>
          <Link href={b.href} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-ground sm:grid-cols-[110px_1fr_auto_auto]">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-brand sm:order-none">{KIND[b.kind]}</span>
            <span className="col-span-2 flex min-w-0 flex-col sm:col-span-1">
              <span className="truncate font-semibold">{b.title}</span>
              <span className="truncate text-[13px] text-muted">{b.detail} · {b.whenLabel}</span>
            </span>
            <span className="text-sm font-semibold tabular-nums">{b.amountPaise ? rupees(b.amountPaise) : "Free"}</span>
            <span className={`justify-self-end rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TONE[b.tone]}`}>{b.status}</span>
          </Link>
        </li>
      ))}
    </ul>
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[32px] leading-tight font-extrabold tracking-[-0.02em]">My bookings</h1>
          <p className="text-[15px] text-muted">Sessions, stays and gym plans in one list. Open one to pay, cancel or see the details.</p>
        </div>
        <Link href="/explore" className="btn-primary rounded-full">Explore</Link>
      </header>
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
            <h2 id="up-h" className="text-lg font-bold">Coming up</h2>
            {upcoming.length ? <Rows rows={upcoming} /> : <p className="text-sm text-muted">Nothing coming up.</p>}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="past-h" className="flex flex-col gap-3">
              <h2 id="past-h" className="text-lg font-bold text-muted">Past and cancelled</h2>
              <Rows rows={past} />
            </section>
          )}
        </>
      )}
    </>
  );
}
