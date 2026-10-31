import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { listMyCareRequests, QUOTE_STATUS_LABEL } from "@/modules/care/service";
import { Badge } from "@/components/ui";

export const metadata = { title: "My care requests" };
const dt = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(d);
const STATUS: Record<string, string> = { open: "Open", accepted: "Quote accepted", closed: "Closed", withdrawn: "Withdrawn" };

export default async function MyRequests() {
  const me = (await getCurrentUser())!;
  const rows = await listMyCareRequests(me.id);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold">My care requests</h1>
        <Link href="/care/request" className="btn-primary">Ask for quotes</Link>
      </div>
      {rows.length === 0 && <p className="card p-6 text-[15px] text-muted">No requests yet. Browse <Link href="/hospitals" className="text-brand underline">verified hospitals</Link> and ask up to three for a quote.</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/care/requests/${r.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-5 hover:shadow-md">
              <span className="flex flex-col gap-1">
                <span className="font-bold">{r.treatment}{r.kind === "health_check" ? ` · ${r.headcount} people` : ""}</span>
                <span className="text-[13.5px] text-muted">Sent {dt(r.createdAt)} · {r.quotes.map((q) => `${q.hospitalName}: ${QUOTE_STATUS_LABEL[q.status].toLowerCase()}`).join(" · ")}</span>
              </span>
              <Badge status={r.status === "accepted" ? "accepted" : r.status === "open" ? "pending" : "closed"} label={STATUS[r.status]} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
