import type { Metadata } from "next";
import { Flash, PageTitle } from "@/components/ui";
import { MIN_PEOPLE, companyCredits, periodLabel } from "@/modules/marketplace/credits";
import { saveCreditsPolicyAction } from "../../actions";
import { getBuyerOrExit } from "../company";

export const metadata: Metadata = { title: "Wellness credits" };

const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
const STATUS: Record<string, string> = { due: "Waiting for payment", paid: "Paid", cancelled: "Cancelled" };

export default async function CompanyCredits({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId } = await params;
  const { me, org } = await getBuyerOrExit(orgId);
  const [c, sp] = await Promise.all([companyCredits(me.id, orgId), searchParams]);
  const p = c.policy;
  const allotted = c.current ? c.current.requiredPaise : 0;
  return (
    <>
      <PageTitle title="Wellness credits" subtitle={`A monthly allowance for everyone at ${org.name}, paid upfront. People spend it on verified professionals and gym, studio and wellness centre plans.`} />
      <Flash msg={sp.msg} error={sp.error} />

      {c.current && (
        <section className={`card flex flex-col gap-3 p-6 ${c.current.status === "due" ? "ring-2 ring-[#e0a32e]" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{periodLabel(c.current.period)}</h2>
            <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${c.current.status === "paid" ? "bg-brand-soft text-brand-dark" : "bg-meetup text-meetup-ink"}`}>{STATUS[c.current.status]}</span>
          </div>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            <div className="rounded-2xl bg-ground p-4"><dt className="text-[13px] text-muted">People</dt><dd className="font-display text-[24px] font-extrabold">{c.current.seats}</dd></div>
            <div className="rounded-2xl bg-ground p-4"><dt className="text-[13px] text-muted">Allowance each</dt><dd className="font-display text-[24px] font-extrabold">{rs(c.current.allowancePaise)}</dd></div>
            <div className="rounded-2xl bg-ground p-4"><dt className="text-[13px] text-muted">Unspent from before</dt><dd className="font-display text-[24px] font-extrabold">− {rs(c.current.carriedPaise)}</dd></div>
            <div className="rounded-2xl bg-ground p-4"><dt className="text-[13px] text-muted">{c.current.status === "due" ? "To pay now" : "Paid"}</dt><dd className="font-display text-[24px] font-extrabold">{rs(c.current.duePaise)}</dd></div>
          </dl>
          {c.current.status === "due" && (
            <div className="rounded-2xl bg-[#fff4dc] p-4 text-[14.5px] text-[#5c3a00]">
              <p className="font-semibold">Credits switch on for your team as soon as this payment arrives.</p>
              <p className="mt-1">Pay by bank transfer and quote <b>CREDITS-{c.current.period}-{org.name.slice(0, 12).toUpperCase().replace(/[^A-Z0-9]+/g, "")}</b> as the reference.{c.bankDetails ? "" : " Our team will send bank details by email."}</p>
              {c.bankDetails && <p className="mt-2 whitespace-pre-line font-mono text-[13px]">{c.bankDetails}</p>}
            </div>
          )}
        </section>
      )}

      {p?.active && c.current?.status === "paid" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">This month so far</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
            <div className="card p-4"><p className="text-[13px] text-muted">Credits given</p><p className="font-display text-[24px] font-extrabold">{rs(allotted)}</p></div>
            <div className="card p-4"><p className="text-[13px] text-muted">Spent</p><p className="font-display text-[24px] font-extrabold">{rs(c.usedPaise)}</p><p className="text-[12.5px] text-muted">{allotted ? Math.round((c.usedPaise / allotted) * 100) : 0}% of the month</p></div>
            <div className="card p-4"><p className="text-[13px] text-muted">People who used credits</p><p className="font-display text-[24px] font-extrabold">{c.activePeople}</p></div>
            <div className="card p-4"><p className="text-[13px] text-muted">Left in your pool</p><p className="font-display text-[24px] font-extrabold">{rs(Math.max(0, c.poolPaise))}</p><p className="text-[12.5px] text-muted">Reduces next month&apos;s payment</p></div>
          </div>
          <div className="card flex flex-col gap-3 p-5">
            <h3 className="font-bold">Spend by category</h3>
            {c.categories.map((x) => (
              <div key={x.category} className="flex flex-wrap items-center justify-between gap-2 text-[14.5px]">
                <span>{x.label}</span>
                <span className="font-semibold tabular-nums">{x.netPaise === null ? (x.people === 0 ? "—" : `Fewer than ${MIN_PEOPLE} people`) : rs(x.netPaise)}</span>
              </div>
            ))}
            <p className="text-[13px] text-muted">You see totals only, and a category&apos;s total only once {MIN_PEOPLE} or more people used it. Nobody at the company can see who booked which professional or place.</p>
          </div>
        </section>
      )}

      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-lg font-bold">Policy</h2>
        <form action={saveCreditsPolicyAction} className="flex flex-col gap-4">
          <input type="hidden" name="orgId" value={orgId} />
          <label className="flex max-w-[280px] flex-col gap-1.5 text-sm font-semibold">
            Monthly allowance per person (₹)
            <input name="allowance" type="number" min={0} step={100} required defaultValue={p ? p.allowancePaise / 100 : 2000} className="input" />
          </label>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-1 text-sm font-semibold">Credits can be spent on</legend>
            <label className="flex items-center gap-2.5 text-[15px]"><input type="checkbox" name="coverSessions" defaultChecked={p?.coverSessions ?? true} className="size-4 accent-[var(--color-brand)]" /> Wellness professionals (coaching, counselling, nutrition, physio)</label>
            <label className="flex items-center gap-2.5 text-[15px]"><input type="checkbox" name="coverFacilities" defaultChecked={p?.coverFacilities ?? true} className="size-4 accent-[var(--color-brand)]" /> Gym, studio and wellness centre plans</label>
            <label className="flex items-center gap-2.5 pl-6 text-[14px] text-muted"><input type="checkbox" name="partnersOnly" defaultChecked={p?.partnersOnly ?? true} className="size-4 accent-[var(--color-brand)]" /> Only places that are Moosam benefit partners</label>
            <label className="flex items-center gap-2.5 text-[15px] text-muted"><input type="checkbox" disabled className="size-4" /> Homestays (coming soon)</label>
          </fieldset>
          <label className="flex items-center gap-2.5 rounded-xl bg-ground px-4 py-3 text-[15px] font-semibold"><input type="checkbox" name="active" defaultChecked={p?.active ?? false} className="size-4 accent-[var(--color-brand)]" /> Credits are on for {org.name}</label>
          <p className="text-[13px] text-muted">Each month you pay upfront for everyone who is an active member, less anything still unspent. Unspent credits stay with the company; they don&apos;t carry over for each person. Moosam&apos;s fee ({c.feeBps / 100}%) is taken from the provider&apos;s share, not added to your bill.</p>
          <button className="btn-primary self-start">Save policy</button>
        </form>
      </section>

      {c.history.length > 1 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Payments</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
            {c.history.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-semibold">{periodLabel(f.period)}</span>
                <span className="text-muted">{f.seats} people · {rs(f.duePaise)}{f.reference ? ` · ref ${f.reference}` : ""}</span>
                <span>{STATUS[f.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
