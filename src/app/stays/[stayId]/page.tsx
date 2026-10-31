import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { BRAND } from "@/lib/brand";
import { getCurrentUser } from "@/modules/identity/session";
import { ACCESS_LABEL, getMyStay, PURPOSE_LABEL, STAY_STATUS_LABEL } from "@/modules/stays/service";
import { Badge, Flash } from "@/components/ui";
import { cancelStayAction } from "../actions";
import { PayStay } from "../pay-stay";
import { tone } from "../tone";

const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dd = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const dt = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d) : "");

export default async function StayPage({ params, searchParams }: { params: Promise<{ stayId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ stayId }, sp] = await Promise.all([params, searchParams]);
  const d = await getMyStay(me.id, stayId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const s = d.stay;
  const h = d.homestay;
  const canPay = s.status === "accepted" && s.paymentStatus === "unpaid";
  return (
    <>
      <Link href="/stays" className="text-sm font-semibold text-brand hover:underline">← My stays</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[30px] font-extrabold leading-tight">{h?.name ?? "Homestay"}</h1>
          <span className="text-[15px] text-muted">{dd(s.checkIn)} → {dd(s.checkOut)} · {s.nights} night{s.nights > 1 ? "s" : ""} · {s.rooms} room{s.rooms > 1 ? "s" : ""} · {s.guests} guest{s.guests > 1 ? "s" : ""}</span>
        </div>
        <Badge status={tone[s.status]} label={STAY_STATUS_LABEL[s.status]} />
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <div className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[999_1_480px] flex-col gap-4 p-6">
          {s.status === "requested" && <p className="text-[15px]">Waiting for the host to answer, by {dt(s.respondBy)}. You won&apos;t be charged unless they accept and you pay.</p>}
          {canPay && <p className="text-[15px]">The host accepted. Pay by <span className="font-semibold">{dt(s.payBy)}</span> to confirm; the rooms are held for you until then.</p>}
          {s.status === "confirmed" && h && <p className="text-[15px]">You&apos;re booked. Check-in from {h.checkInTime}, check-out by {h.checkOutTime}.</p>}
          {s.status === "declined" && <p className="text-[15px]">The host couldn&apos;t take this booking{s.hostNote ? `: “${s.hostNote}”` : "."} You weren&apos;t charged.</p>}
          {s.status === "expired" && <p className="text-[15px]">This request lapsed. You weren&apos;t charged.</p>}
          {s.status === "cancelled" && <p className="text-[15px]">Cancelled by {s.cancelledByHost ? "the host" : "you"}{s.cancelReason ? `: “${s.cancelReason}”` : "."}</p>}
          {s.hostNote && s.status !== "declined" && <p className="rounded-xl bg-ground px-4 py-3 text-sm">Note from the host: {s.hostNote}</p>}
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15px]">
            <dt className="text-muted">Reason</dt><dd>{PURPOSE_LABEL[s.purpose]}</dd>
            {s.accessNeeds.length > 0 && <><dt className="text-muted">Asked for</dt><dd>{s.accessNeeds.map((a) => ACCESS_LABEL[a as keyof typeof ACCESS_LABEL]).join(", ")}</dd></>}
            {s.message && <><dt className="text-muted">Your message</dt><dd>{s.message}</dd></>}
            <dt className="text-muted">Cancellation</dt><dd>{d.policyText.name}: {d.policyText.text}</dd>
          </dl>
          {h && <Link href={`/homestays/${h.slug}`} className="text-sm font-semibold text-brand hover:underline">View the homestay</Link>}
        </section>

        <aside className="flex flex-[1_1_300px] flex-col gap-4">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="font-bold">Price</h2>
            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between"><dt>Room charges</dt><dd>{rs(s.subtotalPaise)}</dd></div>
              {s.gstParts.map((g) => <div key={g.rateBps} className="flex justify-between text-muted"><dt>GST {g.rateBps / 100}%</dt><dd>{rs(g.gstPaise)}</dd></div>)}
              <div className="flex justify-between border-t border-line pt-1.5 font-bold"><dt>Total</dt><dd>{rs(s.totalPaise)}</dd></div>
              {s.refundedPaise > 0 && <div className="flex justify-between text-brand-dark"><dt>Refunded</dt><dd>{rs(s.refundedPaise)}</dd></div>}
            </dl>
            {canPay && (d.money.online ? (
              <PayStay stayId={s.id} label={`Pay ${rs(s.totalPaise)}`} brand={BRAND.name} description={`${h?.name ?? "Stay"}, ${s.nights} night${s.nights > 1 ? "s" : ""}`} />
            ) : (
              <p className="rounded-lg bg-[#fbf0dc] px-3 py-2 text-sm text-[#7a4b00]">Online payment isn&apos;t switched on yet. Please try again later.</p>
            ))}
            {d.money.refunds.filter((r) => r.status !== "processed").map((r) => (
              <p key={r.id} className="text-[13px] text-muted">Refund of {rs(r.amountPaise)} {r.status === "failed" ? "needs attention; our team will contact you" : "is on its way"}.</p>
            ))}
          </section>
          {d.money.invoices.length > 0 && (
            <section className="card flex flex-col gap-2 p-5">
              <h2 className="font-bold">Invoices</h2>
              {d.money.invoices.map((i) => (
                <a key={i.id} href={`/stays/${s.id}/invoices/${i.id}`} className="flex justify-between gap-2 text-sm text-brand hover:underline">
                  <span>{i.kind === "credit_note" ? "Credit note" : "Tax invoice"} {i.number}</span><span>{rs(i.totalPaise)}</span>
                </a>
              ))}
            </section>
          )}
          {d.cancel.allowed && (
            <details className="card p-5">
              <summary className="cursor-pointer font-semibold text-[#9b2c1f]">Cancel this stay</summary>
              <p className="mt-2 text-sm">{s.paymentStatus === "unpaid" ? "You haven't paid, so there's nothing to refund." : d.cancel.amountPaise > 0 ? `You'll get ${rs(d.cancel.amountPaise)} back under the ${d.policyText.name.toLowerCase()} policy.` : "Under the cancellation policy, there's no refund at this point."}</p>
              <form action={cancelStayAction} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="stayId" value={s.id} />
                <label className="flex flex-col gap-1 text-sm font-semibold">Reason<input name="reason" required minLength={5} maxLength={400} className="input" /></label>
                <button className="btn-outline text-[#9b2c1f]">Cancel stay</button>
              </form>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}
