import Link from "next/link";
import { getStaffOrExit, when } from "../staff";
import { listListingQueue, type ListingQueueStatus } from "@/modules/admin/service";
import { STATUS_LABEL } from "@/modules/listings/service";
import { Badge, Flash, PageTitle, Table, Tabs } from "../ui";

const STATUSES: { key: ListingQueueStatus; label: string }[] = [
  { key: "pending", label: "Waiting for review" },
  { key: "changes_requested", label: "Changes requested" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Not approved" },
  { key: "draft", label: "Not submitted" },
  { key: "all", label: "All" },
];

export default async function ListingQueue({ searchParams }: { searchParams: Promise<{ status?: string; msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s.key === sp.status)?.key ?? "pending";
  const rows = await listListingQueue(me, status);
  return (
    <>
      <PageTitle title="Homestays & hospitals" subtitle={status === "pending" ? `${rows.length} waiting · oldest first` : `${rows.length} shown`} />
      <Flash msg={sp.msg} error={sp.error} />
      <Tabs current={status} items={STATUSES.map((s) => ({ key: s.key, label: s.label, href: s.key === "pending" ? "/admin/listings" : `/admin/listings?status=${s.key}` }))} />
      <Table head={["Name", "Type", "City", "Submitted", "Status", ""]} empty={rows.length === 0 && "Nothing here."}>
        {rows.map((r) => (
          <tr key={r.orgId}>
            <td className="font-semibold">{r.name}</td>
            <td>{r.kind === "hospital" ? "Hospital" : "Homestay"}</td>
            <td>{r.city || "—"}</td>
            <td className="whitespace-nowrap">{when(r.submittedAt)}</td>
            <td><Badge status={r.status} label={STATUS_LABEL[r.status]} /></td>
            <td className="text-right"><Link href={`/admin/listings/${r.orgId}`} className="font-semibold text-brand hover:underline">{r.status === "pending" ? "Review" : "Open"}</Link></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
