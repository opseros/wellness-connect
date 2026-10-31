import type { Metadata } from "next";
import { getStaffOrExit, when } from "../staff";
import { adminFinance, adminStayFinance } from "@/modules/admin/service";
import { STATE_NAMES } from "@/modules/marketplace/service";
import { formatPaise } from "@/lib/money";
import { Badge, Flash, PageTitle, Table } from "../ui";
import { categoryCommissionAction, financeSettingsAction, markInvoicePaidAction, markRefundSentAction, recordPayoutAction, recordStayPayoutAction } from "../actions";

export const metadata: Metadata = { title: "Finance" };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export default async function Finance({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const [sp, d] = await Promise.all([searchParams, adminFinance(me)]);
  const st = await adminStayFinance(me);
  const so = st.overview;
  const stayOk = so.balanced && so.paymentsMatchLedger && so.mismatchedStays.length === 0;
  const { overview: o, queues: q, settings: s, categories } = d;
  const isSuper = me.platformRole === "super_admin";
  const setupMissing = !s.sellerName || !s.sellerGstin || !s.bankDetails;
  const stats = [
    { label: "Collected", v: o.collectedPaise },
    { label: "Refunded", v: o.refundedPaise },
    { label: "GST collected", v: o.gstPaise },
    { label: "Commission earned", v: o.commissionPaise },
    { label: "Paid out to professionals", v: o.paidOutPaise },
    { label: "Owed to professionals", v: o.outstandingPayablePaise },
  ];
  const ok = o.balanced && o.paymentsMatchLedger && o.mismatchedBookings.length === 0;

  return (
    <>
      <PageTitle title="Finance" subtitle="Payments, invoices, refunds and payouts. All amounts include GST where it applies." />
      <Flash msg={sp.msg} error={sp.error} />
      <p className={`rounded-xl px-4 py-3 text-sm ${ok ? "bg-brand-soft text-brand-dark" : "bg-[#fbe9e6] text-[#9b2c1f]"}`}>
        {ok
          ? "Ledger reconciles: collected − refunded = GST + commission + professionals' share, to the paisa, and payments match the ledger."
          : `Ledger does not reconcile. Bookings to check: ${o.mismatchedBookings.map((m) => `${m.bookingId.slice(0, 8)} (${formatPaise(m.diffPaise)})`).join(", ") || "totals differ"}.`}
      </p>
      {setupMissing && (
        <p className="rounded-xl bg-[#fbf0dc] px-4 py-3 text-sm text-[#7a4b00]">
          Add your legal name, GSTIN and bank details in <a href="#settings" className="font-semibold underline">settings</a> before issuing real invoices.
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {stats.map((x) => (
          <div key={x.label} className="card flex flex-col gap-1 p-4">
            <span className="text-[13px] text-muted">{x.label}</span>
            <span className="text-xl font-bold">{formatPaise(x.v)}</span>
          </div>
        ))}
      </div>

      <section id="invoices" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Invoices awaiting payment</h2>
        <Table head={["Invoice", "Company", "Amount", "Due", isSuper ? "Bank transfer received" : ""]} empty={q.unpaidInvoices.length === 0 && "No unpaid invoices."}>
          {q.unpaidInvoices.map(({ invoice: i, orgName }) => (
            <tr key={i.id}>
              <td><a href={`/admin/finance/invoices/${i.id}/pdf`} target="_blank" className="font-semibold text-brand hover:underline">{i.number}</a></td>
              <td>{orgName}</td>
              <td className="whitespace-nowrap">{formatPaise(i.totalPaise)}</td>
              <td className="whitespace-nowrap">{when(i.dueAt)}</td>
              <td>
                {isSuper && (
                  <form action={markInvoicePaidAction} className="flex gap-2">
                    <input type="hidden" name="invoiceId" value={i.id} />
                    <label htmlFor={`utr-${i.id}`} className="sr-only">Bank reference</label>
                    <input id={`utr-${i.id}`} name="reference" required minLength={4} placeholder="UTR / reference" className="input h-9 min-h-9 w-40 text-sm" />
                    <button className="btn-outline min-h-9 px-3 text-sm">Mark paid</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section id="refunds" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Refunds in progress</h2>
        <Table head={["Company", "Amount", "How", "Status", "Requested", ""]} empty={q.refunds.length === 0 && "No refunds waiting."}>
          {q.refunds.map(({ refund: r, orgName }) => (
            <tr key={r.id}>
              <td>{orgName}<br /><span className="text-[13px] text-muted">{r.reason}</span></td>
              <td className="whitespace-nowrap">{formatPaise(r.amountPaise)}</td>
              <td>{r.provider === "razorpay" ? "Razorpay (automatic)" : "Bank transfer"}</td>
              <td><Badge status={r.status === "failed" ? "rejected" : "pending"} label={r.status} />{r.failureReason && <span className="block text-[13px] text-muted">{r.failureReason}</span>}</td>
              <td className="whitespace-nowrap">{when(r.createdAt)}</td>
              <td>
                {isSuper && r.provider === "manual" && r.status === "pending" && (
                  <form action={markRefundSentAction} className="flex gap-2">
                    <input type="hidden" name="refundId" value={r.id} />
                    <label htmlFor={`ref-${r.id}`} className="sr-only">Bank reference</label>
                    <input id={`ref-${r.id}`} name="reference" required minLength={4} placeholder="UTR / reference" className="input h-9 min-h-9 w-40 text-sm" />
                    <button className="btn-outline min-h-9 px-3 text-sm">Mark sent</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section id="payables" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Owed to professionals</h2>
        <Table head={["Booking", "Professional", "Session", "Owed", isSuper ? "Record payout" : ""]} empty={q.payables.length === 0 && "Nothing owed right now."}>
          {q.payables.map((p) => (
            <tr key={p.booking.id}>
              <td>{p.title}<br /><span className="text-[13px] text-muted">{p.orgName}</span></td>
              <td>{p.proName}<br /><span className="text-[13px] text-muted">{p.proEmail}</span></td>
              <td className="whitespace-nowrap">
                {when(p.booking.scheduledStart)}
                <br />
                <Badge status={p.booking.status === "completed" ? "completed" : p.booking.status === "cancelled" ? "cancelled" : "pending"} label={p.booking.status === "pending" || p.booking.status === "confirmed" ? "upcoming" : p.booking.status} />
              </td>
              <td className="whitespace-nowrap font-semibold">{formatPaise(p.outstandingPaise)}</td>
              <td>
                {isSuper && (
                  <form action={recordPayoutAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="bookingId" value={p.booking.id} />
                    <label className="sr-only" htmlFor={`amt-${p.booking.id}`}>Amount in rupees</label>
                    <input id={`amt-${p.booking.id}`} name="amount" type="number" step="0.01" min="0.01" defaultValue={p.outstandingPaise / 100} className="input h-9 min-h-9 w-28 text-sm" />
                    <label className="sr-only" htmlFor={`utr2-${p.booking.id}`}>Bank reference</label>
                    <input id={`utr2-${p.booking.id}`} name="reference" required minLength={4} placeholder="UTR" className="input h-9 min-h-9 w-28 text-sm" />
                    <label className="sr-only" htmlFor={`on-${p.booking.id}`}>Paid on</label>
                    <input id={`on-${p.booking.id}`} name="paidOn" type="date" defaultValue={today()} className="input h-9 min-h-9 w-36 text-sm" />
                    <button className="btn-outline min-h-9 px-3 text-sm">Record</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <p className="text-[13px] text-muted">Pay professionals after the session, from your bank, then record the transfer here. Their share is the fee minus commission.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Recent payments</h2>
        <Table head={["Company", "Amount", "Method", "Status", "Created"]} empty={q.recentPayments.length === 0 && "No payments yet."}>
          {q.recentPayments.map(({ payment: p, orgName }) => (
            <tr key={p.id}>
              <td>{orgName}</td>
              <td className="whitespace-nowrap">{formatPaise(p.amountPaise)}</td>
              <td>{p.provider === "razorpay" ? `Razorpay${p.method ? ` (${p.method})` : ""}` : "Bank transfer"}<br /><span className="text-[13px] text-muted">{p.providerPaymentId ?? p.reference ?? p.providerOrderId ?? ""}</span></td>
              <td><Badge status={p.status === "paid" ? "active" : p.status === "pending" ? "pending" : p.status === "failed" ? "rejected" : "closed"} label={p.status.replace("_", " ")} />{p.failureReason && <span className="block text-[13px] text-muted">{p.failureReason}</span>}</td>
              <td className="whitespace-nowrap">{when(p.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </section>

      <section id="stays" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Homestay stays</h2>
        <p className={`rounded-xl px-4 py-3 text-sm ${stayOk ? "bg-brand-soft text-brand-dark" : "bg-[#fbe9e6] text-[#9b2c1f]"}`}>
          {stayOk
            ? "Stay ledger reconciles: collected − refunded = GST + commission + hosts' share, and payments match the ledger."
            : `Stay ledger does not reconcile. Stays to check: ${so.mismatchedStays.map((m) => `${m.stayId.slice(0, 8)} (${formatPaise(m.diffPaise)})`).join(", ") || "totals differ"}.`}
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          {[
            { label: "Collected from guests", v: so.collectedPaise },
            { label: "Refunded to guests", v: so.refundedPaise },
            { label: "GST on stays", v: so.gstPaise },
            { label: "Commission on stays", v: so.commissionPaise },
            { label: "Paid out to hosts", v: so.paidOutPaise },
            { label: "Owed to hosts", v: so.outstandingPayablePaise },
          ].map((x) => (
            <div key={x.label} className="card flex flex-col gap-1 p-4">
              <span className="text-[13px] text-muted">{x.label}</span>
              <span className="text-xl font-bold">{formatPaise(x.v)}</span>
            </div>
          ))}
        </div>
        {st.queues.refunds.length > 0 && (
          <Table head={["Host", "Refund", "Reason", "Status", "Created"]}>
            {st.queues.refunds.map(({ refund: r, hostName }) => (
              <tr key={r.id}>
                <td>{hostName}</td>
                <td className="whitespace-nowrap">{formatPaise(r.amountPaise)}</td>
                <td>{r.reason}</td>
                <td><Badge status={r.status === "failed" ? "rejected" : "pending"} label={r.status} />{r.failureReason && <span className="block text-[13px] text-muted">{r.failureReason}</span>}</td>
                <td className="whitespace-nowrap">{when(r.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
        <Table head={["Host", "Stay", "Owed", isSuper ? "Record payout" : ""]} empty={st.queues.payables.length === 0 && "Nothing owed to hosts right now. Hosts become payable after check-in."}>
          {st.queues.payables.map((p) => (
            <tr key={p.stay.id}>
              <td>{p.hostName}</td>
              <td className="whitespace-nowrap">{p.stay.checkIn} → {p.stay.checkOut}<br /><span className="text-[13px] text-muted">{p.guestName.split(" ")[0]} · {p.stay.nights} night{p.stay.nights > 1 ? "s" : ""}</span></td>
              <td className="whitespace-nowrap font-semibold">{formatPaise(p.outstandingPaise)}</td>
              <td>
                {isSuper && (
                  <form action={recordStayPayoutAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="stayId" value={p.stay.id} />
                    <label className="sr-only" htmlFor={`samt-${p.stay.id}`}>Amount in rupees</label>
                    <input id={`samt-${p.stay.id}`} name="amount" type="number" step="0.01" min="0.01" defaultValue={p.outstandingPaise / 100} className="input h-9 min-h-9 w-28 text-sm" />
                    <label className="sr-only" htmlFor={`sutr-${p.stay.id}`}>Bank reference</label>
                    <input id={`sutr-${p.stay.id}`} name="reference" required minLength={4} placeholder="UTR" className="input h-9 min-h-9 w-28 text-sm" />
                    <label className="sr-only" htmlFor={`son-${p.stay.id}`}>Paid on</label>
                    <input id={`son-${p.stay.id}`} name="paidOn" type="date" defaultValue={today()} className="input h-9 min-h-9 w-36 text-sm" />
                    <button className="btn-outline min-h-9 px-3 text-sm">Record</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <p className="text-[13px] text-muted">Guests pay online; refunds go back automatically through Razorpay. Pay hosts from your bank after check-in, then record the transfer.</p>
      </section>

      <section id="settings" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Settings</h2>
        <form action={financeSettingsAction} className="card flex flex-col gap-4 p-6">
          <fieldset disabled={!isSuper} className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <F id="commission" label="Default commission (%)" hint="Taken from the professional's fee."><input id="commission" name="commission" type="number" step="0.01" min="0" max="50" defaultValue={s.commissionBps / 100} className="input" /></F>
            <F id="gst" label="GST on the session fee (%)"><input id="gst" name="gst" type="number" step="0.01" min="0" max="28" defaultValue={s.gstBps / 100} className="input" /></F>
            <F id="lateRefund" label="Refund on late cancellation (%)" hint="Inside the free-cancellation window."><input id="lateRefund" name="lateRefund" type="number" step="1" min="0" max="100" defaultValue={s.lateCancelRefundBps / 100} className="input" /></F>
            <F id="terms" label="Invoice payment terms (days)"><input id="terms" name="terms" type="number" min="0" max="60" defaultValue={s.paymentTermsDays} className="input" /></F>
            <F id="sellerName" label="Legal name on invoices"><input id="sellerName" name="sellerName" defaultValue={s.sellerName} required className="input" /></F>
            <F id="sellerGstin" label="Your GSTIN"><input id="sellerGstin" name="sellerGstin" defaultValue={s.sellerGstin} maxLength={15} className="input uppercase" /></F>
            <F id="sellerStateCode" label="State of registration">
              <select id="sellerStateCode" name="sellerStateCode" defaultValue={s.sellerStateCode} className="input">
                {Object.entries(STATE_NAMES).map(([c, n]) => (
                  <option key={c} value={c}>{c} · {n}</option>
                ))}
              </select>
            </F>
            <F id="sacCode" label="SAC code" hint="Confirm with your CA."><input id="sacCode" name="sacCode" defaultValue={s.sacCode} className="input" /></F>
            <F id="stayCommission" label="Homestay commission (%)" hint="Taken from the host's room charges."><input id="stayCommission" name="stayCommission" type="number" step="0.01" min="0" max="50" defaultValue={s.stayCommissionBps / 100} className="input" /></F>
            <F id="stayGstLow" label="GST on rooms up to the threshold (%)"><input id="stayGstLow" name="stayGstLow" type="number" step="0.01" min="0" max="28" defaultValue={s.stayGstLowBps / 100} className="input" /></F>
            <F id="stayGstHigh" label="GST on rooms above it (%)"><input id="stayGstHigh" name="stayGstHigh" type="number" step="0.01" min="0" max="28" defaultValue={s.stayGstHighBps / 100} className="input" /></F>
            <F id="stayThreshold" label="Room tariff threshold (₹ per night)" hint="₹7,500 since 22 Sep 2025. Confirm with your CA."><input id="stayThreshold" name="stayThreshold" type="number" step="1" min="0" defaultValue={s.stayGstThresholdPaise / 100} className="input" /></F>
            <F id="staySac" label="SAC code for stays"><input id="staySac" name="staySac" defaultValue={s.staySacCode} className="input" /></F>
            <F id="invoicePrefix" label="Invoice number prefix" hint="Stay invoices use the same prefix plus S."><input id="invoicePrefix" name="invoicePrefix" defaultValue={s.invoicePrefix} className="input uppercase" /></F>
          </fieldset>
          <fieldset disabled={!isSuper} className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
            <F id="sellerAddress" label="Registered address"><textarea id="sellerAddress" name="sellerAddress" rows={3} defaultValue={s.sellerAddress} className="input py-2" /></F>
            <F id="bankDetails" label="Bank details printed on unpaid invoices"><textarea id="bankDetails" name="bankDetails" rows={3} defaultValue={s.bankDetails} className="input py-2" placeholder={"Account name\nAccount number\nIFSC"} /></F>
          </fieldset>
          {isSuper ? <button className="btn-primary self-start">Save settings</button> : <p className="text-sm text-muted">Only a super admin can change finance settings.</p>}
          <p className="text-[13px] text-muted">Changes apply to bookings priced after you save; existing bookings keep their price. Last updated {when(s.updatedAt)}.</p>
        </form>
        <div className="card flex flex-col gap-2 p-6">
          <h3 className="font-bold">Commission by category</h3>
          <ul className="flex flex-col divide-y divide-line">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span>{c.name} <span className="text-muted">· {c.commissionBps == null ? `default (${s.commissionBps / 100}%)` : `${c.commissionBps / 100}%`}</span></span>
                {isSuper && (
                  <form action={categoryCommissionAction} className="flex gap-2">
                    <input type="hidden" name="categoryId" value={c.id} />
                    <label className="sr-only" htmlFor={`cc-${c.id}`}>Commission for {c.name}</label>
                    <input id={`cc-${c.id}`} name="percent" type="number" step="0.01" min="0" max="50" defaultValue={c.commissionBps == null ? "" : c.commissionBps / 100} placeholder="Default" className="input h-9 min-h-9 w-24 text-sm" />
                    <button className="btn-outline min-h-9 px-3 text-sm">Save</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

function F({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {hint && <p className="text-[12.5px] text-muted">{hint}</p>}
    </div>
  );
}
