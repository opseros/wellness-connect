import { getStaffOrExit } from "../staff";
import { listDueCreditFundings, memberBookingsSummary } from "@/modules/admin/service";
import { periodLabel } from "@/modules/marketplace/credits";
import { recordCreditFundingAction } from "../actions";
import { Flash, PageTitle, Table } from "../ui";

const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

export default async function AdminCredits({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const [rows, sum, sp] = await Promise.all([listDueCreditFundings(me), memberBookingsSummary(me), searchParams]);
  return (
    <>
      <PageTitle title="Wellness credits" subtitle="Monthly prepayments companies owe. Record each one when the money reaches the bank; credits switch on for that company straight away." />
      <Flash msg={sp.msg} error={sp.error} />
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-line"><dt className="text-[13px] text-muted">Prepaid this month</dt><dd className="text-[22px] font-bold tabular-nums">{rs(sum.fundedPaise)}</dd><dd className="text-[12.5px] text-muted">{sum.companies} compan{sum.companies === 1 ? "y" : "ies"}</dd></div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-line"><dt className="text-[13px] text-muted">Spent with credits</dt><dd className="text-[22px] font-bold tabular-nums">{rs(sum.spentPaise)}</dd></div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-line"><dt className="text-[13px] text-muted">Moosam fees</dt><dd className="text-[22px] font-bold tabular-nums">{rs(sum.feePaise)}</dd></div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-line"><dt className="text-[13px] text-muted">Waiting for payment</dt><dd className="text-[22px] font-bold tabular-nums">{rs(sum.duePaise)}</dd><dd className="text-[12.5px] text-muted">{sum.dueCount} request{sum.dueCount === 1 ? "" : "s"}</dd></div>
      </dl>
      <Table head={["Company", "Month", "People × allowance", "Unspent carried", "Due", "Record payment"]} empty={rows.length === 0 && "No prepayments waiting."}>
        {rows.map(({ f, orgName }) => (
          <tr key={f.id}>
            <td className="font-semibold">{orgName}</td>
            <td>{periodLabel(f.period)}</td>
            <td className="tabular-nums">{f.seats} × {rs(f.allowancePaise)}</td>
            <td className="tabular-nums">{rs(f.carriedPaise)}</td>
            <td className="font-semibold tabular-nums">{rs(f.duePaise)}</td>
            <td>
              <form action={recordCreditFundingAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="fundingId" value={f.id} />
                <label className="sr-only" htmlFor={`ref-${f.id}`}>Bank reference for {orgName}</label>
                <input id={`ref-${f.id}`} name="reference" required minLength={4} maxLength={80} placeholder="UTR / NEFT reference" className="input min-h-9 w-44" />
                <button className="btn-primary min-h-9 px-3 text-sm">Mark paid</button>
              </form>
            </td>
          </tr>
        ))}
      </Table>
      <p className="text-[13px] text-muted">Recording a payment is logged in the audit trail with the reference. Online payment through Razorpay will record these automatically once card payments go live.</p>
    </>
  );
}
