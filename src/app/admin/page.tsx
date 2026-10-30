import Link from "next/link";
import { getStaffOrExit, when } from "./staff";
import { listCredentialQueue, type QueueStatus } from "@/modules/admin/service";
import { Badge, Flash, PageTitle, Table, Tabs } from "./ui";

const STATUSES: { key: QueueStatus; label: string }[] = [
  { key: "pending", label: "Waiting for review" },
  { key: "info_requested", label: "Info requested" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export default async function VerificationQueue({ searchParams }: { searchParams: Promise<{ status?: string; msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  const status = (STATUSES.find((s) => s.key === sp.status)?.key ?? "pending") as QueueStatus;
  const rows = await listCredentialQueue(me, status);

  return (
    <>
      <PageTitle title="Credential verification" subtitle={status === "pending" ? `${rows.length} waiting · oldest first` : `${rows.length} shown`} />
      <Flash msg={sp.msg} error={sp.error} />
      <Tabs current={status} items={STATUSES.map((s) => ({ key: s.key, label: s.label, href: s.key === "pending" ? "/admin" : `/admin?status=${s.key}` }))} />
      <Table head={["Professional", "Credential", "Submitted", "Status", ""]} empty={rows.length === 0 && "Nothing here. New uploads appear automatically."}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <span className="block font-semibold">{r.professionalName}</span>
              <span className="text-[13px] text-muted">{r.professionalEmail}{r.city ? ` · ${r.city}` : ""}</span>
            </td>
            <td>
              <span className="block font-semibold">{r.name}</span>
              {r.issuer && <span className="text-[13px] text-muted">{r.issuer}</span>}
            </td>
            <td className="whitespace-nowrap">{when(r.createdAt)}</td>
            <td><Badge status={r.status} /></td>
            <td className="text-right"><Link href={`/admin/credentials/${r.id}`} className="font-semibold text-brand hover:underline">Review</Link></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
