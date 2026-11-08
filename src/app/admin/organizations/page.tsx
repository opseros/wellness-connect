import Link from "next/link";
import { getStaffOrExit, when } from "../staff";
import { listOrganizations, type OrgFilter } from "@/modules/admin/service";
import { Badge, Flash, PageTitle, Table, Tabs } from "../ui";

const filters: { key: OrgFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "removed", label: "Removed" },
  { key: "all", label: "All" },
];

type Row = Awaited<ReturnType<typeof listOrganizations>>[number];

function Standing({ o }: { o: Row }) {
  return o.removedAt ? <Badge status="removed" /> : o.suspendedAt ? <Badge status="suspended" /> : <Badge status="active" />;
}

/**
 * Organisations: the companies that buy wellness for their teams. Homestays,
 * gyms and hospitals are partners (see Partners).
 */
export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const filter = filters.find((f) => f.key === sp.filter)?.key ?? "active";
  const list = await listOrganizations(me, q, filter, ["company"]);
  const href = (f: OrgFilter) => `/admin/organizations?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageTitle title="Organisations" subtitle={q ? `${list.length} compan${list.length === 1 ? "y" : "ies"} matching "${q}"` : "Companies that buy wellness for their teams, newest first. Homestays, gyms and hospitals are under Partners."} />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs current={filter} items={filters.map((f) => ({ key: f.key, label: f.label, href: href(f.key) }))} />
        <form action="/admin/organizations" className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
          <input type="hidden" name="filter" value={filter} />
          <label htmlFor="q" className="sr-only">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search by name or email domain" className="input" />
          <button className="btn-outline">Search</button>
        </form>
      </div>
      <Table head={["Company", "Members", "Email domain", "Standing", "Created", ""]} empty={list.length === 0 && "No companies here."}>
        {list.map((o) => (
          <tr key={o.id}>
            <td><Link href={`/admin/organizations/${o.id}`} className="font-semibold text-brand hover:underline">{o.name}</Link></td>
            <td>
              {o.activeMembers} active
              {o.pendingMembers > 0 && <span className="ml-2"><Badge status="pending" label={`${o.pendingMembers} pending`} /></span>}
            </td>
            <td>{o.domain ?? "—"}{o.domain && <span className="block text-xs text-muted">{o.domainVerifiedAt ? "Verified" : "Not verified"}</span>}</td>
            <td><Standing o={o} /></td>
            <td className="whitespace-nowrap">{when(o.createdAt)}</td>
            <td className="text-right"><Link href={`/admin/organizations/${o.id}`} className="font-semibold text-brand hover:underline">Manage</Link></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
