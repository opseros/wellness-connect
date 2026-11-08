import Link from "next/link";
import { getStaffOrExit } from "./staff";
import { adminCounts, adminOverview } from "@/modules/admin/service";
import { periodLabel } from "@/modules/marketplace/credits";
import { PageTitle } from "./ui";

const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

function Tile({ label, value, note, href }: { label: string; value: React.ReactNode; note?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-[24px] font-bold tabular-nums">{value}</dd>
      {note && <dd className="text-[12.5px] text-muted">{note}</dd>}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-2xl bg-white p-4 ring-1 ring-line hover:ring-brand">{body}</Link>
  ) : (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-line">{body}</div>
  );
}

/** Admin overview: what needs doing, the platform at a glance, and this month's member bookings. */
export default async function AdminOverview() {
  const me = await getStaffOrExit();
  const [o, c] = await Promise.all([adminOverview(me), adminCounts(me)]);
  const todo = [
    { label: "Professionals to verify", n: c.pendingCredentials, href: "/admin/professionals" },
    { label: "Homestays to verify", n: c.pendingHomestays, href: "/admin/homestays" },
    { label: "Gyms & studios to verify", n: c.pendingFacilities, href: "/admin/facilities" },
    ...(c.hospitals ? [{ label: "Hospitals to verify", n: c.pendingHospitals, href: "/admin/hospitals" }] : []),
    { label: "Open reports", n: c.openReports, href: "/admin/reports" },
    { label: "Finance items", n: c.financeAttention, href: "/admin/finance" },
    { label: "Credit prepayments waiting", n: o.members.dueCount, href: "/admin/credits" },
  ];
  const waiting = todo.filter((t) => t.n > 0);

  return (
    <>
      <PageTitle title="Overview" subtitle={`Moosam today · ${periodLabel(o.members.period)}`} />

      <section aria-labelledby="todo-h" className="flex flex-col gap-3">
        <h2 id="todo-h" className="text-lg font-bold">Needs attention</h2>
        {waiting.length === 0 ? (
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm text-brand-dark">All clear. Nothing is waiting for the team.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            {waiting.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fff4dc] px-4 py-3 text-sm font-semibold text-[#7a4b00] hover:ring-1 hover:ring-[#7a4b00]/40">
                  {t.label}
                  <span className="rounded-full bg-[#f2c46d] px-2.5 py-0.5 text-ink tabular-nums">{t.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="m-h" className="flex flex-col gap-3">
        <h2 id="m-h" className="text-lg font-bold">Member bookings this month</h2>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <Tile label="Booked with credits" value={rs(o.members.spentPaise)} href="/admin/credits" />
          <Tile label="Moosam fees" value={rs(o.members.feePaise)} />
          <Tile label="Prepaid by companies" value={rs(o.members.fundedPaise)} note={`${o.members.companies} compan${o.members.companies === 1 ? "y" : "ies"}`} />
          <Tile label="Prepayments due" value={rs(o.members.duePaise)} note={`${o.members.dueCount} waiting`} href="/admin/credits" />
        </dl>
        <p className="text-[13px] text-muted">Company workshop bookings and homestay stays are in <Link href="/admin/finance" className="font-semibold text-brand hover:underline">Finance</Link>.</p>
      </section>

      <section aria-labelledby="p-h" className="flex flex-col gap-3">
        <h2 id="p-h" className="text-lg font-bold">On Moosam</h2>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <Tile label="Members" value={o.users.toLocaleString("en-IN")} href="/admin/users" />
          <Tile label="Companies" value={o.companies} href="/admin/organizations" />
          <Tile label="Verified professionals" value={o.professionals} href="/admin/partners" />
          <Tile label="Homestays" value={o.homestays} href="/admin/partners?kind=homestay" />
          <Tile label="Gyms & studios" value={o.facilities} href="/admin/partners?kind=facility" />
          {c.hospitals && <Tile label="Hospitals" value={o.hospitals} note={c.hospitalsOn ? undefined : "Switched off"} href="/admin/partners?kind=hospital" />}
        </dl>
      </section>
    </>
  );
}
