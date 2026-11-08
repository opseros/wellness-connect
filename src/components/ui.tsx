// Small presentational pieces shared by the admin portal and the professional workspace.
import Link from "next/link";

/** Page heading as in the prototype: big display title, optional "New" tag, muted line, actions on the right. */
export function PageTitle({ title, subtitle, isNew, actions }: { title: string; subtitle?: React.ReactNode; isNew?: boolean; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-[30px] leading-[1.05] font-extrabold tracking-[-0.02em]">
          {title}
          {isNew && <span className="tag-new ml-2.5 align-[0.35em]">New</span>}
        </h1>
        {subtitle && <p className="max-w-[68ch] text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** KPI tile (prototype `.kpi`). */
export function Kpi({ label, value, note, isNew, highlight }: { label: string; value: React.ReactNode; note?: React.ReactNode; isNew?: boolean; highlight?: boolean }) {
  return (
    <div className={`kpi ${highlight ? "ring-2 ring-new/40" : ""}`}>
      <span className="text-[13px] font-semibold text-muted">
        {label}
        {isNew && <span className="tag-new ml-1.5">New</span>}
      </span>
      <span className="font-display text-[23px] leading-[1.1] font-extrabold tracking-[-0.02em] break-words tabular-nums sm:text-[28px]">{value}</span>
      {note && <span className="text-[12.5px] text-muted">{note}</span>}
    </div>
  );
}

export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (error) return <p role="alert" className="rounded-xl bg-[#fbe9e6] px-4 py-3 text-sm text-[#9b2c1f]">{error}</p>;
  if (msg) return <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-dark">{msg}</p>;
  return null;
}

const tones: Record<string, string> = {
  pending: "bg-[#fbf0dc] text-[#7a4b00]",
  info_requested: "bg-[#e8ecf5] text-[#2e3f66]",
  changes_requested: "bg-[#e8ecf5] text-[#2e3f66]",
  draft: "bg-[#eceeed] text-[#5b6660]",
  approved: "bg-brand-soft text-brand-dark",
  verified: "bg-brand-soft text-brand-dark",
  active: "bg-brand-soft text-brand-dark",
  rejected: "bg-[#fbe9e6] text-[#9b2c1f]",
  suspended: "bg-[#fbe9e6] text-[#9b2c1f]",
  removed: "bg-[#eceeed] text-[#5b6660]",
  open: "bg-[#fbf0dc] text-[#7a4b00]",
  unverified: "bg-[#eceeed] text-[#5b6660]",
  sent: "bg-[#fbf0dc] text-[#7a4b00]",
  viewed: "bg-[#e8ecf5] text-[#2e3f66]",
  responded: "bg-brand-soft text-brand-dark",
  submitted: "bg-[#e8ecf5] text-[#2e3f66]",
  accepted: "bg-brand-soft text-brand-dark",
  confirmed: "bg-brand-soft text-brand-dark",
  completed: "bg-brand-soft text-brand-dark",
  paused: "bg-[#eceeed] text-[#5b6660]",
  declined: "bg-[#eceeed] text-[#5b6660]",
  withdrawn: "bg-[#eceeed] text-[#5b6660]",
  closed: "bg-[#eceeed] text-[#5b6660]",
  cancelled: "bg-[#fbe9e6] text-[#9b2c1f]",
};

export function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tones[status] ?? "bg-ground text-[#3d4842]"}`}>
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <div role="tablist" className="inline-flex max-w-full flex-wrap gap-1 self-start rounded-full border border-line bg-white p-1">
      {items.map((i) => (
        <Link key={i.key} role="tab" aria-selected={i.key === current} href={i.href} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${i.key === current ? "bg-brand text-white" : "text-[#33433b] hover:bg-ground"}`}>
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export function SearchForm({ action, q, placeholder }: { action: string; q?: string; placeholder: string }) {
  return (
    <form action={action} className="flex max-w-xl gap-2">
      <label htmlFor="q" className="sr-only">Search</label>
      <input id="q" name="q" defaultValue={q} placeholder={placeholder} className="input" />
      <button className="btn-outline">Search</button>
    </form>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: string | false }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-ground text-left text-muted">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 text-[11.5px] font-bold tracking-[0.08em] whitespace-nowrap uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-line [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-6 text-center text-sm text-muted">{empty}</p>}
    </div>
  );
}
