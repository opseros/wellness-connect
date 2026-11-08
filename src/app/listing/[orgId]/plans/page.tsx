import type { Metadata } from "next";
import { Flash } from "@/components/ui";
import { getCurrentUser } from "@/modules/identity/session";
import { PLAN_KIND_LABEL, listOwnPlans, type PlanKind } from "@/modules/listings/plans";
import { PLAN_KINDS } from "@/db/schema";
import { addPlanAction, setBenefitPartnerAction, setPlanActiveAction } from "../../actions";
import { facilityMonthStats } from "@/modules/marketplace/credits";

export const metadata: Metadata = { title: "Plans & passes" };
const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

export default async function PlansPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const [{ plans, benefitPartner }, stats] = await Promise.all([listOwnPlans(me.id, orgId), facilityMonthStats(me.id, orgId)]);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[30px] leading-[1.05] font-extrabold tracking-[-0.02em]">Plans & passes</h1>
        <p className="text-muted">Sell memberships, class packs and day passes on your Moosam page.</p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <div className="card p-4"><dt className="text-[13px] text-muted">Active members</dt><dd className="font-display text-[24px] font-extrabold">{stats.activeMembers}</dd></div>
        <div className="card p-4"><dt className="text-[13px] text-muted">Plans sold this month</dt><dd className="font-display text-[24px] font-extrabold">{stats.soldThisMonth}</dd><dd className="text-[12.5px] text-muted">{stats.viaCredits} with company credits</dd></div>
        <div className="card p-4"><dt className="text-[13px] text-muted">Sales this month</dt><dd className="font-display text-[24px] font-extrabold">{rs(stats.grossPaise)}</dd></div>
        <div className="card p-4"><dt className="text-[13px] text-muted">You receive</dt><dd className="font-display text-[24px] font-extrabold">{rs(stats.netPaise)}</dd><dd className="text-[12.5px] text-muted">after Moosam&apos;s {stats.feeBps / 100}% fee</dd></div>
      </dl>
      <section className={`card flex flex-wrap items-center justify-between gap-4 p-5 ${benefitPartner ? "ring-2 ring-[#0f6b5c]/30" : ""}`}>
        <div className="flex max-w-[640px] flex-col gap-1">
          <h2 className="font-bold">Company benefit partner</h2>
          <p className="text-[14px] text-muted">Employees whose companies offer Moosam wellness credits can pay for your plans with them. Moosam keeps a small fee from each sale; you receive the rest. You see who bought which plan, never their employer&apos;s policy or balance.</p>
        </div>
        <form action={setBenefitPartnerAction}>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="on" value={benefitPartner ? "0" : "1"} />
          <button className={benefitPartner ? "btn-outline" : "btn-primary"}>{benefitPartner ? "Stop accepting credits" : "Accept company credits"}</button>
        </form>
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-2">
          {plans.length === 0 ? (
            <p className="card p-5 text-sm text-muted">No plans yet. Add your first one.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
              {plans.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className={`font-semibold ${p.active ? "" : "text-muted line-through"}`}>{p.name}</span>
                    <span className="text-[13px] text-muted">{PLAN_KIND_LABEL[p.kind as PlanKind]} · {p.validDays} day{p.validDays === 1 ? "" : "s"}{p.details ? ` · ${p.details}` : ""}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <b className="tabular-nums">{rs(p.pricePaise)}</b>
                    <form action={setPlanActiveAction}>
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="planId" value={p.id} />
                      <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                      <button className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-muted hover:bg-ground">{p.active ? "Stop selling" : "Sell again"}</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <form action={addPlanAction} className="card flex flex-col gap-3 p-5">
          <h2 className="font-bold">Add a plan</h2>
          <input type="hidden" name="orgId" value={orgId} />
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Name<input name="name" required maxLength={80} placeholder="Monthly unlimited" className="input" /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Type
            <select name="kind" className="input" defaultValue="monthly">{PLAN_KINDS.map((k) => <option key={k} value={k}>{PLAN_KIND_LABEL[k]}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Price (₹)<input name="price" type="number" min={1} required className="input" placeholder="2499" /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold"><span>Details <span className="font-normal text-muted">(optional)</span></span><input name="details" maxLength={240} placeholder="6 am to 10 pm, all classes" className="input" /></label>
          <button className="btn-primary">Add plan</button>
        </form>
      </div>
    </>
  );
}
