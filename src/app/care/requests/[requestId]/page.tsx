import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { AGE_LABEL, buildTimeline, CONSENT_TEXT, getCareRequest, NEED_LABEL, QUOTE_STATUS_LABEL, recoveryStaysNear, todayIst } from "@/modules/care/service";
import { listMyStays, STAY_STATUS_LABEL } from "@/modules/stays/service";
import { Badge, Flash } from "@/components/ui";
import {
  acceptQuoteAction,
  checklistAction,
  deleteReportAction,
  keepReportAction,
  linkStayAction,
  revokeShareAction,
  shareReportAction,
  tripAction,
  uploadReportAction,
  withdrawRequestAction,
} from "../../actions";

const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
const day = (d: string | null) => (d ? new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : "Date to be set");
const dt = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);
const tone: Record<string, string> = { requested: "pending", reports_requested: "info_requested", quoted: "submitted", accepted: "accepted", declined: "declined", not_selected: "closed", withdrawn: "withdrawn" };

export default async function CareRequestPage({ params, searchParams }: { params: Promise<{ requestId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ requestId }, sp] = await Promise.all([params, searchParams]);
  const d = await getCareRequest(me.id, requestId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const r = d.request;
  const company = r.kind === "health_check";
  const hidden = <input type="hidden" name="requestId" value={r.id} />;
  const active = d.quotes.filter((q) => !["declined", "withdrawn", "not_selected"].includes(q.status));
  const today = todayIst();
  const trip = d.trip;
  const acc = d.accepted;
  const [myStays, suggestions] = trip && acc?.hospital ? [await listMyStays(me.id), await recoveryStaysNear(acc.hospital.city)] : [[], []];
  const linked = trip?.stayId ? myStays.find((s) => s.id === trip.stayId) : null;
  const stayQs = trip?.arriveOn && trip?.departOn ? `?${new URLSearchParams({ checkIn: trip.arriveOn, checkOut: trip.departOn })}` : "";

  return (
    <>
      <Link href="/care/requests" className="text-sm font-semibold text-brand hover:underline">← My care requests</Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[30px] font-extrabold leading-tight">{r.treatment}</h1>
        <p className="text-[15px] text-muted">
          {company ? `Health check-up for ${r.headcount} people${r.ageRange ? `, ages ${r.ageRange}` : ""}` : `${AGE_LABEL[r.ageRange as keyof typeof AGE_LABEL] ?? ""} · from ${r.travellingFrom}${r.companions ? ` · with ${r.companions}` : ""}`}
          {r.needs.length ? ` · ${r.needs.map((n) => NEED_LABEL[n as keyof typeof NEED_LABEL]).join(", ")}` : ""}
        </p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <section aria-labelledby="q-h" className="flex flex-col gap-3">
        <h2 id="q-h" className="text-lg font-bold">Compare quotes</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
          {d.quotes.map((q) => (
            <article key={q.id} className={`card flex flex-col gap-3 p-5 ${q.status === "accepted" ? "ring-2 ring-brand" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <Link href={q.hospital ? `/hospitals/${q.hospital.slug}` : "#"} className="font-bold hover:underline">{q.hospital?.name ?? "Hospital"}</Link>
                <Badge status={tone[q.status]} label={QUOTE_STATUS_LABEL[q.status]} />
              </div>
              {q.priceMinPaise !== null && ["quoted", "accepted", "not_selected"].includes(q.status) ? (
                <>
                  <p className="font-display text-[24px] font-bold">{rs(q.priceMinPaise)}–{rs(q.priceMaxPaise!)}</p>
                  <dl className="flex flex-col gap-1 text-[14px]">
                    {q.package && <div><dt className="inline text-muted">Package: </dt><dd className="inline">{q.package.title}</dd></div>}
                    {q.package?.includes.length ? <div><dt className="inline text-muted">Includes: </dt><dd className="inline">{q.package.includes.join(", ")}</dd></div> : null}
                    <div><dt className="inline text-muted">Nights in hospital: </dt><dd className="inline">{q.hospitalNights ?? "—"}</dd></div>
                    <div><dt className="inline text-muted">Earliest date: </dt><dd className="inline">{q.earliestDate ? day(q.earliestDate) : "Flexible"}</dd></div>
                    <div><dt className="inline text-muted">Valid until: </dt><dd className="inline">{q.validUntil ? day(q.validUntil) : "—"}</dd></div>
                  </dl>
                  {q.message && <p className="rounded-xl bg-ground px-3 py-2 text-[14px]">“{q.message}”</p>}
                  {q.status === "quoted" && r.status === "open" && d.enabled && (
                    <form action={acceptQuoteAction}>
                      {hidden}<input type="hidden" name="quoteId" value={q.id} />
                      <button className="btn-primary w-full" disabled={!!q.validUntil && q.validUntil < today}>{q.validUntil && q.validUntil < today ? "Quote expired" : "Accept this quote"}</button>
                    </form>
                  )}
                </>
              ) : (
                <p className="text-[14px] text-muted">{q.message ? `“${q.message}”` : q.status === "requested" ? "Usually replies within 2 working days." : ""}</p>
              )}
            </article>
          ))}
        </div>
        <p className="text-[12.5px] text-muted">Prices are indicative ranges; the hospital confirms the final price after your consultation, and you pay the hospital directly. Accepting a quote shares your name and email with that hospital only.</p>
        {r.status === "open" && (
          <form action={withdrawRequestAction}>{hidden}<button className="text-sm font-semibold text-[#9b2c1f] hover:underline">Withdraw this request</button></form>
        )}
      </section>

      {!company && (
        <section id="reports" aria-labelledby="rep-h" className="card scroll-mt-6 flex flex-col gap-4 p-6">
          <div>
            <h2 id="rep-h" className="text-lg font-bold">Reports (optional)</h2>
            <p className="text-[14px] text-muted">Hospitals can quote without them. If you add a report, it&apos;s encrypted and nobody else can open it until you share it with a hospital. You see every time they open it. Reports are deleted 90 days after your trip unless you choose to keep them.</p>
          </div>
          {d.reports.map((rep) => (
            <div key={rep.id} className="flex flex-col gap-3 rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="flex flex-col">
                  {rep.available ? <a href={`/care/reports/${rep.id}`} target="_blank" rel="noopener" className="font-semibold text-brand underline">{rep.name}</a> : <span className="font-semibold text-muted line-through">{rep.name}</span>}
                  <span className="text-[13px] text-muted">{rep.available ? (rep.keep ? "Kept until you delete it" : `Deleted on ${dt(rep.deleteAfter)}`) : `Deleted ${rep.deletedAt ? dt(rep.deletedAt) : ""}`}</span>
                </span>
                {rep.available && (
                  <span className="flex gap-3 text-sm">
                    <form action={keepReportAction}>{hidden}<input type="hidden" name="reportId" value={rep.id} /><input type="hidden" name="keep" value={rep.keep ? "0" : "1"} /><button className="font-semibold text-brand hover:underline">{rep.keep ? "Delete on schedule" : "Keep it"}</button></form>
                    <form action={deleteReportAction}>{hidden}<input type="hidden" name="reportId" value={rep.id} /><button className="font-semibold text-[#9b2c1f] hover:underline">Delete now</button></form>
                  </span>
                )}
              </div>
              {rep.available && (
                <ul className="flex flex-col gap-2">
                  {active.map((q) => {
                    const shared = rep.sharedWith.includes(q.orgId);
                    return (
                      <li key={q.orgId} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                        <span>{q.hospital?.name}: {shared ? <span className="font-semibold text-brand-dark">shared</span> : <span className="text-muted">not shared</span>}</span>
                        {shared ? (
                          <form action={revokeShareAction}>{hidden}<input type="hidden" name="reportId" value={rep.id} /><input type="hidden" name="orgId" value={q.orgId} /><button className="btn-outline min-h-9 px-3 text-sm">Stop sharing</button></form>
                        ) : (
                          d.enabled && (
                            <form action={shareReportAction} className="flex flex-wrap items-center gap-2">
                              {hidden}<input type="hidden" name="reportId" value={rep.id} /><input type="hidden" name="orgId" value={q.orgId} />
                              <label className="flex max-w-[420px] items-start gap-2 text-[12.5px] text-muted"><input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-brand" />{CONSENT_TEXT}</label>
                              <button className="btn-outline min-h-9 px-3 text-sm">Share</button>
                            </form>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {rep.opens.length > 0 && (
                <details className="text-[13px]">
                  <summary className="cursor-pointer font-semibold">Opened {rep.opens.length} time{rep.opens.length > 1 ? "s" : ""}</summary>
                  <ul className="mt-1 flex flex-col gap-0.5 text-muted">{rep.opens.map((o, i) => <li key={i}>{o.hospitalName}, {dt(o.openedAt)}</li>)}</ul>
                </details>
              )}
            </div>
          ))}
          {d.enabled && (r.status === "open" || r.status === "accepted") && (
            <form action={uploadReportAction} className="flex flex-wrap items-end gap-3">
              {hidden}
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Report (PDF, JPG or PNG, up to 4 MB)<input name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="input py-2" /></label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Name (optional)<input name="name" maxLength={120} className="input" placeholder="Knee X-ray, Jan 2027" /></label>
              <button className="btn-outline">Upload</button>
            </form>
          )}
        </section>
      )}

      {trip && acc && (
        <section id="trip" aria-labelledby="trip-h" className="flex scroll-mt-6 flex-col gap-4">
          <h2 id="trip-h" className="text-lg font-bold">Your care trip</h2>
          <div className="flex flex-wrap items-start gap-4">
            <div className="card flex min-w-0 flex-[999_1_480px] flex-col gap-4 p-6">
              <form action={tripAction} className="flex flex-wrap items-end gap-3">
                {hidden}<input type="hidden" name="tripId" value={trip.id} />
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Arrive<input name="arriveOn" type="date" defaultValue={trip.arriveOn ?? ""} className="input" /></label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Fly home<input name="departOn" type="date" defaultValue={trip.departOn ?? ""} className="input" /></label>
                <button className="btn-outline">Save dates</button>
              </form>
              <ol className="flex flex-col gap-0 border-l-2 border-line">
                {buildTimeline(trip, acc, acc.package?.recoveryNights ?? 0, acc.hospital?.name ?? "the hospital", linked?.homestay?.name).map((s, i) => (
                  <li key={i} className="relative flex flex-col gap-0.5 py-2.5 pl-5">
                    <span aria-hidden className="absolute -left-[7px] top-4 size-3 rounded-full bg-brand" />
                    <span className="text-[13px] font-semibold text-muted">{day(s.date)}</span>
                    <span className="font-semibold">{s.title}</span>
                    <span className="text-[14px] text-muted">{s.detail}</span>
                  </li>
                ))}
              </ol>
            </div>
            <aside className="flex flex-[1_1_300px] flex-col gap-4">
              {acc.hospital?.contact && (
                <section className="card flex flex-col gap-1.5 p-5 text-[14px]">
                  <h3 className="font-bold">{acc.hospital.name}</h3>
                  <span className="text-muted">International patient desk</span>
                  {acc.hospital.contact.email && <a href={`mailto:${acc.hospital.contact.email}`} className="text-brand underline">{acc.hospital.contact.email}</a>}
                  {acc.hospital.contact.phone && <a href={`tel:${acc.hospital.contact.phone.replace(/\s/g, "")}`} className="text-brand underline">{acc.hospital.contact.phone}</a>}
                </section>
              )}
              <section id="checklist" className="card flex scroll-mt-6 flex-col gap-2 p-5">
                <h3 className="font-bold">Checklist</h3>
                {trip.checklist.map((c) => (
                  <form key={c.key} action={checklistAction} className="flex items-start gap-2 text-[14px]">
                    {hidden}<input type="hidden" name="tripId" value={trip.id} /><input type="hidden" name="key" value={c.key} /><input type="hidden" name="done" value={c.done ? "0" : "1"} />
                    <button aria-pressed={c.done} aria-label={`${c.done ? "Untick" : "Tick"}: ${c.label}`} className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border ${c.done ? "border-brand bg-brand text-white" : "border-[#c9d1cc] bg-white"}`}>{c.done ? "✓" : ""}</button>
                    <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                  </form>
                ))}
              </section>
            </aside>
          </div>

          <section id="stay" className="card flex scroll-mt-6 flex-col gap-3 p-6">
            <h3 className="font-bold">Recovery stay</h3>
            {linked ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><Link href={`/stays/${linked.id}`} className="font-semibold text-brand underline">{linked.homestay?.name}</Link> · {linked.checkIn} → {linked.checkOut} · {STAY_STATUS_LABEL[linked.status]}</span>
                <form action={linkStayAction}>{hidden}<input type="hidden" name="tripId" value={trip.id} /><input type="hidden" name="stayId" value="" /><button className="text-sm font-semibold text-[#9b2c1f] hover:underline">Remove from trip</button></form>
              </div>
            ) : (
              <>
                <p className="text-[14px] text-muted">
                  {acc.package?.recoveryNights ? `The hospital suggests about ${acc.package.recoveryNights} nights nearby after discharge. ` : ""}Hosts only see your dates and what to prepare, never your treatment.
                </p>
                {suggestions.length > 0 && (
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                    {suggestions.map((s) => (
                      <li key={s.slug}><Link href={`/homestays/${s.slug}${stayQs}`} className="flex flex-col rounded-xl border border-line p-3 hover:border-brand"><span className="font-semibold">{s.name}</span><span className="text-[13px] text-muted">{[s.listing.area, s.listing.city].filter(Boolean).join(", ")}</span></Link></li>
                    ))}
                  </ul>
                )}
                {myStays.filter((s) => ["requested", "accepted", "confirmed"].includes(s.status)).length > 0 && (
                  <form action={linkStayAction} className="flex flex-wrap items-end gap-2">
                    {hidden}<input type="hidden" name="tripId" value={trip.id} />
                    <label className="flex flex-col gap-1.5 text-sm font-semibold">Already booked? Add it to this trip
                      <select name="stayId" className="input">{myStays.filter((s) => ["requested", "accepted", "confirmed"].includes(s.status)).map((s) => <option key={s.id} value={s.id}>{s.homestay?.name}: {s.checkIn} → {s.checkOut}</option>)}</select>
                    </label>
                    <button className="btn-outline">Add</button>
                  </form>
                )}
              </>
            )}
          </section>
        </section>
      )}
    </>
  );
}
