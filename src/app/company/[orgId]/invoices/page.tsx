import type { Metadata } from "next";
import Link from "next/link";
import { listOrgInvoices } from "@/modules/marketplace/service";
import { formatPaise } from "@/lib/money";
import { Badge, PageTitle, Table } from "@/components/ui";
import { day, getBuyerOrExit } from "../company";

export const metadata: Metadata = { title: "Invoices" };
const STATUS: Record<string, [string, string]> = { unpaid: ["pending", "Due"], paid: ["active", "Paid"], cancelled: ["closed", "Cancelled"], issued: ["viewed", "Credit note"] };

export default async function Invoices({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { me } = await getBuyerOrExit(orgId);
  const rows = await listOrgInvoices(me.id, orgId);
  return (
    <>
      <PageTitle title="Invoices" subtitle="GST tax invoices and credit notes for your bookings." />
      <Table head={["Number", "For", "Date", "Amount", "Status", ""]} empty={rows.length === 0 && "No invoices yet. They appear when you pay for a booking or choose pay by invoice."}>
        {rows.map(({ invoice: i, title }) => (
          <tr key={i.id}>
            <td className="font-semibold"><Link href={`/company/${orgId}/invoices/${i.id}`} className="text-brand hover:underline">{i.number}</Link></td>
            <td>{title}</td>
            <td className="whitespace-nowrap">{day(i.issuedAt)}</td>
            <td className="whitespace-nowrap">{i.kind === "credit_note" ? "−" : ""}{formatPaise(i.totalPaise)}</td>
            <td><Badge status={STATUS[i.status][0]} label={i.status === "unpaid" && i.dueAt ? `Due ${day(i.dueAt)}` : STATUS[i.status][1]} /></td>
            <td className="text-right"><a href={`/api/v1/organizations/${orgId}/invoices/${i.id}/pdf`} target="_blank" className="font-semibold text-brand hover:underline">PDF</a></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
