// Small presentational pieces shared by admin pages.
import Link from "next/link";

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[26px] font-bold">{title}</h1>
      {subtitle && <p className="text-[15px] text-muted">{subtitle}</p>}
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
  approved: "bg-brand-soft text-brand-dark",
  verified: "bg-brand-soft text-brand-dark",
  active: "bg-brand-soft text-brand-dark",
  rejected: "bg-[#fbe9e6] text-[#9b2c1f]",
  suspended: "bg-[#fbe9e6] text-[#9b2c1f]",
  open: "bg-[#fbf0dc] text-[#7a4b00]",
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
    <div role="tablist" className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Link key={i.key} role="tab" aria-selected={i.key === current} href={i.href} className={`rounded-full px-3.5 py-2 text-sm font-semibold ${i.key === current ? "bg-brand text-white" : "border border-line bg-white text-[#3d4842]"}`}>
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
          <tr className="text-left text-muted">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-[#eef1ef] [&_td]:px-4 [&_td]:py-3 [&_td]:align-top">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-6 text-center text-sm text-muted">{empty}</p>}
    </div>
  );
}
