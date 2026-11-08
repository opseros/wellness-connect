import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { CATEGORY_LABEL, myCreditHistory, myWallets, periodLabel, type CreditCategory } from "@/modules/marketplace/credits";
import { plusFor } from "@/modules/platform/plus";

export const metadata: Metadata = { title: "My benefits" };
const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
const day = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);

export default async function BenefitsPage() {
  const me = (await getCurrentUser())!;
  const [wallets, history, plus] = await Promise.all([myWallets(me.id), myCreditHistory(me.id), plusFor(me.id)]);
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[30px] leading-[1.05] font-extrabold tracking-[-0.02em]">My benefits <span className="tag-new ml-1 align-[0.35em]">New</span></h1>
        <p className="text-[15px] text-muted">Wellness credits from your employer. Spend them on covered sessions and gym or studio plans; they reset on the 1st of each month.</p>
      </header>
      {wallets.length === 0 ? (
        <div className="card flex flex-col gap-2 p-6">
          <p className="font-semibold">No wellness credits yet</p>
          <p className="text-sm text-muted">When your company switches on Moosam wellness credits, your monthly allowance shows here. You can still book anything in Explore and pay yourself.</p>
          <Link href="/explore" className="btn-primary mt-2 self-start rounded-full">Explore</Link>
        </div>
      ) : (
        wallets.map((w) => (
          <section key={w.orgId} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3 rounded-[22px] bg-[linear-gradient(140deg,#0f6b5c_0%,#0b4f44_100%)] p-6 text-white">
              <span className="text-[13px] text-white/80">{w.orgName} · {periodLabel(w.period)}</span>
              <span className="font-display text-[40px] leading-none font-extrabold">{rs(w.availablePaise)}</span>
              <span aria-hidden className="h-2 overflow-hidden rounded-full bg-white/25"><span className="block h-full rounded-full bg-[#f2c46d]" style={{ width: `${Math.min(100, (w.usedPaise / Math.max(1, w.allowancePaise)) * 100)}%` }} /></span>
              <span className="text-[13px] text-white/85">{rs(w.usedPaise)} of {rs(w.allowancePaise)} used this month</span>
              {!w.funded && <span className="rounded-xl bg-white/15 px-3 py-2 text-[13px]">Your company hasn&apos;t paid for this month yet. Credits switch on as soon as it does.</span>}
              <Link href="/explore" className="btn mt-1 self-start rounded-full bg-white text-ink hover:bg-[#f7f3ec]">Find covered options</Link>
            </div>
            <div className="card flex flex-col gap-3 p-6">
              <h2 className="font-bold">What your credits cover</h2>
              {(Object.keys(CATEGORY_LABEL) as CreditCategory[]).map((c) => (
                <div key={c} className="flex items-center justify-between gap-3 text-[15px]">
                  <span>{CATEGORY_LABEL[c]}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${w.covers[c] ? "bg-brand-soft text-brand-dark" : "bg-ground text-muted"}`}>{w.covers[c] ? "Covered" : "Not covered"}</span>
                </div>
              ))}
              {w.covers.facilities && w.partnersOnly && <p className="text-[13px] text-muted">Gyms and studios must be Moosam benefit partners.</p>}
              <p className="mt-auto rounded-xl bg-[#e3ecf5] px-3 py-2 text-[13px] text-[#163a5a]">{w.orgName} sees totals by category only, never which professional or place you booked.</p>
            </div>
          </section>
        ))
      )}
      {plus && (
        <Link href="/plus" className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white px-5 py-4 ring-1 ring-line hover:ring-[#0f6b5c]/40">
          <span className="flex flex-col">
            <span className="text-[13px] font-semibold text-brand">Moosam Plus{plus.preview ? " (preview)" : ""}</span>
            <span className="font-semibold">Early access to retreats and events, priority buddy matching. ₹{(plus.pricePaise / 100).toLocaleString("en-IN")} a month.</span>
          </span>
          <span className="text-sm font-semibold text-brand">{plus.joined ? "On the waitlist" : "Learn more →"}</span>
        </Link>
      )}
      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Your credit activity</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>{h.type === "refund" ? "Returned" : "Spent"} · {h.category ? CATEGORY_LABEL[h.category as CreditCategory] : ""}</span>
                <span className="text-muted">{day(h.createdAt)}</span>
                <span className={`font-semibold tabular-nums ${h.type === "refund" ? "text-brand-dark" : ""}`}>{h.type === "refund" ? "+" : "−"}{rs(h.amountPaise)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
