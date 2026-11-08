import type { Metadata } from "next";
import Link from "next/link";
import { listPartners, PARTNER_KINDS, partnerCounts, staffSeesHospitals, type OrgFilter, type PartnerKind } from "@/modules/admin/service";
import { STATUS_LABEL } from "@/modules/listings/service";
import { Badge, Flash, PageTitle, Table, Tabs } from "../ui";
import { getStaffOrExit } from "../staff";

export const metadata: Metadata = { title: "Partners" };

const LABEL: Record<PartnerKind, string> = { professional: "Professionals", homestay: "Homestays", facility: "Gyms & studios", hospital: "Hospitals" };
const LINE: Record<PartnerKind, string> = {
  professional: "Coaches, counsellors, nutritionists and physios who offer sessions.",
  homestay: "Host guests for rest, recovery and team retreats.",
  facility: "Gyms, yoga and pilates studios, pools and wellness centres.",
  hospital: "Care & Travel: receive patients who travel for treatment.",
};
const PRO_STATUS: Record<string, string> = { unverified: "Not verified", pending: "In review", verified: "Verified", rejected: "Rejected" };
const filters: { key: OrgFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "removed", label: "Removed" },
  { key: "all", label: "All" },
];

/**
 * Partners: everyone who offers services on Moosam (professionals, homestays,
 * gyms and studios, hospitals), in any verification state. Companies are on
 * Organisations. Manage = edit, suspend or remove; Review = the verification file.
 */
export default async function Partners({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; filter?: string; msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  const [counts, hospitals] = await Promise.all([partnerCounts(me), staffSeesHospitals(me)]);
  const kinds = PARTNER_KINDS.filter((k) => k !== "hospital" || hospitals);
  const kind: PartnerKind = kinds.includes(sp.kind as PartnerKind) ? (sp.kind as PartnerKind) : "professional";
  const filter = filters.find((f) => f.key === sp.filter)?.key ?? "active";
  const q = sp.q ?? "";
  const rows = await listPartners(me, kind, q, filter);
  const href = (k: PartnerKind, f: OrgFilter = "active") => {
    const u = new URLSearchParams();
    if (k !== "professional") u.set("kind", k);
    if (f !== "active") u.set("filter", f);
    if (q) u.set("q", q);
    const s = u.toString();
    return s ? `/admin/partners?${s}` : "/admin/partners";
  };

  return (
    <>
      <PageTitle title="Partners" isNew subtitle="Everyone who offers services on Moosam. Companies are under Organisations." />
      <Flash msg={sp.msg} error={sp.error} />
      <nav aria-label="Partner type" className="flex max-w-full flex-wrap gap-1 self-start rounded-full border border-line bg-white p-1">
        {kinds.map((k) => (
          <Link
            key={k}
            href={href(k, filter)}
            aria-current={k === kind ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${k === kind ? "bg-brand text-white" : "text-[#33433b] hover:bg-ground"}`}
          >
            {LABEL[k]}
            <span className={`text-[12px] tabular-nums ${k === kind ? "text-white/80" : "text-muted"}`}>{counts[k]}</span>
          </Link>
        ))}
      </nav>
      <p className="-mt-1 text-sm text-muted">{LINE[kind]}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs current={filter} items={filters.map((f) => ({ key: f.key, label: f.label, href: href(kind, f.key) }))} />
        <form action="/admin/partners" className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
          {kind !== "professional" && <input type="hidden" name="kind" value={kind} />}
          {filter !== "active" && <input type="hidden" name="filter" value={filter} />}
          <label htmlFor="q" className="sr-only">Search partners</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search by name or city" className="input" />
          <button className="btn-outline">Search</button>
        </form>
      </div>
      <Table
        head={kind === "professional" ? ["Name", "City", "Headline", "Verification", "Standing", ""] : ["Name", "City", "Team", "Verification", ...(kind === "facility" ? ["Company credits"] : []), "Standing", ""]}
        empty={rows.length === 0 && (q ? "No partners match that search." : `No ${LABEL[kind].toLowerCase()} here.`)}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={r.manageHref} className="font-semibold text-brand hover:underline">{r.name}</Link>
            </td>
            <td>{r.city || "—"}</td>
            {kind === "professional" ? <td className="max-w-[260px] truncate text-muted">{r.detail || "—"}</td> : <td>{r.team}</td>}
            <td>
              <Badge status={r.verification} label={kind === "professional" ? PRO_STATUS[r.verification] : STATUS_LABEL[r.verification as keyof typeof STATUS_LABEL]} />
            </td>
            {kind === "facility" && <td>{r.benefitPartner ? <Badge status="active" label="Benefit partner" /> : <span className="text-muted">No</span>}</td>}
            <td>{r.removed ? <Badge status="removed" /> : r.suspended ? <Badge status="suspended" /> : <Badge status="active" />}</td>
            <td className="text-right whitespace-nowrap">
              <Link href={r.reviewHref} className="mr-4 font-semibold text-brand hover:underline">{kind === "professional" ? "Credentials" : "Review"}</Link>
              <Link href={r.manageHref} className="font-semibold text-brand hover:underline">Manage</Link>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
