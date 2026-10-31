import Link from "next/link";
import { getStaffOrExit, when } from "../staff";
import { listReports } from "@/modules/admin/service";
import { resolveReportAction } from "../actions";
import { Badge, Flash, PageTitle, Table, Tabs } from "../ui";

const STATUSES = [
  { key: "open", label: "Open" },
  { key: "actioned", label: "Actioned" },
  { key: "dismissed", label: "Dismissed" },
] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string; msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s.key === sp.status)?.key ?? "open";
  const rows = await listReports(me, status);
  return (
    <>
      <PageTitle title="Reports" subtitle="Posts, comments, messages and members reported in Connect." />
      <Flash msg={sp.msg} error={sp.error} />
      <Tabs current={status} items={STATUSES.map((s) => ({ key: s.key, label: s.label, href: s.key === "open" ? "/admin/reports" : `/admin/reports?status=${s.key}` }))} />
      <Table head={["Reported", "Reason", "Reported by", "When", ""]} empty={rows.length === 0 && "No reports here."}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="max-w-[360px]">
              <Badge status="open" label={r.targetType} />
              {r.content ? (
                <p className="mt-1.5 line-clamp-3 whitespace-pre-line">{r.content.body}</p>
              ) : r.target ? (
                <p className="mt-1.5">{r.target.href ? <Link href={r.target.href} className="text-brand underline">{r.target.text}</Link> : r.target.text}</p>
              ) : (
                <p className="mt-1.5 text-muted">No longer available</p>
              )}
              {(r.content?.deletedAt || r.target?.archived) && <span className="text-xs text-muted">Removed</span>}
              {r.targetType === "message" && <span className="block text-xs text-muted">Messages stay private; talk to the reporter or suspend a member if needed.</span>}
            </td>
            <td>{r.reason}</td>
            <td>
              <span className="block">{r.reporterName}</span>
              <span className="text-[13px] text-muted">{r.reporterEmail}</span>
            </td>
            <td className="whitespace-nowrap">{when(r.createdAt)}</td>
            <td>
              {status === "open" && (
                <form action={resolveReportAction} className="flex flex-col items-end gap-2">
                  <input type="hidden" name="reportId" value={r.id} />
                  {(r.targetType === "post" || r.targetType === "comment" || r.targetType === "group") && (
                    <button name="action" value="remove_content" className="btn-outline min-h-9 px-3 text-sm text-[#9b2c1f]">{r.targetType === "group" ? "Archive group" : `Remove ${r.targetType}`}</button>
                  )}
                  <button name="action" value="dismiss" className="btn-outline min-h-9 px-3 text-sm">Dismiss</button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <p className="text-[13px] text-muted">For repeated abuse, suspend the member from their page under Users.</p>
    </>
  );
}
