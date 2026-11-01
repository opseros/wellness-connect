import { notFound } from "next/navigation";
import { getStaffOrExit, when } from "../staff";
import { listPlatformFeatures } from "@/modules/admin/service";
import { setFeatureAction } from "../actions";
import { Flash, PageTitle } from "../ui";

export const metadata = { title: "Settings" };

/** Platform switches. Super admins only. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  if (me.platformRole !== "super_admin") notFound();
  const [features, sp] = await Promise.all([listPlatformFeatures(me), searchParams]);
  return (
    <>
      <PageTitle title="Settings" subtitle="Switch whole parts of the platform on or off. Super admins always see everything, so you can set things up before switching them on." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="flex flex-col gap-4">
        {features.map((f) => (
          <form key={f.key} action={setFeatureAction} className="card flex flex-wrap items-center justify-between gap-5 p-6">
            <input type="hidden" name="key" value={f.key} />
            <input type="hidden" name="enabled" value={f.enabled ? "0" : "1"} />
            <div className="flex max-w-[640px] flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h2 className="text-[18px] font-bold">{f.label}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${f.enabled ? "bg-brand-soft text-brand-dark" : "bg-[#fbe9e6] text-[#9b2c1f]"}`}>{f.enabled ? "On" : "Off"}</span>
              </div>
              <p className="text-[14.5px] text-muted">{f.description}</p>
              {f.updatedAt && <p className="text-[12.5px] text-muted">Last changed {when(f.updatedAt)}</p>}
            </div>
            <button
              role="switch"
              aria-checked={f.enabled}
              aria-label={`${f.label}: turn ${f.enabled ? "off" : "on"}`}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${f.enabled ? "bg-brand" : "bg-[#c9d1cd]"}`}
            >
              <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${f.enabled ? "left-7" : "left-1"}`} />
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
