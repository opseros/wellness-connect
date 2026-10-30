import { getStaffOrExit, when } from "../staff";
import { listAuditLog } from "@/modules/admin/service";
import { PageTitle, Table } from "../ui";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; actor?: string; target?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  const rows = await listAuditLog(me, { action: sp.action?.trim() || undefined, actor: sp.actor?.trim() || undefined, target: sp.target?.trim() || undefined });
  return (
    <>
      <PageTitle title="Audit log" subtitle="Every staff decision and sensitive change, newest first (latest 200)." />
      <form action="/admin/audit" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="action" className="label">Action contains</label>
          <input id="action" name="action" defaultValue={sp.action} placeholder="e.g. credential, suspend" className="input min-h-10 w-56" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="actor" className="label">Done by</label>
          <input id="actor" name="actor" defaultValue={sp.actor} placeholder="Name or email" className="input min-h-10 w-56" />
        </div>
        {sp.target && <input type="hidden" name="target" value={sp.target} />}
        <button className="btn-outline min-h-10">Filter</button>
      </form>
      <Table head={["When", "Who", "Action", "Target", "Details"]} empty={rows.length === 0 && "No matching entries."}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap">{when(r.createdAt)}</td>
            <td>{r.actorName ? <><span className="block">{r.actorName}</span><span className="text-[13px] text-muted">{r.actorEmail}</span></> : <span className="text-muted">System</span>}</td>
            <td className="font-mono text-[13px]">{r.action}</td>
            <td><span className="text-muted">{r.targetType}</span> <span className="font-mono text-[12px]">{r.targetId.slice(0, 8)}</span></td>
            <td className="max-w-[320px] break-words font-mono text-[12px] text-muted">{Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : ""}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
