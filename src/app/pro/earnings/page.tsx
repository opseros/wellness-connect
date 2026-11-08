import type { Metadata } from "next";
import Link from "next/link";
import { listMyBookings, summarizeEarnings } from "@/modules/marketplace/service";
import { periodLabel, proEarningsByMonth } from "@/modules/marketplace/credits";
import { formatPaise } from "@/lib/money";
import { PageTitle } from "@/components/ui";
import { getProOrExit } from "../me";

export const metadata: Metadata = { title: "Earnings" };

/** Everything you earn on Moosam: member sessions month by month (after the Moosam fee) and company bookings. */
export default async function ProEarnings() {
  const { me } = await getProOrExit();
  const [member, bookings] = await Promise.all([proEarningsByMonth(me.id, 6), listMyBookings(me.id)]);
  const company = summarizeEarnings(bookings);
  const total = member.months.reduce((a, m) => ({ sessions: a.sessions + m.sessions, gross: a.gross + m.grossPaise, fee: a.fee + m.feePaise, net: a.net + m.netPaise }), { sessions: 0, gross: 0, fee: 0, net: 0 });

  return (
    <>
      <PageTitle title="Earnings" subtitle={`Member sessions after the Moosam fee (${member.feeBps / 100}%), and company bookings.`} />

      <section aria-labelledby="m-h" className="card flex flex-col gap-4 p-6">
        <h2 id="m-h" className="text-lg font-bold">Member sessions, last 6 months</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-[13px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">Month</th>
                <th className="py-2 pr-3 text-right font-semibold">Sessions</th>
                <th className="py-2 pr-3 text-right font-semibold">Booked value</th>
                <th className="py-2 pr-3 text-right font-semibold">Moosam fee</th>
                <th className="py-2 text-right font-semibold">You receive</th>
              </tr>
            </thead>
            <tbody>
              {member.months.map((m) => (
                <tr key={m.period} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3 font-semibold">{periodLabel(m.period)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{m.sessions}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatPaise(m.grossPaise)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{formatPaise(m.feePaise)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{formatPaise(m.netPaise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/20 font-bold">
                <td className="py-2.5 pr-3">Total</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{total.sessions}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{formatPaise(total.gross)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{formatPaise(total.fee)}</td>
                <td className="py-2.5 text-right tabular-nums text-brand-dark">{formatPaise(total.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[13px] text-muted">Confirmed and completed sessions that members booked with you, including ones paid with company wellness credits. Requests not yet accepted aren&apos;t counted.</p>
      </section>

      <section aria-labelledby="c-h" className="card flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="c-h" className="text-lg font-bold">Company bookings</h2>
          <Link href="/pro/proposals" className="text-sm font-semibold text-brand hover:underline">Proposals &amp; bookings →</Link>
        </div>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <div className="rounded-2xl bg-ground p-4"><dt className="text-[13px] text-muted">Due to you</dt><dd className="font-display text-[22px] font-extrabold">{formatPaise(company.duePaise)}</dd></div>
          <div className="rounded-2xl bg-ground p-4"><dt className="text-[13px] text-muted">Paid out so far</dt><dd className="font-display text-[22px] font-extrabold">{formatPaise(company.paidOutPaise)}</dd></div>
          <div className="rounded-2xl bg-ground p-4"><dt className="text-[13px] text-muted">Awaiting company payment</dt><dd className="font-display text-[22px] font-extrabold">{formatPaise(company.awaitingPaymentPaise)}</dd></div>
        </dl>
      </section>
    </>
  );
}
