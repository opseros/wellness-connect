import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Flash } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { getSession, MODE_LABEL, SESSION_STATUS_LABEL } from "@/modules/sessions/service";
import { cancelSessionAction } from "../actions";

const when = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);
const rs = (p: number) => (p === 0 ? "Free" : `₹${(p / 100).toLocaleString("en-IN")}`);

export default async function SessionPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ sessionId }, sp] = await Promise.all([params, searchParams]);
  const s = await getSession(me.id, sessionId).catch((e) => {
    if (e instanceof AppError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  });
  const open = ["requested", "accepted", "confirmed"].includes(s.status);
  return (
    <>
      <Link href="/sessions" className="text-sm font-semibold text-brand hover:underline">← My sessions</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold">{s.serviceTitle}</h1>
        <Badge status={s.status === "confirmed" || s.status === "completed" ? "active" : open ? "pending" : s.status} label={SESSION_STATUS_LABEL[s.status]} />
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      <section className="card flex flex-col gap-4 p-6">
        <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[15px]">
          <dt className="text-muted">With</dt><dd><Link href={`/p/${s.profileId}`} className="font-semibold text-brand hover:underline">{s.proName}</Link></dd>
          <dt className="text-muted">When</dt><dd>{when(s.startsAt)}</dd>
          <dt className="text-muted">How</dt><dd>{MODE_LABEL[s.mode]}</dd>
          <dt className="text-muted">Price</dt><dd>{rs(s.pricePaise)}</dd>
          {s.note && (<><dt className="text-muted">Your note</dt><dd>{s.note}</dd></>)}
          {s.proNote && (<><dt className="text-muted">Their note</dt><dd>{s.proNote}</dd></>)}
          {s.meetingLink && (<><dt className="text-muted">Meeting link</dt><dd><a href={s.meetingLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">{s.meetingLink}</a></dd></>)}
          {s.address && (<><dt className="text-muted">Address</dt><dd>{s.address}</dd></>)}
        </dl>
        {s.status === "requested" && <p className="rounded-xl bg-ground px-4 py-3 text-sm">Waiting for {s.proName.split(" ")[0]} to reply. If they don&apos;t, the request lapses and the time is freed.</p>}
        {s.status === "accepted" && <p className="rounded-xl bg-[#fff4dc] px-4 py-3 text-sm text-[#7a4b00]">Accepted. Online payment opens shortly; we&apos;ll email you the moment you can pay to confirm.</p>}
      </section>
      {open && (
        <form action={cancelSessionAction} className="card flex flex-wrap items-end gap-3 p-5">
          <input type="hidden" name="id" value={s.id} />
          <label className="flex flex-[1_1_260px] flex-col gap-1.5 text-sm font-semibold">Cancel this session (reason optional)<input name="reason" maxLength={300} className="input" /></label>
          <button className="btn-outline text-[#9b2c1f]">Cancel session</button>
        </form>
      )}
    </>
  );
}
