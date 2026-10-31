import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { ACCESS_LABEL, PURPOSE_LABEL, quoteStay } from "@/modules/stays/service";
import { requestStayAction } from "@/app/stays/actions";
import { todayIst } from "@/modules/stays/policy";

const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export type StaySearch = { checkIn?: string; checkOut?: string; rooms?: string; guests?: string; error?: string };

/** Dates → live price and availability → request form (signed in) on a homestay page. */
export async function StayBooking({ orgId, slug, sp, minNights, maxRooms }: { orgId: string; slug: string; sp: StaySearch; minNights: number; maxRooms: number }) {
  const me = await getCurrentUser();
  const today = todayIst();
  const has = Boolean(sp.checkIn && sp.checkOut);
  const q = has ? await quoteStay(orgId, { checkIn: sp.checkIn!, checkOut: sp.checkOut!, rooms: sp.rooms || 1, guests: sp.guests || 1 }).catch(() => null) : null;
  const back = `/homestays/${slug}?${new URLSearchParams({ checkIn: sp.checkIn ?? "", checkOut: sp.checkOut ?? "", rooms: sp.rooms ?? "1", guests: sp.guests ?? "1" })}`;
  const field = "flex flex-col gap-1 text-[13px] font-semibold";
  return (
    <section aria-labelledby="book-h" className="flex flex-col gap-3">
      <h2 id="book-h" className="text-lg font-bold">Check dates</h2>
      <form method="get" className="grid grid-cols-2 gap-2">
        <label className={field}>Check-in<input name="checkIn" type="date" required min={today} defaultValue={sp.checkIn} className="input" /></label>
        <label className={field}>Check-out<input name="checkOut" type="date" required min={today} defaultValue={sp.checkOut} className="input" /></label>
        <label className={field}>Rooms<input name="rooms" type="number" min={1} max={Math.max(1, maxRooms)} defaultValue={sp.rooms ?? 1} className="input" /></label>
        <label className={field}>Guests<input name="guests" type="number" min={1} max={200} defaultValue={sp.guests ?? 1} className="input" /></label>
        <button className="btn-outline col-span-2">See price</button>
      </form>
      {minNights > 1 && <p className="text-[12.5px] text-muted">Minimum stay {minNights} nights.</p>}
      {sp.error && <p role="alert" className="rounded-lg bg-[#fbe9e6] px-3 py-2 text-sm text-[#9b2c1f]">{sp.error}</p>}
      {has && q && !q.ok && <p role="status" className="rounded-lg bg-[#fbf0dc] px-3 py-2 text-sm text-[#7a4b00]">{q.reason}</p>}
      {q?.ok && (
        <>
          <dl className="flex flex-col gap-1.5 rounded-xl bg-ground p-3 text-sm">
            <div className="flex justify-between gap-2"><dt>{q.nights} night{q.nights > 1 ? "s" : ""} × {q.price.rooms} room{q.price.rooms > 1 ? "s" : ""}</dt><dd>{rs(q.price.subtotalPaise)}</dd></div>
            {q.price.gstParts.map((g) => (
              <div key={g.rateBps} className="flex justify-between gap-2 text-muted"><dt>GST {g.rateBps / 100}%</dt><dd>{rs(g.gstPaise)}</dd></div>
            ))}
            <div className="flex justify-between gap-2 border-t border-line pt-1.5 font-bold"><dt>Total</dt><dd>{rs(q.price.totalPaise)}</dd></div>
          </dl>
          <p className="text-[12.5px] text-muted"><span className="font-semibold text-ink">{q.policyText.name} cancellation.</span> {q.policyText.text}</p>
          {me ? (
            <form action={requestStayAction} className="flex flex-col gap-2.5">
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="back" value={back} />
              {(["checkIn", "checkOut", "rooms", "guests"] as const).map((k) => <input key={k} type="hidden" name={k} value={sp[k] ?? ""} />)}
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-[13px] font-semibold">Reason for the stay</legend>
                {Object.entries(PURPOSE_LABEL).map(([k, v], i) => (
                  <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="purpose" value={k} defaultChecked={i === 1} required className="accent-brand" />{v}</label>
                ))}
              </fieldset>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-[13px] font-semibold">Anything the host should prepare? (optional)</legend>
                {Object.entries(ACCESS_LABEL).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name="accessNeeds" value={k} className="size-4 accent-brand" />{v}</label>
                ))}
              </fieldset>
              <label className={field}>Message to the host (optional)
                <textarea name="message" rows={2} maxLength={600} className="input py-2" placeholder="Arrival time, who's coming" />
              </label>
              <p className="text-[12px] text-muted">Please don&apos;t share medical details. Hosts only need your dates and what to prepare.</p>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-brand">Invoice in a company&apos;s name?</summary>
                <div className="mt-2 flex flex-col gap-2">
                  <label className={field}>Name on invoice<input name="billingName" maxLength={120} className="input" /></label>
                  <label className={field}>GSTIN<input name="billingGstin" maxLength={15} className="input uppercase" /></label>
                </div>
              </details>
              <button className="btn-primary">Request to book</button>
              <p className="text-[12px] text-muted">You won&apos;t be charged now. If the host accepts, you&apos;ll have 48 hours to pay.</p>
            </form>
          ) : (
            <Link href={`/?next=${encodeURIComponent(back)}`} className="btn-primary">Sign in to request</Link>
          )}
        </>
      )}
    </section>
  );
}
