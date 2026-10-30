import Link from "next/link";
import { getStaffOrExit, when } from "../staff";
import { searchUsers } from "@/modules/admin/service";
import { Badge, PageTitle, SearchForm, Table } from "../ui";

const roleLabel = { user: "User", ops: "Ops", super_admin: "Super admin" } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await getStaffOrExit();
  const { q = "" } = await searchParams;
  const rows = await searchUsers(me, q);
  return (
    <>
      <PageTitle title="Users" subtitle={q ? `${rows.length} matching "${q}"` : "Newest first"} />
      <SearchForm action="/admin/users" q={q} placeholder="Search by name or email" />
      <Table head={["Name", "Role", "Email verified", "Two-factor", "Status", "Joined"]} empty={rows.length === 0 && "No users match."}>
        {rows.map((u) => (
          <tr key={u.id}>
            <td>
              <Link href={`/admin/users/${u.id}`} className="block font-semibold text-brand hover:underline">{u.name}</Link>
              <span className="text-[13px] text-muted">{u.email}</span>
            </td>
            <td>{roleLabel[u.platformRole]}</td>
            <td>{u.emailVerified ? "Yes" : "No"}</td>
            <td>{u.twoFactorEnabled ? "On" : "Off"}</td>
            <td>{u.suspendedAt ? <Badge status="suspended" /> : <Badge status="active" />}</td>
            <td className="whitespace-nowrap">{when(u.createdAt)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
