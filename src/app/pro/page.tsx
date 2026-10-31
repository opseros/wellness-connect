import Link from "next/link";
import { getProDashboard } from "@/modules/professionals/service";
import { listMyBookings, listMyEnquiries, summarizeEarnings } from "@/modules/marketplace/service";
import { formatPaise } from "@/lib/money";
import { Badge, Flash, PageTitle } from "@/components/ui";
import { getProOrExit } from "./me";

const statusCopy: Record<string, string> = {
  unverified: "Upload a credential so our team can verify you.",
  pending: "Our team is reviewing your credentials. We'll email you.",
  verified: "Verified. Companies can match with you.",
  rejected: "Your credential wasn't approved. See the note and upload a new one.",
};

export default async function ProOverview({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { me } = await getProOrExit();
  const [dash, enquiries, bookings, sp] = await Promise.all([getProDashboard(me.id), listMyEnquiries(me.id), listMyBookings(me.id), searchParams]);
  if (!dash) return null;
  const earnings = summarizeEarnings(bookings);
  const newEnquiries = enquiries.filter((e) => e.status === "sent" || e.status === "viewed");

  return (
    <>
      <PageTitle title={`Hello, ${me.name.split(" ")[0]}`} subtitle={dash.profile.headline || "Your professional workspace"} />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Stat label="Verification" value={<Badge status={dash.profile.verificationStatus} />} note={statusCopy[dash.profile.verificationStatus]} />
        <Stat label="Enquiries waiting" value={String(newEnquiries.length)} note={<Link href="/pro/enquiries" className="font-semibold text-brand hover:underline">Open inbox →</Link>} />
        <Stat label="Due to you" value={formatPaise(earnings.duePaise)} note={`${formatPaise(earnings.paidOutPaise)} paid out so far`} />
        <Stat label="Awaiting company payment" value={formatPaise(earnings.awaitingPaymentPaise)} note={`${earnings.bookingCount} booking${earnings.bookingCount === 1 ? "" : "s"} in total`} />
      </div>

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

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-1.5 p-5">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-[22px] font-bold">{value}</span>
      {note && <span className="text-[13px] text-muted">{note}</span>}
    </div>
  );
}
