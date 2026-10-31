import type { Metadata } from "next";
import Link from "next/link";
import { getOrgInvoice } from "@/modules/marketplace/service";
import { formatPaise } from "@/lib/money";
import { Badge, PageTitle } from "@/components/ui";
import { day, getBuyerOrExit, orNotFound } from "../../company";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ orgId: string; invoiceId: string }> }) {
  const { orgId, invoiceId } = await params;
  const { me } = await getBuyerOrExit(orgId);
  const { invoice: i, relatedNumber, bankDetails } = await orNotFound(getOrgInvoice(me.id, orgId, invoiceId));
  const credit = i.kind === "credit_note";
  const rate = i.lines[0]?.gstRateBps ?? 0;
  return (
    <>
      <Link href={`/company/${orgId}/invoices`} className="text-sm font-semibold text-brand hover:underline">← Invoices</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title={`${credit ? "Credit note" : "Tax invoice"} ${i.number}`} subtitle={`Issued ${day(i.issuedAt)}${relatedNumber ? `, against invoice ${relatedNumber}` : ""}`} />
        <a href={`/api/v1/organizations/${orgId}/invoices/${i.id}/pdf`} target="_blank" className="btn-primary">Download PDF</a>
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[999_1_480px] flex-col gap-4 p-6">
          {i.lines.map((l, n) => (
            <div key={n} className="flex flex-wrap justify-between gap-3 text-[15px]">
              <span className="min-w-0 flex-[1_1_300px]">{l.description} <span className="text-[13px] text-muted">SAC {l.sac}</span></span>
              <span className="font-semibold">{formatPaise(l.taxablePaise)}</span>
            </div>
          ))}
          <dl className="ml-auto flex w-full max-w-[320px] flex-col gap-1.5 border-t border-line pt-3 text-[15px]">
            {i.igstPaise ? (
              <div className="flex justify-between"><dt className="text-muted">IGST @ {rate / 100}%</dt><dd>{formatPaise(i.igstPaise)}</dd></div>
            ) : (
              <>
                <div className="flex justify-between"><dt className="text-muted">CGST @ {rate / 200}%</dt><dd>{formatPaise(i.cgstPaise)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">SGST @ {rate / 200}%</dt><dd>{formatPaise(i.sgstPaise)}</dd></div>
              </>
            )}
            <div className="flex justify-between font-bold"><dt>{credit ? "Total credited" : "Total"}</dt><dd>{formatPaise(i.totalPaise)}</dd></div>
          </dl>
          <p className="text-[13px] text-muted">Billed to {i.buyer.name}{i.buyer.gstin ? ` (GSTIN ${i.buyer.gstin})` : ""}. Place of supply: {i.placeOfSupply}.</p>
        </section>
        <aside className="card flex flex-[1_1_280px] flex-col gap-3 p-5">
          {credit ? (
            <Badge status="viewed" label="Credit note" />
          ) : i.status === "paid" ? (
            <p className="text-[15px]"><Badge status="active" label="Paid" /> on {day(i.paidAt)}</p>
          ) : i.status === "cancelled" ? (
            <Badge status="closed" label="Cancelled" />
          ) : (
            <>
              <p className="text-[15px]"><Badge status="pending" label="Payment due" /> {i.dueAt && <>by {day(i.dueAt)}</>}</p>
              {bankDetails ? (
                <>
                  <h2 className="font-bold">Pay by bank transfer</h2>
                  <p className="whitespace-pre-line text-sm">{bankDetails}</p>
                  <p className="text-[13px] text-muted">Quote {i.number} as the reference. We&apos;ll email you when it arrives.</p>
                </>
              ) : (
                <p className="text-sm text-muted">Our team will send you the bank details.</p>
              )}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
