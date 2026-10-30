import type { Metadata } from "next";
import Link from "next/link";
import { listOrgProposals } from "@/modules/marketplace/service";
import { formatPaise } from "@/lib/money";
import { Badge, Flash, PageTitle, Table } from "@/components/ui";
import { dayTime, getBuyerOrExit } from "../company";

export const metadata: Metadata = { title: "Proposals" };
const LABEL: Record<string, string> = { submitted: "To review", revision_requested: "Changes requested", accepted: "Accepted", rejected: "Not selected", withdrawn: "Withdrawn" };

export default async function Proposals({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId } = await params;
  const [{ me }, sp] = await Promise.all([getBuyerOrExit(orgId), searchParams]);
  const rows = await listOrgProposals(me.id, orgId);
  // Ones needing a decision first.
  const sorted = [...rows].sort((a, b) => Number(b.proposal.status === "submitted" && b.requirementStatus === "published") - Number(a.proposal.status === "submitted" && a.requirementStatus === "published"));
  return (
    <>
      <PageTitle title="Proposals" subtitle="Every proposal professionals have sent your company." />
      <Flash msg={sp.msg} error={sp.error} />
      <Table head={["Requirement", "Professional", "Fee", "Proposed start", "Status", ""]} empty={rows.length === 0 && "No proposals yet. Send enquiries from a requirement's matches."}>
        {sorted.map((p) => (
          <tr key={p.proposal.id}>
            <td className="font-semibold">{p.title}</td>
            <td>{p.name}</td>
            <td className="whitespace-nowrap">{formatPaise(p.proposal.feePaise)}</td>
            <td className="whitespace-nowrap">{dayTime(p.proposal.proposedStart)}</td>
            <td><Badge status={p.proposal.status === "submitted" ? "pending" : p.proposal.status} label={LABEL[p.proposal.status]} /></td>
            <td className="whitespace-nowrap text-right">
              <Link href={`/company/${orgId}/requirements/${p.requirementId}/proposals`} className="font-semibold text-brand hover:underline">Compare</Link>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
