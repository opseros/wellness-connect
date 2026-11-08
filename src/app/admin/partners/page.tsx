import type { Metadata } from "next";
import Link from "next/link";
import { listPartners, PARTNER_KINDS, partnerCounts, staffSeesHospitals, type PartnerKind } from "@/modules/admin/service";
import { PageTitle, Table } from "../ui";
import { getStaffOrExit } from "../staff";

export const metadata: Metadata = { title: "Partners" };

const LABEL: Record<PartnerKind, string> = { professional: "Professionals", homestay: "Homestays", facility: "Gyms & studios", hospital: "Hospitals" };
const when = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(d) : "—");

/** Partners: everyone verified to offer services on Moosam, by type. Read-only; review and changes happen in Approvals. */
export default async function Partners({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  const [counts, hospitals] = await Promise.all([partnerCounts(me), staffSeesHospitals(me)]);
  const kinds = PARTNER_KINDS.filter((k) => k !== "hospital" || hospitals);
  const kind: PartnerKind = kinds.includes(sp.kind as PartnerKind) ? (sp.kind as PartnerKind) : "professional";
  const rows = await listPartners(me, kind, sp.q ?? "");
  const href = (k: PartnerKind) => (k === "professional" ? "/admin/partners" : `/admin/partners?kind=${k}`);

  return (
    <>
      <PageTitle title="Partners" isNew subtitle="Everyone verified to offer services on Moosam. Reviews and changes happen in Approvals." />
      <nav aria-label="Partner type" className="flex max-w-full flex-wrap gap-1 self-start rounded-full border border-line bg-white p-1">
        {kinds.map((k) => (
          <Link
            key={k}
            href={href(k)}
            aria-current={k === kind ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${k === kind ? "bg-brand text-white" : "text-[#33433b] hover:bg-ground"}`}
          >
            {LABEL[k]}
            <span className={`text-[12px] tabular-nums ${k === kind ? "text-white/80" : "text-muted"}`}>{counts[k]}</span>
          </Link>
        ))}
      </nav>
      <form action="/admin/partners" className="flex max-w-xl gap-2">
        {kind !== "professional" && <input type="hidden" name="kind" value={kind} />}
        <label htmlFor="q" className="sr-only">Search partners</label>
        <input id="q" name="q" defaultValue={sp.q} placeholder="Search by name or city" className="input" />
        <button className="btn-outline">Search</button>
      </form>
      <Table head={kind === "facility" ? ["Name", "City", "Verified", "Company credits", ""] : ["Name", "City", kind === "professional" ? "Headline" : "Verified", ""]} empty={rows.length === 0 && (sp.q ? "No partners match that search." : `No verified ${LABEL[kind].toLowerCase()} yet.`)}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-semibold">
              {r.name}
              {r.suspended && <span className="ml-2 rounded-full bg-[#f9e4e2] px-2 py-0.5 text-[11px] font-bold text-[#9b2c24]">Suspended</span>}
            </td>
            <td>{r.city || "—"}</td>
            <td className="text-muted">{kind === "professional" ? r.detail || "—" : when(r.since)}</td>
            {kind === "facility" && <td>{r.benefitPartner ? <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-bold text-brand-dark">Benefit partner</span> : <span className="text-muted">No</span>}</td>}
            <td className="text-right">
              <Link href={r.href} className="font-semibold text-brand hover:underline">Open</Link>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
