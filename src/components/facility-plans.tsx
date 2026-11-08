import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { PLAN_KIND_LABEL, publicPlans } from "@/modules/listings/plans";
import { myWallets } from "@/modules/marketplace/credits";
import { buyPlanWithCreditsAction } from "@/app/facilities/actions";

const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

/** Plans and passes on a facility page, with "Buy with credits" when the member's company covers it. */
export async function FacilityPlans({ orgId, slug, benefitPartner, error }: { orgId: string; slug: string; benefitPartner: boolean; error?: string }) {
  const plans = await publicPlans(orgId);
  if (plans.length === 0) return null;
  const me = await getCurrentUser();
  const wallets = me ? (await myWallets(me.id)).filter((w) => w.funded && w.covers.facilities && (!w.partnersOnly || benefitPartner)) : [];
  const best = wallets.sort((a, b) => b.availablePaise - a.availablePaise)[0];
  return (
    <section aria-labelledby="plans-h" className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plans-h" className="text-lg font-bold">Plans and passes</h2>
        {benefitPartner && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-semibold text-brand-dark">Benefit partner</span>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-[#fbe9e6] px-3 py-2 text-sm text-[#9b2c1f]">{error}</p>}
      {best && <p className="rounded-lg bg-brand-soft px-3 py-2 text-[13px] text-brand-dark">You have {rs(best.availablePaise)} of {best.orgName} wellness credits left this month.</p>}
      <ul className="flex flex-col gap-2">
        {plans.map((p) => {
          const canPay = best && best.availablePaise >= p.pricePaise;
          return (
            <li key={p.id} className="flex flex-col gap-2 rounded-xl bg-ground p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{p.name}</span>
                <span className="font-bold tabular-nums">{rs(p.pricePaise)}</span>
              </div>
              <span className="text-[12.5px] text-muted">{PLAN_KIND_LABEL[p.kind]} · valid {p.validDays === 1 ? "for a day" : `${p.validDays} days`}{p.details ? ` · ${p.details}` : ""}</span>
              {canPay ? (
                <form action={buyPlanWithCreditsAction}>
                  <input type="hidden" name="planId" value={p.id} />
                  <input type="hidden" name="key" value={randomUUID()} />
                  <input type="hidden" name="back" value={`/facilities/${slug}`} />
                  <button className="btn-primary min-h-9 rounded-full px-4 text-sm">Buy with credits</button>
                </form>
              ) : (
                <span className="text-[12.5px] text-muted">{me ? (best ? "Not enough credits left this month. " : "") + "Card payments open soon." : <><Link href="/sign-in" className="font-semibold text-brand hover:underline">Sign in</Link> to buy.</>}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
