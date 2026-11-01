import type { Metadata } from "next";
import Link from "next/link";
import { careTravelEnabled, listCompanyHealthChecks, listCompanyPackages, QUOTE_STATUS_LABEL } from "@/modules/care/service";
import { listDirectory } from "@/modules/listings/service";
import { Flash } from "@/components/ui";
import { healthCheckAction } from "@/app/care/actions";
import { getBuyerOrExit } from "../company";
import { notFound } from "next/navigation";
import { hospitalsVisible } from "@/modules/platform/features";

export const metadata: Metadata = { title: "Health check-ups" };
const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

export default async function HealthChecks({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { orgId } = await params;
  const { me } = await getBuyerOrExit(orgId);
  if (!(await hospitalsVisible(me.id))) notFound();
  const sp = await searchParams;
  const [packages, hospitals, requests] = [await listCompanyPackages(), await listDirectory("hospital", {}, me.id), await listCompanyHealthChecks(me.id, orgId)];
  const field = "flex flex-col gap-1.5 text-sm font-semibold";
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">Health check-ups</h1>
        <p className="text-[15px] text-muted">Ask verified hospitals to quote for your team&apos;s check-ups. Share only how many people and the age band: never individual employees&apos; health information. The hospital sends results to each employee, not to you.</p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      {packages.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Check-up packages</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {packages.map((p) => (
              <li key={p.id} className="card flex flex-col gap-1.5 p-4">
                <span className="font-semibold">{p.title}</span>
                <Link href={`/hospitals/${p.hospital.slug}`} className="text-[13.5px] text-brand hover:underline">{p.hospital.name}, {p.hospital.city}</Link>
                <span className="font-bold">{rs(p.priceMinPaise)}–{rs(p.priceMaxPaise)} per person</span>
                {p.includes.length > 0 && <span className="text-[13.5px] text-muted">{p.includes.join(", ")}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {requests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Your requests</h2>
          {requests.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-4 text-[14px]">
              <span><span className="font-semibold">{r.treatment}</span> · {r.headcount} people · {r.quotes.map((q) => `${q.hospitalName}: ${QUOTE_STATUS_LABEL[q.status].toLowerCase()}`).join(" · ")}</span>
              {r.mine && <Link href={`/care/requests/${r.id}`} className="font-semibold text-brand hover:underline">Compare quotes</Link>}
            </div>
          ))}
        </section>
      )}
      {careTravelEnabled() ? (
        <form action={healthCheckAction} className="card grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 p-6">
          <h2 className="col-span-full text-lg font-bold">Ask for quotes</h2>
          <input type="hidden" name="orgId" value={orgId} />
          <label className={`${field} col-span-full sm:col-span-2`}>Check-up<input name="treatment" required minLength={3} maxLength={120} defaultValue="Annual health check-up" className="input" /></label>
          <label className={field}>Number of people<input name="headcount" type="number" min={1} max={5000} required className="input" /></label>
          <label className={field}>Age band (optional)<input name="ageBand" maxLength={40} className="input" placeholder="25–55" /></label>
          <label className={field}>When (month)<input name="arriveMonth" type="month" className="input" /></label>
          <label className={`${field} col-span-full`}>Note (optional)<textarea name="note" rows={2} maxLength={600} className="input py-2" placeholder="On-site at our office, or at the hospital. GST invoice to the company." /></label>
          <fieldset className="col-span-full flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Hospitals (up to three)</legend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
              {hospitals.map((h) => (
                <label key={h.listing.orgId} className="flex items-center gap-2.5 rounded-xl border border-line p-3 text-[15px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="checkbox" name="hospitalIds" value={h.listing.orgId} className="size-4 accent-brand" />{h.name} <span className="text-[13px] text-muted">{h.listing.city}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="col-span-full"><button className="btn-primary">Send to hospitals</button></div>
        </form>
      ) : (
        <p className="card p-5 text-sm text-muted">Health check-up requests open soon.</p>
      )}
    </>
  );
}
