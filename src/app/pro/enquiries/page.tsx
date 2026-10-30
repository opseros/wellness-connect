import type { Metadata } from "next";
import Link from "next/link";
import { listMyEnquiries } from "@/modules/marketplace/service";
import { paiseRange } from "@/lib/money";
import { Badge, Flash, PageTitle, Table } from "@/components/ui";
import { day, getProOrExit, MODE_LABEL } from "../me";

export const metadata: Metadata = { title: "Enquiries" };

const label: Record<string, string> = { sent: "New", viewed: "Opened", responded: "Proposal sent", declined: "Declined", closed: "Closed" };

export default async function Enquiries({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { me } = await getProOrExit();
  const [rows, sp] = await Promise.all([listMyEnquiries(me.id), searchParams]);
  return (
    <>
      <PageTitle title="Enquiries" subtitle="Companies that matched with you and asked for a proposal." />
      <Flash msg={sp.msg} error={sp.error} />
      <Table head={["Requirement", "Company", "Format", "Budget", "Received", "Status"]} empty={rows.length === 0 && "No enquiries yet. Once you're verified and discoverable, companies' requests appear here."}>
        {rows.map((e) => (
          <tr key={e.id} className={e.status === "sent" ? "bg-[#fffaf0]" : ""}>
            <td>
              <Link href={`/pro/enquiries/${e.id}`} className="block font-semibold text-brand hover:underline">{e.title}</Link>
              <span className="text-[13px] text-muted">{e.categoryName}</span>
            </td>
            <td>{e.orgName}</td>
            <td className="whitespace-nowrap">{MODE_LABEL[e.deliveryMode]}{e.city ? ` · ${e.city}` : ""}<br /><span className="text-[13px] text-muted">{e.participants} people</span></td>
            <td className="whitespace-nowrap">{paiseRange(e.budgetMinPaise, e.budgetMaxPaise)}</td>
            <td className="whitespace-nowrap">{day(e.createdAt)}</td>
            <td>
              <Badge status={e.requirementStatus !== "published" && (e.status === "sent" || e.status === "viewed") ? "closed" : e.status} label={e.requirementStatus !== "published" && (e.status === "sent" || e.status === "viewed") ? "Closed" : label[e.status]} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
