import type { Metadata } from "next";
import Link from "next/link";
import { getOrgBooking, getPaymentOptions, MAX_RESCHEDULES } from "@/modules/marketplace/service";
import { BRAND } from "@/lib/brand";
import { PayOnline } from "./pay-online";
import { formatPaise } from "@/lib/money";
import { Badge, Flash, PageTitle } from "@/components/ui";
import { Field } from "@/app/pro/fields";
import { cancelBookingAction, completeBookingAction, locationAction, payByInvoiceAction, rescheduleAction } from "../../../actions";
import { dayTime, getBuyerOrExit, istParts, MODE_LABEL, orNotFound } from "../../company";

export const metadata: Metadata = { title: "Booking" };

type Step = { label: string; state: "done" | "now" | "next" };

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ orgId: string; bookingId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId, bookingId } = await params;
  const [{ me }, sp] = await Promise.all([getBuyerOrExit(orgId), searchParams]);
  const d = await orNotFound(getOrgBooking(me.id, orgId, bookingId));
  const pay = await getPaymentOptions(me.id, orgId, bookingId);
  const paid = pay.status === "paid" || pay.status === "partially_refunded" || pay.status === "refunded";
  const b = d.booking;
  const pol = d.policy;
  const cancelled = b.status === "cancelled";
  const completed = b.status === "completed";
  const steps: Step[] = [
    { label: "Proposal accepted", state: "done" },
    { label: "Payment", state: paid ? "done" : pay.status === "invoiced" ? "now" : completed ? "done" : "now" },
    { label: "Session", state: completed ? "done" : paid || pay.status === "invoiced" ? "now" : "next" },
    { label: "Feedback", state: "next" },
  ];
  const current = istParts(b.scheduledStart);
  const hidden = (
    <>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="bookingId" value={b.id} />
    </>
  );

  return (
    <>
      <Link href={`/company/${orgId}/bookings`} className="text-sm font-semibold text-brand hover:underline">← Bookings</Link>
      <PageTitle title={cancelled ? "Booking cancelled" : completed ? "Session completed" : paid || pay.status === "invoiced" ? "Booking confirmed" : "Confirm booking and pay"} subtitle={`${d.title} with ${d.name}`} />
      <Flash msg={sp.msg} error={sp.error} />

      {!cancelled && (
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {steps.map((s) => (
            <li
              key={s.label}
              className={`flex flex-col gap-1 rounded-xl px-4 py-3.5 ${s.state === "done" ? "bg-brand text-white" : s.state === "now" ? "border-2 border-brand bg-white text-brand-dark" : "border border-line bg-white text-muted"}`}
            >
              <span className="text-xs font-semibold uppercase tracking-wide">{s.state === "done" ? "Done" : s.state === "now" ? "Next" : "Upcoming"}</span>
              <span className="font-semibold">{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      {cancelled && (
        <p className="rounded-xl bg-[#fbe9e6] px-4 py-3 text-sm text-[#9b2c1f]">
          Cancelled {dayTime(b.cancelledAt)}{b.cancelledLate ? " inside the free-cancellation window (a fee may apply)" : " at no charge"}. Reason: {b.cancelReason}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[999_1_520px] flex-col gap-4 p-6">
          <h2 className="text-lg font-bold">Session details</h2>
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-3 text-[15px]">
            <dt className="text-muted">Professional</dt>
            <dd>{d.profileId ? <Link href={`/p/${d.profileId}`} className="font-semibold text-brand hover:underline">{d.name}</Link> : d.name}</dd>
            <dt className="text-muted">Date and time</dt>
            <dd>
              {dayTime(b.scheduledStart)} <span className="text-muted">(India time)</span>
              {b.rescheduleCount > 0 && <span className="block text-[13px] text-muted">Rescheduled {b.rescheduleCount} of {MAX_RESCHEDULES} times</span>}
            </dd>
            <dt className="text-muted">Format</dt>
            <dd>{MODE_LABEL[d.deliveryMode]}</dd>
            <dt className="text-muted">Location</dt>
            <dd>
              {cancelled || completed ? (
                b.location || "—"
              ) : (
                <form action={locationAction} className="flex flex-wrap gap-2">
                  {hidden}
                  <label htmlFor="location" className="sr-only">Location</label>
                  <input id="location" name="location" defaultValue={b.location} required minLength={2} maxLength={300} className="input min-w-0 flex-[1_1_240px]" />
                  <button className="btn-outline">Save</button>
                </form>
              )}
            </dd>
            <dt className="text-muted">Participants</dt>
            <dd>Up to {d.proposal.maxParticipants}</dd>
            {d.proposal.inclusions && (
              <>
                <dt className="text-muted">Includes</dt>
                <dd className="whitespace-pre-line">{d.proposal.inclusions}</dd>
              </>
            )}
            <dt className="text-muted">Cancellation</dt>
            <dd>
              {d.proposal.freeCancellationDays ? `Free up to ${d.proposal.freeCancellationDays} days before (until ${dayTime(pol.freeCancelUntil)})` : "No free cancellation"}
            </dd>
            <dt className="text-muted">Status</dt>
            <dd><Badge status={b.status === "pending" ? "active" : b.status} label={b.status === "pending" ? "Booked" : undefined} /></dd>
          </dl>
          {pol.canComplete && (
            <form action={completeBookingAction} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              {hidden}
              <span className="text-sm text-muted">Did the session take place?</span>
              <button className="btn-primary">Mark as completed</button>
            </form>
          )}
        </section>

        <aside className="flex flex-[1_1_320px] flex-col gap-4">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="font-bold">Payment</h2>
            <dl className="flex flex-col gap-1.5 text-[15px]">
              <div className="flex justify-between"><dt>Session fee</dt><dd>{formatPaise(pay.price.feePaise)}</dd></div>
              <div className="flex justify-between"><dt>GST ({pay.price.feePaise ? Math.round((pay.price.gstPaise / pay.price.feePaise) * 100) : pay.gstBps / 100}%)</dt><dd>{formatPaise(pay.price.gstPaise)}</dd></div>
              <div className="mt-1 flex justify-between border-t border-line pt-2 font-bold"><dt>Total</dt><dd>{formatPaise(pay.price.totalPaise)}</dd></div>
            </dl>
            {cancelled && !paid ? (
              <p className="text-sm text-muted">Nothing to pay: this booking was cancelled.</p>
            ) : pay.status === "unpaid" ? (
              <div className="flex flex-col gap-2">
                {pay.online ? (
                  <>
                    <PayOnline orgId={orgId} bookingId={b.id} label={`Pay ${formatPaise(pay.price.totalPaise)}`} brand={BRAND.name} description={d.title} />
                    <p className="text-center text-[13px] text-muted">UPI, cards and net banking via Razorpay</p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted">Online payment is being set up. You can pay by invoice now.</p>
                )}
                <form action={payByInvoiceAction}>
                  {hidden}
                  <button className={pay.online ? "w-full py-1 text-sm font-semibold text-brand hover:underline" : "btn-primary w-full"}>Pay by invoice instead</button>
                </form>
              </div>
            ) : pay.status === "invoiced" ? (
              <p className="rounded-lg bg-[#fbf0dc] px-3 py-2 text-sm text-[#7a4b00]">Invoice sent. Pay by bank transfer before the due date; the bank details are on the invoice.</p>
            ) : (
              <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-dark">
                {pay.status === "paid" ? "Paid. Thank you." : pay.status === "refunded" ? "Refunded in full." : "Paid, partly refunded."}
              </p>
            )}
            {pay.invoices.length > 0 && (
              <ul className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
                {pay.invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <a href={`/api/v1/organizations/${orgId}/invoices/${i.id}/pdf`} target="_blank" className="font-semibold text-brand hover:underline">
                      {i.kind === "credit_note" ? "Credit note" : "Invoice"} {i.number}
                    </a>
                    <span className="text-muted">{formatPaise(i.totalPaise)}{i.kind === "invoice" ? ` · ${i.status}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {pay.refunds.map((r) => (
              <p key={r.id} className="text-[13px] text-muted">
                Refund of {formatPaise(r.amountPaise)}: {r.status === "processed" ? `processed ${dayTime(r.processedAt)}` : r.status === "failed" ? "failed, our team will contact you" : "in progress"}
              </p>
            ))}
          </section>

          {!cancelled && !completed && (
            <section className="card flex flex-col gap-3 p-5">
              <h2 className="font-bold">Reschedule</h2>
              {pol.canReschedule ? (
                <form action={rescheduleAction} className="flex flex-col gap-3">
                  {hidden}
                  <div className="grid grid-cols-2 gap-3">
                    <Field id="date" label="New date">
                      <input id="date" name="date" type="date" defaultValue={current.date} required className="input" />
                    </Field>
                    <Field id="time" label="Time (IST)">
                      <input id="time" name="time" type="time" defaultValue={current.time} required className="input" />
                    </Field>
                  </div>
                  <Field id="reason" label="Note to the professional (optional)">
                    <input id="reason" name="reason" maxLength={500} className="input" />
                  </Field>
                  <button className="btn-outline">Reschedule</button>
                  <p className="text-[13px] text-muted">Please agree the new time with {d.name.split(" ")[0]} first. They&apos;re emailed straight away.</p>
                </form>
              ) : (
                <p className="text-sm text-muted">{pol.rescheduleBlockedReason}</p>
              )}
            </section>
          )}

          {pol.canCancel && (
            <details className="card p-5">
              <summary className="cursor-pointer font-bold text-[#9b2c1f]">Cancel booking</summary>
              <form action={cancelBookingAction} className="mt-3 flex flex-col gap-3">
                {hidden}
                {pol.cancelIsLate ? (
                  <p className="rounded-lg bg-[#fbe9e6] px-3 py-2 text-sm text-[#9b2c1f]">
                    The free-cancellation window has passed. {paid || pay.status === "invoiced" ? "The booking fee is not refunded." : "The professional is told straight away."}
                  </p>
                ) : (
                  <p className="text-sm text-muted">
                    You can cancel at no charge until {dayTime(pol.freeCancelUntil)}.{paid ? ` You'll get ${formatPaise(pay.price.totalPaise)} back.` : ""}
                  </p>
                )}
                <Field id="cancel-reason" label="Reason (shared with the professional)">
                  <textarea id="cancel-reason" name="reason" rows={2} required minLength={5} maxLength={500} className="input py-2" />
                </Field>
                <button className="btn-outline border-[#9b2c1f] text-[#9b2c1f]">Cancel this booking</button>
              </form>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}
