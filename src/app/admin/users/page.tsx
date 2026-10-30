import Link from "next/link";
import { getStaffOrExit, when } from "../staff";
import { searchUsers, type UserFilter } from "@/modules/admin/service";
import { unsuspendAction } from "../actions";
import { Badge, Flash, PageTitle, Table, Tabs } from "../ui";

const roleLabel = { user: "User", ops: "Ops", super_admin: "Super admin" } as const;
const filters: { key: UserFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "removed", label: "Removed" },
  { key: "all", label: "All" },
];

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const filter = (filters.find((f) => f.key === sp.filter)?.key ?? "active") as UserFilter;
  const rows = await searchUsers(me, q, 50, filter);
  const isSuper = me.platformRole === "super_admin";
  const href = (f: UserFilter) => `/admin/users?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageTitle title="Users" subtitle={q ? `${rows.length} matching "${q}"` : "Newest first"} />
      <Flash msg={sp.msg} error={sp.error} />
      <Tabs current={filter} items={filters.map((f) => ({ key: f.key, label: f.label, href: href(f.key) }))} />
      <form action="/admin/users" className="flex max-w-xl gap-2">
        <input type="hidden" name="filter" value={filter} />
        <label htmlFor="q" className="sr-only">Search</label>
        <input id="q" name="q" defaultValue={q} placeholder="Search by name or email" className="input" />
        <button className="btn-outline">Search</button>
      </form>
      <Table head={["Name", "Role", "Email verified", "Two-factor", "Status", "Joined", "Actions"]} empty={rows.length === 0 && "No users match."}>
        {rows.map((u) => {
          const manageable = isSuper && !u.deletedAt && u.id !== me.id && u.platformRole !== "super_admin";
          const editable = isSuper && !u.deletedAt && (u.platformRole !== "super_admin" || u.id === me.id);
          return (
            <tr key={u.id}>
              <td>
                <Link href={`/admin/users/${u.id}`} className="block font-semibold text-brand hover:underline">{u.name}</Link>
                <span className="text-[13px] text-muted">{u.email}</span>
              </td>
              <td>{roleLabel[u.platformRole]}</td>
              <td>{u.emailVerified ? "Yes" : "No"}</td>
              <td>{u.twoFactorEnabled ? "On" : "Off"}</td>
              <td>{u.deletedAt ? <Badge status="removed" /> : u.suspendedAt ? <Badge status="suspended" /> : <Badge status="active" />}</td>
              <td className="whitespace-nowrap">{when(u.createdAt)}</td>
              <td>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap text-[13px] font-semibold">
                  {editable && <Link href={`/admin/users/${u.id}/edit`} className="text-brand hover:underline">Edit</Link>}
                  {manageable &&
                    (u.suspendedAt ? (
                      <form action={unsuspendAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="back" value="list" />
                        <button className="font-semibold text-brand hover:underline">Unsuspend</button>
                      </form>
                    ) : (
                      <Link href={`/admin/users/${u.id}#suspend`} className="text-[#9b2c1f] hover:underline">Suspend</Link>
                    ))}
                  {manageable && <Link href={`/admin/users/${u.id}/remove`} className="text-[#9b2c1f] hover:underline">Remove</Link>}
                  {!editable && !manageable && <span className="font-normal text-muted">—</span>}
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
