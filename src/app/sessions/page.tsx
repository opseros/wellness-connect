import Link from "next/link";
import { Badge, Flash } from "@/components/ui";
import { getCurrentUser } from "@/modules/identity/session";
import { listMySessions, MODE_LABEL, SESSION_STATUS_LABEL } from "@/modules/sessions/service";

const when = (d: Date) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d);

export default async function MySessions({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [rows, sp] = await Promise.all([listMySessions(me.id), searchParams]);
  const open = rows.filter((r) => ["requested", "accepted", "confirmed"].includes(r.status)).reverse();
  const rest = rows.filter((r) => !["requested", "accepted", "confirmed"].includes(r.status));
  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <li>
      <Link href={`/sessions/${r.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-5 hover:ring-brand">
        <span className="flex flex-col gap-0.5">
          <span className="font-bold">{r.serviceTitle} with {r.proName}</span>
          <span className="text-sm text-muted">{when(r.startsAt)} · {MODE_LABEL[r.mode]}</span>
        </span>
        <Badge status={r.status === "confirmed" || r.status === "completed" ? "active" : r.status === "requested" || r.status === "accepted" ? "pending" : r.status} label={SESSION_STATUS_LABEL[r.status]} />
      </Link>
    </li>
  );
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold">My sessions</h1>
        <p className="text-[15px] text-muted">One-to-one sessions you&apos;ve booked with professionals.</p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      {rows.length === 0 && (
        <div className="card flex flex-col items-start gap-3 p-6">
          <p className="text-muted">No sessions yet. Find a verified coach, yoga teacher or nutritionist and book a time that suits you.</p>
          <Link href="/professionals" className="btn-primary">Find professionals</Link>
        </div>
      )}
      {open.length > 0 && <ul className="flex flex-col gap-3">{open.map((r) => <Row key={r.id} r={r} />)}</ul>}
      {rest.length > 0 && (
        <>
          <h2 className="mt-2 text-lg font-bold">Past and closed</h2>
          <ul className="flex flex-col gap-3">{rest.map((r) => <Row key={r.id} r={r} />)}</ul>
        </>
      )}
    </>
  );
}
