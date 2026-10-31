import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";
import { getListingWorkspace } from "@/modules/listings/service";
import { ACCESS_LABEL, listHostStays, PURPOSE_LABEL, STAY_STATUS_LABEL } from "@/modules/stays/service";
import { Badge, Flash } from "@/components/ui";
import { hostCancelStayAction, respondStayAction } from "../../actions";

export const metadata: Metadata = { title: "Bookings" };
const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
const dd = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const dt = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d) : "");
const tone: Record<string, string> = { requested: "pending", accepted: "info_requested", confirmed: "confirmed", completed: "completed", declined: "declined", expired: "closed", cancelled: "cancelled" };

type Row = Awaited<ReturnType<typeof listHostStays>>["requests"][number];

export default async function Bookings({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const w = await getListingWorkspace(me.id, orgId);
  if (w.listing.kind !== "homestay") notFound();
  const d = await listHostStays(me.id, orgId);
  const hidden = (id: string) => (
    <>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="stayId" value={id} />
    </>
  );
  const card = (s: Row, actions?: React.ReactNode) => (
    <article key={s.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{s.guestFirstName}</span>
            <span className="rounded-full bg-ground px-2.5 py-0.5 text-xs font-semibold">{PURPOSE_LABEL[s.purpose]}</span>
            <Badge status={tone[s.status]} label={STAY_STATUS_LABEL[s.status]} />
          </span>
          <span className="text-[14px]">{dd(s.checkIn)} → {dd(s.checkOut)} · {s.nights} night{s.nights > 1 ? "s" : ""} · {s.rooms} room{s.rooms > 1 ? "s" : ""} · {s.guests} guest{s.guests > 1 ? "s" : ""}</span>
          {s.accessNeeds.length > 0 && <span className="text-[13.5px] text-muted">Needs: {s.accessNeeds.map((a) => ACCESS_LABEL[a as keyof typeof ACCESS_LABEL]).join(", ")}</span>}
          {s.message && <span className="text-[14px] text-[#3d4842]">“{s.message}”</span>}
          {s.status === "requested" && <span className="text-[13px] font-semibold text-[#7a4b00]">Answer by {dt(s.respondBy)}</span>}
          {s.status === "accepted" && <span className="text-[13px] text-muted">Guest pays by {dt(s.payBy)}; rooms held until then</span>}
          {s.status === "cancelled" && <span className="text-[13px] text-muted">Cancelled by {s.cancelledByHost ? "you" : "the guest"}{s.cancelReason ? `: ${s.cancelReason}` : ""}</span>}
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="font-bold">{rs(s.subtotalPaise)}</span>
          <span className="text-[12.5px] text-muted">{s.paymentStatus === "unpaid" ? `Your share ${rs(s.payablePaise)} once paid` : `Your share ${rs(s.hostSharePaise)}`}</span>
        </div>
      </div>
      {actions}
    </article>
  );
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">Bookings</h1>
        <p className="text-[15px] text-muted">Guests share their dates, who&apos;s coming and any access needs, never medical details. Your share is the room charges minus our commission; it&apos;s paid to your bank after check-in.</p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <section aria-labelledby="req-h" className="flex flex-col gap-3">
        <h2 id="req-h" className="text-lg font-bold">Requests to answer ({d.requests.length})</h2>
        {d.requests.length === 0 && <p className="card p-5 text-sm text-muted">No new requests.</p>}
        {d.requests.map((s) =>
          card(
            s,
            d.canEdit && (
              <form action={respondStayAction} className="flex flex-wrap items-end gap-2">
                {hidden(s.id)}
                <label className="flex flex-[1_1_240px] flex-col gap-1 text-sm font-semibold">Note to the guest (optional)<input name="note" maxLength={400} className="input" /></label>
                <button name="accept" value="1" className="btn-primary">Accept</button>
                <button name="accept" value="0" className="btn-outline">Decline</button>
              </form>
            ),
          ),
        )}
      </section>

      {d.awaitingPayment.length > 0 && (
        <section aria-labelledby="pay-h" className="flex flex-col gap-3">
          <h2 id="pay-h" className="text-lg font-bold">Waiting for payment</h2>
          {d.awaitingPayment.map((s) => card(s))}
        </section>
      )}

      <section aria-labelledby="up-h" className="flex flex-col gap-3">
        <h2 id="up-h" className="text-lg font-bold">Upcoming</h2>
        {d.upcoming.length === 0 && <p className="card p-5 text-sm text-muted">No confirmed stays yet.</p>}
        {d.upcoming.map((s) =>
          card(
            s,
            d.canEdit && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-[#9b2c1f]">Cancel this stay</summary>
                <form action={hostCancelStayAction} className="mt-2 flex flex-wrap items-end gap-2">
                  {hidden(s.id)}
                  <label className="flex flex-[1_1_280px] flex-col gap-1 text-sm font-semibold">Reason (shared with the guest)<input name="reason" required minLength={5} maxLength={400} className="input" /></label>
                  <button className="btn-outline text-[#9b2c1f]">Cancel and refund in full</button>
                </form>
              </details>
            ),
          ),
        )}
      </section>

      {d.past.length > 0 && (
        <section aria-labelledby="past-h" className="flex flex-col gap-3">
          <h2 id="past-h" className="text-lg font-bold">Past and closed</h2>
          {d.past.map((s) => card(s))}
        </section>
      )}
    </>
  );
}
