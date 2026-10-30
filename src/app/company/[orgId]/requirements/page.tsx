import type { Metadata } from "next";
import Link from "next/link";
import { listOrgRequirements } from "@/modules/marketplace/service";
import { paiseRange } from "@/lib/money";
import { Badge, Flash, PageTitle, Table } from "@/components/ui";
import { day, getBuyerOrExit, MODE_LABEL, REQ_STATUS } from "../company";

export const metadata: Metadata = { title: "Requirements" };
const tone: Record<string, string> = { draft: "pending", published: "active", closed: "submitted", withdrawn: "closed" };

export default async function Requirements({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId } = await params;
  const [{ me }, sp] = await Promise.all([getBuyerOrExit(orgId), searchParams]);
  const rows = await listOrgRequirements(me.id, orgId);
  const base = `/company/${orgId}/requirements`;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Requirements" subtitle="What your teams need, from draft to booked." />
        <Link href={`${base}/new`} className="btn-primary">+ New requirement</Link>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      <Table head={["Requirement", "Format", "Budget", "Preferred date", "Status"]} empty={rows.length === 0 && "No requirements yet."}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={r.status === "draft" ? `${base}/${r.id}/edit` : `${base}/${r.id}`} className="font-semibold text-brand hover:underline">{r.title}</Link>
            </td>
            <td className="whitespace-nowrap">{MODE_LABEL[r.deliveryMode]}{r.city ? ` · ${r.city}` : ""}<br /><span className="text-[13px] text-muted">{r.participants} participants</span></td>
            <td className="whitespace-nowrap">{paiseRange(r.budgetMinPaise, r.budgetMaxPaise)}</td>
            <td className="whitespace-nowrap">{r.preferredDate ? day(r.preferredDate) : "Flexible"}</td>
            <td><Badge status={tone[r.status]} label={REQ_STATUS[r.status]} /></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
