import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";
import { getListingWorkspace } from "@/modules/listings/service";
import { listOwnPackages } from "@/modules/care/service";
import { Badge, Flash } from "@/components/ui";
import { savePackageAction, togglePackageAction } from "../../actions";

export const metadata: Metadata = { title: "Packages" };
const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
type Pkg = Awaited<ReturnType<typeof listOwnPackages>>[number];

function PackageForm({ orgId, p, specialties }: { orgId: string; p?: Pkg; specialties: string[] }) {
  const field = "flex flex-col gap-1.5 text-sm font-semibold";
  return (
    <form action={savePackageAction} className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      <input type="hidden" name="orgId" value={orgId} />
      {p && <input type="hidden" name="packageId" value={p.id} />}
      <label className={`${field} col-span-full sm:col-span-2`}>Package name<input name="title" required minLength={3} maxLength={120} defaultValue={p?.title} className="input" placeholder="Total knee replacement (one knee)" /></label>
      <label className={field}>Specialty
        <input name="specialty" required list={`sp-${orgId}`} defaultValue={p?.specialty} className="input" />
        <datalist id={`sp-${orgId}`}>{specialties.map((s) => <option key={s} value={s} />)}</datalist>
      </label>
      <label className={field}>From (₹)<input name="priceMinRupees" type="number" min={1} required defaultValue={p ? p.priceMinPaise / 100 : ""} className="input" /></label>
      <label className={field}>To (₹)<input name="priceMaxRupees" type="number" min={1} required defaultValue={p ? p.priceMaxPaise / 100 : ""} className="input" /></label>
      <label className={field}>Nights in hospital<input name="hospitalNights" type="number" min={0} max={60} defaultValue={p?.hospitalNights ?? 0} className="input" /></label>
      <label className={field}>Suggested recovery nights nearby<input name="recoveryNights" type="number" min={0} max={90} defaultValue={p?.recoveryNights ?? 0} className="input" /></label>
      <label className={`${field} col-span-full`}>What&apos;s included (comma separated)<input name="includes" defaultValue={p?.includes.join(", ")} className="input" placeholder="Surgeon's fee, implant, 10 physiotherapy sessions, airport pick-up" /></label>
      <label className={`${field} col-span-full`}>Description<textarea name="description" rows={2} maxLength={1500} defaultValue={p?.description} className="input py-2" /></label>
      <label className="col-span-full flex items-center gap-2 text-[15px]"><input type="checkbox" name="forCompanies" defaultChecked={p?.forCompanies} className="size-4 accent-brand" />A health check-up companies can book for their teams</label>
      <div className="col-span-full"><button className="btn-primary">{p ? "Save package" : "Add package"}</button></div>
    </form>
  );
}

export default async function Packages({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const w = await getListingWorkspace(me.id, orgId);
  if (w.listing.kind !== "hospital") notFound();
  const rows = await listOwnPackages(me.id, orgId);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">Treatment packages</h1>
        <p className="text-[15px] text-muted">Prices are indicative ranges; you confirm the final price after the consultation. Patients pay you directly. Packages appear on your public page once you&apos;re verified.</p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      {rows.map((p) => (
        <article key={p.id} className="card flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2"><span className="font-bold">{p.title}</span>{!p.active && <Badge status="paused" label="Hidden" />}{p.forCompanies && <Badge status="submitted" label="For companies" />}</span>
              <span className="text-[14px] text-muted">{p.specialty} · {rs(p.priceMinPaise)}–{rs(p.priceMaxPaise)} · {p.hospitalNights} nights in hospital{p.recoveryNights ? ` · ${p.recoveryNights} recovery nights` : ""}</span>
              {p.includes.length > 0 && <span className="text-[14px]">Includes: {p.includes.join(", ")}</span>}
            </div>
            {w.canEdit && (
              <form action={togglePackageAction}>
                <input type="hidden" name="orgId" value={orgId} /><input type="hidden" name="packageId" value={p.id} /><input type="hidden" name="active" value={p.active ? "0" : "1"} />
                <button className="btn-outline min-h-9 px-4 text-sm">{p.active ? "Hide" : "Show"}</button>
              </form>
            )}
          </div>
          {w.canEdit && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-brand">Edit</summary>
              <div className="mt-3"><PackageForm orgId={orgId} p={p} specialties={w.listing.specialties} /></div>
            </details>
          )}
        </article>
      ))}
      {w.canEdit && (
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">{rows.length ? "Add another package" : "Add your first package"}</h2>
          <PackageForm orgId={orgId} specialties={w.listing.specialties} />
        </section>
      )}
    </>
  );
}
