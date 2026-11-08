import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Flash } from "@/components/ui";
import { listProSessions, MODE_LABEL, SESSION_STATUS_LABEL } from "@/modules/sessions/service";
import { cancelSessionAction, respondAction } from "@/app/sessions/actions";
import { getProOrExit } from "../me";

export const metadata: Metadata = { title: "Sessions" };
const when = (d: Date) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d);
const rs = (p: number) => (p === 0 ? "Free" : `₹${(p / 100).toLocaleString("en-IN")}`);

/** One-to-one sessions booked by members: requests to answer, then what's coming up. */
export default async function ProSessions({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { me } = await getProOrExit();
  const [rows, sp] = await Promise.all([listProSessions(me.id), searchParams]);
  const requests = rows.filter((r) => r.status === "requested");
  const upcoming = rows.filter((r) => ["accepted", "confirmed"].includes(r.status));
  const past = rows.filter((r) => !["requested", "accepted", "confirmed"].includes(r.status)).reverse();
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[30px] leading-[1.05] font-extrabold tracking-[-0.02em]">Sessions</h1>
          <p className="text-[15px] text-muted">One-to-one sessions booked by members.</p>
        </div>
        <Link href="/pro/schedule" className="btn-outline">Schedule and settings</Link>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Requests {requests.length > 0 && <span className="text-muted">· {requests.length}</span>}</h2>
        {requests.length === 0 && <p className="card p-5 text-sm text-muted">No requests waiting.</p>}
        {requests.map((r) => (
          <article key={r.id} className="card flex flex-wrap items-start justify-between gap-4 p-5">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-bold">{r.serviceTitle} · {r.memberName}</span>
              <span className="text-sm text-muted">{when(r.startsAt)} · {MODE_LABEL[r.mode]} · {rs(r.pricePaise)}</span>
              {r.note && <span className="text-sm">&ldquo;{r.note}&rdquo;</span>}
              <span className="text-[13px] text-[#7a4b00]">Reply by {when(r.respondBy)}</span>
            </div>
            <div className="flex flex-col gap-2">
              <form action={respondAction} className="flex gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="accept" value="1" />
                <button className="btn-primary">Accept</button>
              </form>
              <form action={respondAction} className="flex gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="accept" value="0" />
                <label className="sr-only" htmlFor={`n-${r.id}`}>Note to the member (optional)</label>
                <input id={`n-${r.id}`} name="note" maxLength={500} placeholder="Note (optional)" className="input min-h-10 w-44 text-sm" />
                <button className="btn-outline min-h-10">Decline</button>
              </form>
            </div>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Coming up</h2>
        {upcoming.length === 0 && <p className="card p-5 text-sm text-muted">Nothing booked yet.</p>}
        {upcoming.map((r) => (
          <article key={r.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-bold">{r.serviceTitle} · {r.memberName}</span>
              <span className="text-sm text-muted">{when(r.startsAt)} · {MODE_LABEL[r.mode]} · {rs(r.pricePaise)}</span>
            </div>
            <span className="flex items-center gap-3">
              <Badge status={r.status === "confirmed" ? "active" : "pending"} label={SESSION_STATUS_LABEL[r.status]} />
              <form action={cancelSessionAction}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="back" value="/pro/sessions" />
                <button className="text-sm font-semibold text-[#9b2c1f] hover:underline">Cancel</button>
              </form>
            </span>
          </article>
        ))}
      </section>

      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Past and closed</h2>
          <ul className="card divide-y divide-line">
            {past.slice(0, 30).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>{r.serviceTitle} · {r.memberName} · {when(r.startsAt)}</span>
                <Badge status={r.status} label={SESSION_STATUS_LABEL[r.status]} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
