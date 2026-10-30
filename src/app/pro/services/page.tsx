import type { Metadata } from "next";
import Link from "next/link";
import { listOwnServices } from "@/modules/professionals/service";
import { paiseRange } from "@/lib/money";
import { Badge, Flash, PageTitle } from "@/components/ui";
import { toggleServiceAction } from "../actions";
import { getProOrExit, MODE_LABEL } from "../me";

export const metadata: Metadata = { title: "Services" };

export default async function Services({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { me } = await getProOrExit();
  const [rows, sp] = await Promise.all([listOwnServices(me.id), searchParams]);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Services" subtitle="What you offer companies, with a price range in rupees." />
        <Link href="/pro/services/new" className="btn-primary">Add a service</Link>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      {rows.length === 0 ? (
        <div className="card flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] text-muted">No services yet. Add at least one so companies can match with you.</p>
          <Link href="/pro/services/new" className="btn-primary">Add your first service</Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ service: s, categoryName }) => (
            <li key={s.id} className={`card flex flex-wrap items-center justify-between gap-4 p-5 ${s.active ? "" : "opacity-75"}`}>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[17px] font-bold">{s.title}</span>
                  <Badge status={s.active ? "active" : "paused"} />
                </span>
                <span className="text-sm text-muted">
                  {categoryName} · {s.deliveryModes.map((m) => MODE_LABEL[m]).join(", ")} · {s.durationMinutes} min
                </span>
                <span className="text-[15px] font-semibold">{paiseRange(s.priceMinPaise, s.priceMaxPaise)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/pro/services/${s.id}`} className="btn-outline">Edit</Link>
                <form action={toggleServiceAction}>
                  <input type="hidden" name="serviceId" value={s.id} />
                  <input type="hidden" name="active" value={s.active ? "0" : "1"} />
                  <button className="btn-outline">{s.active ? "Pause" : "Resume"}</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
