import { getStaffOrExit, when } from "../staff";
import { listOrganizations } from "@/modules/admin/service";
import { setDomainAction } from "../actions";
import { Badge, Flash, PageTitle, SearchForm, Table } from "../ui";

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  const rows = await listOrganizations(me, sp.q ?? "");
  const isSuper = me.platformRole === "super_admin";
  return (
    <>
      <PageTitle title="Organizations" subtitle="Companies and provider businesses. A verified domain lets colleagues request to join." />
      <Flash msg={sp.msg} error={sp.error} />
      <SearchForm action="/admin/organizations" q={sp.q} placeholder="Search by name or domain" />
      <Table head={["Organization", "Type", "Members", "Email domain", "Created"]} empty={rows.length === 0 && "No organizations yet."}>
        {rows.map((o) => (
          <tr key={o.id}>
            <td className="font-semibold">{o.name}</td>
            <td className="capitalize">{o.kind}</td>
            <td>
              {o.activeMembers} active
              {o.pendingMembers > 0 && <span className="ml-2"><Badge status="pending" label={`${o.pendingMembers} pending`} /></span>}
            </td>
            <td>
              {isSuper ? (
                <form action={setDomainAction} className="flex items-center gap-2">
                  <input type="hidden" name="orgId" value={o.id} />
                  <label htmlFor={`d-${o.id}`} className="sr-only">Email domain for {o.name}</label>
                  <input id={`d-${o.id}`} name="domain" defaultValue={o.domain ?? ""} placeholder="company.com" className="input min-h-9 max-w-44 text-sm" />
                  <button className="btn-outline min-h-9 px-3 text-sm">Save</button>
                </form>
              ) : (
                o.domain ?? "—"
              )}
              {o.domain && <span className="mt-1 block text-xs text-muted">{o.domainVerifiedAt ? `Verified ${when(o.domainVerifiedAt)}` : "Not verified"}</span>}
            </td>
            <td className="whitespace-nowrap">{when(o.createdAt)}</td>
          </tr>
        ))}
      </Table>
      {isSuper && <p className="text-[13px] text-muted">Only link a domain after confirming the company owns it (for example, an email from their IT team). Saving an empty box removes it.</p>}
    </>
  );
}
