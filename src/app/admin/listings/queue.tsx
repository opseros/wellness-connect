import Link from "next/link";
import { getStaffOrExit, when } from "../staff";
import { listListingQueue, staffSeesHospitals, type ListingQueueStatus } from "@/modules/admin/service";
import { notFound } from "next/navigation";
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

const TEXT = {
  homestay: { title: "Homestays", subtitle: "Stays for rest, recovery and retreats", path: "/admin/homestays" },
  hospital: { title: "Hospitals", subtitle: "Care & Travel: hospitals that receive travelling patients", path: "/admin/hospitals" },
  facility: { title: "Gyms, studios and wellness centres", subtitle: "Gyms, yoga and pilates studios, pools, spas and wellness centres", path: "/admin/facilities" },
} as const;

/** Verification queue for one kind of listing. Homestays and hospitals are reviewed separately. */
export async function ListingQueuePage({ kind, searchParams }: { kind: "homestay" | "hospital" | "facility"; searchParams: Promise<{ status?: string; msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  if (kind === "hospital" && !(await staffSeesHospitals(me))) notFound();
  const t = TEXT[kind];
  const status = STATUSES.find((s) => s.key === sp.status)?.key ?? "pending";
  const rows = await listListingQueue(me, status, kind);
  return (
    <>
      <PageTitle title={t.title} subtitle={`${t.subtitle} · ${status === "pending" ? `${rows.length} waiting, oldest first` : `${rows.length} shown`}`} />
      <Flash msg={sp.msg} error={sp.error} />
      <Tabs current={status} items={STATUSES.map((s) => ({ key: s.key, label: s.label, href: s.key === "pending" ? t.path : `${t.path}?status=${s.key}` }))} />
      <Table head={["Name", "City", "Submitted", "Verification", "Standing", ""]} empty={rows.length === 0 && "Nothing here."}>
        {rows.map((r) => (
          <tr key={r.orgId}>
            <td className="font-semibold">{r.name}</td>
            <td>{r.city || "—"}</td>
            <td className="whitespace-nowrap">{when(r.submittedAt)}</td>
            <td><Badge status={r.status} label={STATUS_LABEL[r.status]} /></td>
            <td>{r.removedAt ? <Badge status="removed" /> : r.suspendedAt ? <Badge status="suspended" /> : <Badge status="active" />}</td>
            <td className="text-right whitespace-nowrap">
              <Link href={`${t.path}/${r.orgId}`} className="font-semibold text-brand hover:underline">{r.status === "pending" ? "Review" : "Open"}</Link>
              <Link href={`/admin/organizations/${r.orgId}`} className="ml-4 font-semibold text-brand hover:underline">Manage</Link>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
