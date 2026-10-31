import Link from "next/link";
import { AGE_RANGES, CARE_NEEDS } from "@/db/schema";
import { listDirectory } from "@/modules/listings/service";
import { AGE_LABEL, careTravelEnabled, NEED_LABEL } from "@/modules/care/service";
import { Flash } from "@/components/ui";
import { createCareRequestAction } from "../actions";

export const metadata = { title: "Ask for quotes" };

export default async function NewRequest({ searchParams }: { searchParams: Promise<{ hospital?: string | string[]; error?: string }> }) {
  const sp = await searchParams;
  const chosen = new Set([sp.hospital ?? []].flat());
  const hospitals = await listDirectory("hospital");
  const field = "flex flex-col gap-1.5 text-sm font-semibold";
  if (!careTravelEnabled()) {
    return (
      <section className="card flex flex-col gap-3 p-6">
        <h1 className="text-[26px] font-bold">Quote requests open soon</h1>
        <p className="text-[15px] text-muted">We&apos;re finishing our privacy protections for medical information before opening quote requests. You can already browse verified hospitals.</p>
        <Link href="/hospitals" className="btn-outline self-start">Browse hospitals</Link>
      </section>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold">Ask hospitals for a quote</h1>
        <p className="text-[15px] text-muted">Choose up to three verified hospitals. They see only what you write here, not your name or contact details, until you accept a quote. You can share reports later, with the hospitals you choose.</p>
      </div>
      <Flash error={sp.error} />
      <form action={createCareRequestAction} className="card grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-6">
        <label className={`${field} col-span-full`}>Treatment you&apos;re looking for<input name="treatment" required minLength={3} maxLength={120} className="input" placeholder="Total knee replacement" /></label>
        <label className={field}>Specialty (optional)<input name="specialty" maxLength={60} className="input" placeholder="Orthopaedics" /></label>
        <label className={field}>Age range
          <select name="ageRange" required defaultValue="" className="input"><option value="" disabled>Choose</option>{AGE_RANGES.map((a) => <option key={a} value={a}>{AGE_LABEL[a]}</option>)}</select>
        </label>
        <label className={field}>Travelling from (country)<input name="travellingFrom" required maxLength={80} className="input" placeholder="Kenya" /></label>
        <label className={field}>Arriving around (month)<input name="arriveMonth" type="month" className="input" /></label>
        <label className={field}>People travelling with you<input name="companions" type="number" min={0} max={5} defaultValue={0} className="input" /></label>
        <fieldset className="col-span-full flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">What would help (optional)</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {CARE_NEEDS.map((n) => <label key={n} className="flex items-center gap-2 text-[15px]"><input type="checkbox" name="needs" value={n} className="size-4 accent-brand" />{NEED_LABEL[n]}</label>)}
          </div>
          <label className="flex max-w-[320px] flex-col gap-1.5 text-sm font-semibold">Interpreter language, if needed<input name="interpreterLanguage" maxLength={40} className="input" /></label>
        </fieldset>
        <label className={`${field} col-span-full`}>Note for the hospitals (optional)
          <textarea name="note" rows={3} maxLength={600} className="input py-2" placeholder="What your doctor has advised, and any questions. No names, phone numbers or emails." />
        </label>
        <fieldset className="col-span-full flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Hospitals (up to three)</legend>
          {hospitals.length === 0 && <p className="text-sm text-muted">No verified hospitals yet.</p>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
            {hospitals.map((h) => (
              <label key={h.listing.orgId} className="flex items-start gap-2.5 rounded-xl border border-line p-3 text-[15px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="checkbox" name="hospitalIds" value={h.listing.orgId} defaultChecked={chosen.has(h.listing.orgId)} className="mt-1 size-4 accent-brand" />
                <span className="flex flex-col"><span className="font-semibold">{h.name}</span><span className="text-[13px] text-muted">{h.listing.city}{h.listing.accreditations.length ? ` · ${h.listing.accreditations.join(", ")}` : ""}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="col-span-full flex flex-wrap items-center gap-3">
          <button className="btn-primary">Send to hospitals</button>
          <span className="text-[13px] text-muted">Free. Treatment is paid to the hospital directly.</span>
        </div>
      </form>
    </>
  );
}
