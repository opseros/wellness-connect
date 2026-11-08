import Link from "next/link";
import { getProDashboard } from "@/modules/professionals/service";
import { listMyBookings, listMyEnquiries, summarizeEarnings } from "@/modules/marketplace/service";
import { formatPaise } from "@/lib/money";
import { Badge, Flash, Kpi, PageTitle, Table } from "@/components/ui";
import { listProSessions, MODE_LABEL, SESSION_STATUS_LABEL } from "@/modules/sessions/service";
import { getProOrExit } from "./me";
import { proMonthEarnings } from "@/modules/marketplace/credits";

const statusCopy: Record<string, string> = {
  unverified: "Upload a credential so our team can verify you.",
  pending: "Our team is reviewing your credentials. We'll email you.",
  verified: "Verified. Companies can match with you.",
  rejected: "Your credential wasn't approved. See the note and upload a new one.",
};

export default async function ProOverview({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { me } = await getProOrExit();
  const [dash, enquiries, bookings, sp, member, sessions] = await Promise.all([getProDashboard(me.id), listMyEnquiries(me.id), listMyBookings(me.id), searchParams, proMonthEarnings(me.id), listProSessions(me.id)]);
  if (!dash) return null;
  const earnings = summarizeEarnings(bookings);
  const newEnquiries = enquiries.filter((e) => e.status === "sent" || e.status === "viewed");
  // Open sessions (the daily lifecycle job moves past ones to completed or expired).
  const coming = sessions.filter((r) => ["requested", "accepted", "confirmed"].includes(r.status)).slice(0, 6);

  return (
    <>
      <PageTitle title="Dashboard" isNew subtitle={`${me.name} · ${dash.profile.headline || "Wellness professional"}`} />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-2 gap-[10px] sm:gap-[14px] md:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        <Kpi label="Sessions this month" value={member.sessions} note={`${formatPaise(member.grossPaise)} booked`} />
        <Kpi label="Requests waiting" value={member.waiting} note={member.waiting ? <Link href="/pro/sessions" className="font-semibold text-brand hover:underline">Answer within 24 hours →</Link> : "All answered"} />
        <Kpi label="Earnings this month" isNew highlight value={formatPaise(member.netPaise)} note={<Link href="/pro/earnings" className="hover:underline">after the {member.feeBps / 100}% Moosam fee</Link>} />
        <Kpi label="Verification" value={<Badge status={dash.profile.verificationStatus} />} note={statusCopy[dash.profile.verificationStatus]} />
      </div>

      <Table head={["Session", "Member", "When", "Mode", "Amount", "Status"]} empty={coming.length === 0 && "No sessions coming up. Members book from your public profile."}>
        {coming.map((r) => (
          <tr key={r.id}>
            <td className="font-bold">{r.serviceTitle}</td>
            <td>{r.memberName}</td>
            <td className="whitespace-nowrap">{when(r.startsAt)}</td>
            <td>{MODE_LABEL[r.mode]}</td>
            <td className="text-right tabular-nums">{r.pricePaise ? formatPaise(r.pricePaise) : "Free"}</td>
            <td><Badge status={r.status === "requested" ? "pending" : "confirmed"} label={SESSION_STATUS_LABEL[r.status]} /></td>
          </tr>
        ))}
      </Table>

      <section aria-labelledby="co-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="co-h" className="text-[19px] font-bold">Company work</h2>
          <Link href="/pro/enquiries" className="text-sm font-semibold text-brand hover:underline">Enquiries{newEnquiries.length ? ` · ${newEnquiries.length} new` : ""} →</Link>
        </div>
        <div className="grid grid-cols-2 gap-[10px] sm:gap-[14px] md:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
          <Kpi label="Enquiries waiting" value={newEnquiries.length} />
          <Kpi label="Due to you" value={formatPaise(earnings.duePaise)} note={`${formatPaise(earnings.paidOutPaise)} paid out so far`} />
          <Kpi label="Awaiting company payment" value={formatPaise(earnings.awaitingPaymentPaise)} note={`${earnings.bookingCount} booking${earnings.bookingCount === 1 ? "" : "s"} in total`} />
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Get discovered by companies</h2>
            <p className="text-sm text-muted">
              {dash.discoverable ? "You're all set: companies can find you and send enquiries." : "Finish these steps to appear in company matches."}
            </p>
          </div>
          <span className="text-sm font-semibold">{dash.percent}% complete</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ground" role="progressbar" aria-valuenow={dash.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
          <div className="h-full rounded-full bg-brand" style={{ width: `${dash.percent}%` }} />
        </div>
        <ol className="flex flex-col divide-y divide-line">
          {dash.items.map((i) => (
            <li key={i.key} className="flex items-center justify-between gap-3 py-3 text-[15px]">
              <span className="flex items-center gap-3">
                <span aria-hidden className={`grid size-6 place-items-center rounded-full text-xs font-bold ${i.done ? "bg-brand text-white" : "border border-[#c9d1cc] text-muted"}`}>
                  {i.done ? "✓" : ""}
                </span>
                <span className={i.done ? "text-muted line-through" : ""}>{i.label}</span>
                <span className="sr-only">{i.done ? "(done)" : "(to do)"}</span>
              </span>
              {!i.done && i.key !== "verified" && (
                <Link href={i.href} className="text-sm font-semibold text-brand hover:underline">Do it</Link>
              )}
            </li>
          ))}
        </ol>
        {!dash.profile.discoverable && (
          <p className="rounded-xl bg-[#fbf0dc] px-4 py-3 text-sm text-[#7a4b00]">
            You&apos;ve hidden your profile from search. <Link href="/pro/profile#visibility" className="font-semibold underline">Change this</Link>
          </p>
        )}
      </section>
    </>
  );
}

const when = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d);
