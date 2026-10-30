import type { Metadata } from "next";
import Link from "next/link";
import { listMyBookings, listMyProposals, summarizeEarnings } from "@/modules/marketplace/service";
import { formatPaise } from "@/lib/money";
import { Badge, Flash, PageTitle, Table } from "@/components/ui";
import { withdrawProposalAction } from "../actions";
import { dayTime, getProOrExit } from "../me";

export const metadata: Metadata = { title: "Proposals & bookings" };

export default async function ProposalsAndBookings({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { me } = await getProOrExit();
  const [proposals, bookings, sp] = await Promise.all([listMyProposals(me.id), listMyBookings(me.id), searchParams]);
  const e = summarizeEarnings(bookings);

  return (
    <>
      <PageTitle title="Proposals & bookings" />
      <Flash msg={sp.msg} error={sp.error} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Earnings</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <Money label="Upcoming" value={e.upcomingPaise} />
          <Money label="Completed" value={e.completedPaise} />
          <Money label="Cancelled" value={e.cancelledPaise} />
        </div>
        <p className="text-[13px] text-muted">
          Based on agreed fees. Online payments and payouts (with platform commission and tax shown) arrive in a later release.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Bookings</h2>
        <Table head={["Engagement", "Company", "Scheduled", "Fee", "Status"]} empty={bookings.length === 0 && "No bookings yet. When a company accepts your proposal it appears here."}>
          {bookings.map((b) => (
            <tr key={b.booking.id}>
              <td className="font-semibold">{b.title}<br /><span className="text-[13px] font-normal text-muted">Up to {b.participants} participants</span></td>
              <td>{b.orgName}</td>
              <td className="whitespace-nowrap">{dayTime(b.booking.scheduledStart)}</td>
              <td className="whitespace-nowrap">{formatPaise(b.feePaise)}</td>
              <td><Badge status={b.booking.status} /></td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Proposals</h2>
        <Table head={["Requirement", "Company", "Fee", "Proposed start", "Status", ""]} empty={proposals.length === 0 && "You haven't sent any proposals yet."}>
          {proposals.map((p) => (
            <tr key={p.proposal.id}>
              <td>
                {p.enquiryId ? (
                  <Link href={`/pro/enquiries/${p.enquiryId}`} className="font-semibold text-brand hover:underline">{p.title}</Link>
                ) : (
                  <span className="font-semibold">{p.title}</span>
                )}
              </td>
              <td>{p.orgName}</td>
              <td className="whitespace-nowrap">{formatPaise(p.proposal.feePaise)}</td>
              <td className="whitespace-nowrap">{dayTime(p.proposal.proposedStart)}</td>
              <td><Badge status={p.proposal.status} /></td>
              <td>
                {p.proposal.status === "submitted" && (
                  <form action={withdrawProposalAction}>
                    <input type="hidden" name="proposalId" value={p.proposal.id} />
                    <button className="text-[13px] font-semibold text-[#9b2c1f] hover:underline">Withdraw</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="card flex flex-col gap-1 p-5">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-[22px] font-bold">{formatPaise(value)}</span>
    </div>
  );
}
