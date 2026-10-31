import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { listMyStays, STAY_STATUS_LABEL } from "@/modules/stays/service";
import { Badge } from "@/components/ui";
import { tone } from "./tone";

const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dd = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export default async function MyStays() {
  const me = (await getCurrentUser())!;
  const rows = await listMyStays(me.id);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[26px] font-bold">My stays</h1>
        <Link href="/homestays" className="btn-outline">Find a homestay</Link>
      </div>
      {rows.length === 0 && <p className="card p-6 text-[15px] text-muted">No stays yet. Browse verified homestays for rest, recovery or a team retreat.</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((s) => (
          <li key={s.id}>
            <Link href={`/stays/${s.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-5 hover:shadow-md">
              <span className="flex flex-col gap-1">
                <span className="font-bold">{s.homestay?.name ?? "Homestay"}</span>
                <span className="text-[14px] text-muted">{dd(s.checkIn)} → {dd(s.checkOut)} · {s.nights} night{s.nights > 1 ? "s" : ""}{s.homestay ? ` · ${s.homestay.city}` : ""}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-semibold">{rs(s.totalPaise)}</span>
                <Badge status={tone[s.status]} label={STAY_STATUS_LABEL[s.status]} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
