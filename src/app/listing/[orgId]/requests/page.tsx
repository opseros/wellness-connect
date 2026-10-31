import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";
import { getListingWorkspace } from "@/modules/listings/service";
import { AGE_LABEL, listHospitalQuotes, NEED_LABEL, QUOTE_STATUS_LABEL, todayIst } from "@/modules/care/service";
import { Badge, Flash } from "@/components/ui";
import { replyQuoteAction } from "../../actions";

export const metadata: Metadata = { title: "Quote requests" };
const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
const dt = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(d);
const month = (m: string | null) => (m ? new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`)) : "Not decided");
const tone: Record<string, string> = { requested: "pending", reports_requested: "info_requested", quoted: "submitted", accepted: "accepted", declined: "declined", not_selected: "closed", withdrawn: "withdrawn" };

export default async function Requests({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const w = await getListingWorkspace(me.id, orgId);
  if (w.listing.kind !== "hospital") notFound();
  const d = await listHospitalQuotes(me.id, orgId);
  const today = todayIst();
  const field = "flex flex-col gap-1.5 text-sm font-semibold";
  const open = d.quotes.filter((q) => ["requested", "reports_requested", "quoted"].includes(q.status));
  const closed = d.quotes.filter((q) => !open.includes(q));
  const card = (q: (typeof d.quotes)[number]) => {
    const r = q.request;
    const company = r.kind === "health_check";
    return (
      <article key={q.id} className="card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-display text-[20px] font-bold">{r.treatment}</span>
            <span className="text-[13px] text-muted">Received {dt(q.createdAt)}{company ? " · Company health check-up" : ""}</span>
          </div>
          <Badge status={tone[q.status]} label={QUOTE_STATUS_LABEL[q.status]} />
        </div>
        <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[15px]">
          {q.patient ? <><dt className="text-muted">Patient</dt><dd className="font-semibold">{q.patient.name} · {q.patient.email}</dd></> : <><dt className="text-muted">Patient</dt><dd>{company ? `${r.headcount} people${r.ageRange ? `, ages ${r.ageRange}` : ""}` : `${AGE_LABEL[r.ageRange as keyof typeof AGE_LABEL] ?? r.ageRange}${r.companions ? `, travelling with ${r.companions}` : ""}`}</dd></>}
          {!company && <><dt className="text-muted">Travelling from</dt><dd>{r.travellingFrom}</dd></>}
          <dt className="text-muted">Arriving</dt><dd>{month(r.arriveMonth)}</dd>
          {r.needs.length > 0 && <><dt className="text-muted">Needs</dt><dd>{r.needs.map((n) => NEED_LABEL[n as keyof typeof NEED_LABEL]).join(", ")}{r.interpreterLanguage ? ` (${r.interpreterLanguage})` : ""}</dd></>}
          {r.note && <><dt className="text-muted">Note</dt><dd>{r.note}</dd></>}
          {!company && (
            <>
              <dt className="text-muted">Reports</dt>
              <dd>
                {q.reports.length === 0 ? "None shared with you" : q.reports.map((x) => <a key={x.id} href={`/listing/${orgId}/reports/${x.id}`} target="_blank" rel="noopener" className="mr-3 font-semibold text-brand underline">{x.name}</a>)}
              </dd>
            </>
          )}
          {q.status === "quoted" && q.priceMinPaise !== null && <><dt className="text-muted">Your quote</dt><dd>{rs(q.priceMinPaise)}–{rs(q.priceMaxPaise!)} · valid until {q.validUntil}</dd></>}
          {(q.status === "declined" || q.status === "reports_requested") && q.message && <><dt className="text-muted">Your note</dt><dd>{q.message}</dd></>}
        </dl>
        {!q.patient && !company && <p className="rounded-xl bg-[#dde9f6] px-4 py-3 text-[13.5px] text-[#1d4f7a]">The patient&apos;s name and contact details are shared once they accept your quote. Every time someone on your team opens a report, it&apos;s recorded and shown to the patient.</p>}
        {d.canEdit && ["requested", "reports_requested", "quoted"].includes(q.status) && (
          <details open={q.status !== "quoted"} className="border-t border-line pt-4">
            <summary className="cursor-pointer font-bold">{q.status === "quoted" ? "Update your quote" : "Reply"}</summary>
            <form action={replyQuoteAction} className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
              <input type="hidden" name="orgId" value={orgId} /><input type="hidden" name="quoteId" value={q.id} />
              <label className={`${field} col-span-full sm:col-span-2`}>Package
                <select name="packageId" defaultValue={q.packageId ?? ""} className="input"><option value="">No package (custom quote)</option>{d.packages.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
              </label>
              <label className={field}>From (₹)<input name="priceMinRupees" type="number" min={1} defaultValue={q.priceMinPaise ? q.priceMinPaise / 100 : ""} className="input" /></label>
              <label className={field}>To (₹)<input name="priceMaxRupees" type="number" min={1} defaultValue={q.priceMaxPaise ? q.priceMaxPaise / 100 : ""} className="input" /></label>
              <label className={field}>Nights in hospital<input name="hospitalNights" type="number" min={0} max={60} defaultValue={q.hospitalNights ?? ""} className="input" /></label>
              <label className={field}>Earliest date<input name="earliestDate" type="date" min={today} defaultValue={q.earliestDate ?? ""} className="input" /></label>
              <label className={field}>Valid until<input name="validUntil" type="date" min={today} defaultValue={q.validUntil ?? ""} className="input" /></label>
              <label className={`${field} col-span-full`}>Message to the {company ? "company" : "patient"}<textarea name="message" rows={3} maxLength={1500} defaultValue={q.status === "quoted" ? q.message : ""} className="input py-2" placeholder="Our orthopaedic team can see you on 9 March. Final price after the consultation." /></label>
              <div className="col-span-full flex flex-wrap gap-2">
                <button name="action" value="quote" className="btn-primary">Send quote</button>
                {!company && <button name="action" value="ask_reports" className="btn-outline">Ask for reports first</button>}
                <button name="action" value="decline" className="btn-outline text-[#9b2c1f]">Decline</button>
              </div>
              <p className="col-span-full text-[12.5px] text-muted">To ask for reports or decline, write the reason in the message.</p>
            </form>
          </details>
        )}
      </article>
    );
  };
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">Quote requests</h1>
        <p className="text-[15px] text-muted">Travellers and companies ask up to three hospitals. They see your price range, what&apos;s included and your message, and choose one.</p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      {open.length === 0 && <p className="card p-5 text-sm text-muted">No open requests.</p>}
      {open.map(card)}
      {closed.length > 0 && <h2 className="text-lg font-bold">Closed</h2>}
      {closed.map(card)}
    </>
  );
}
