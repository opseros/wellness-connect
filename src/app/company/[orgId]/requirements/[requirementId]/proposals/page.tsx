import type { Metadata } from "next";
import Link from "next/link";
import { compareProposals } from "@/modules/marketplace/service";
import { formatPaise } from "@/lib/money";
import { Badge, Flash, PageTitle } from "@/components/ui";
import { acceptProposalAction, remindAction, requestRevisionAction } from "../../../../actions";
import { dayTime, getBuyerOrExit, MODE_LABEL, orNotFound } from "../../../company";

export const metadata: Metadata = { title: "Compare proposals" };

function responseTime(ms: number | null) {
  if (ms == null) return "—";
  const h = ms / 3_600_000;
  if (h < 1) return "Within an hour";
  if (h < 24) return `Within ${Math.ceil(h)} hours`;
  const d = Math.ceil(h / 24);
  return `Within ${d} day${d === 1 ? "" : "s"}`;
}

export default async function CompareProposals({ params, searchParams }: { params: Promise<{ orgId: string; requirementId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId, requirementId } = await params;
  const [{ me }, sp] = await Promise.all([getBuyerOrExit(orgId), searchParams]);
  const c = await orNotFound(compareProposals(me.id, orgId, requirementId));
  const r = c.requirement;
  const back = `/company/${orgId}/requirements/${r.id}/proposals`;
  const received = c.columns.filter((x) => x.proposal).length;
  const waiting = c.columns.length - received;
  const decided = r.status !== "published";

  const rows: { label: string; cell: (col: (typeof c.columns)[number]) => React.ReactNode }[] = [
    { label: "Fee", cell: (x) => (x.proposal ? <span className="text-[17px] font-bold">{formatPaise(x.proposal.feePaise)} <span className="text-[13px] font-normal text-muted">+ GST</span></span> : <span className="text-muted">Awaiting proposal</span>) },
    { label: "Format", cell: (x) => (x.proposal ? `${MODE_LABEL[r.deliveryMode]}, up to ${x.proposal.maxParticipants} people` : "—") },
    { label: "Proposed date", cell: (x) => (x.proposal ? dayTime(x.proposal.proposedStart) : "—") },
    { label: "Includes", cell: (x) => (x.proposal?.inclusions ? <span className="whitespace-pre-line">{x.proposal.inclusions}</span> : "—") },
    { label: "Message", cell: (x) => (x.proposal?.message ? <span className="whitespace-pre-line text-muted">{x.proposal.message}</span> : "—") },
    { label: "Cancellation", cell: (x) => (x.proposal ? (x.proposal.freeCancellationDays ? `Free up to ${x.proposal.freeCancellationDays} days before` : "No free cancellation") : "—") },
    { label: "Responded", cell: (x) => (x.proposal ? responseTime(x.respondedInMs) : `Enquiry sent ${dayTime(x.enquirySentAt)}`) },
  ];

  return (
    <>
      <Link href={`/company/${orgId}/requirements/${r.id}`} className="text-sm font-semibold text-brand hover:underline">← Matched professionals</Link>
      <PageTitle title="Compare proposals" subtitle={`${r.title} · ${received} proposal${received === 1 ? "" : "s"} received${waiting ? `, ${waiting} awaiting response` : ""}`} />
      <Flash msg={sp.msg} error={sp.error} />
      {c.columns.length === 0 ? (
        <p className="card p-6 text-[15px] text-muted">
          No enquiries sent yet. <Link href={`/company/${orgId}/requirements/${r.id}`} className="font-semibold text-brand hover:underline">Shortlist professionals</Link> to get proposals.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 220 + c.columns.length * 240 }}>
            <thead>
              <tr className="align-top">
                <th className="w-[160px] px-4 py-4 text-left font-semibold text-muted">Detail</th>
                {c.columns.map((x) => (
                  <th key={x.enquiryId} className="px-4 py-4 text-left">
                    <span className="block text-[16px] font-bold">
                      {x.profileId ? <Link href={`/p/${x.profileId}`} target="_blank" className="hover:underline">{x.name}</Link> : x.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 font-normal text-muted">
                      {x.matchScore != null && <>Match score {x.matchScore}</>}
                      {x.proposal && x.proposal.status !== "submitted" && <Badge status={x.proposal.status} label={x.proposal.status === "revision_requested" ? "Changes requested" : undefined} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t [&>tr]:border-[#eef1ef] [&_td]:px-4 [&_td]:py-3 [&_td]:align-top">
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="font-semibold text-muted">{row.label}</td>
                  {c.columns.map((x) => (
                    <td key={x.enquiryId}>{row.cell(x)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="font-semibold text-muted">Actions</td>
                {c.columns.map((x) => (
                  <td key={x.enquiryId}>
                    {decided ? (
                      x.proposal?.status === "accepted" ? <Badge status="accepted" label="Booked" /> : <span className="text-muted">—</span>
                    ) : x.proposal?.status === "submitted" ? (
                      <div className="flex flex-col gap-2">
                        <form action={acceptProposalAction}>
                          <input type="hidden" name="orgId" value={orgId} />
                          <input type="hidden" name="proposalId" value={x.proposal.id} />
                          <input type="hidden" name="back" value={back} />
                          <button className="btn-primary w-full">Accept proposal</button>
                        </form>
                        <details>
                          <summary className="btn-outline w-full cursor-pointer list-none">Request revision</summary>
                          <form action={requestRevisionAction} className="mt-2 flex flex-col gap-2">
                            <input type="hidden" name="orgId" value={orgId} />
                            <input type="hidden" name="proposalId" value={x.proposal.id} />
                            <input type="hidden" name="back" value={back} />
                            <label htmlFor={`note-${x.proposal.id}`} className="sr-only">What should change?</label>
                            <textarea id={`note-${x.proposal.id}`} name="note" rows={3} required minLength={5} maxLength={1000} className="input py-2" placeholder="e.g. Could you bring the fee to ₹40,000, or move it to 14:00?" />
                            <button className="btn-outline">Send to {x.name.split(" ")[0]}</button>
                          </form>
                        </details>
                      </div>
                    ) : x.proposal?.status === "revision_requested" ? (
                      <p className="text-[13px] text-muted">Waiting for a revised proposal. You asked: “{x.proposal.revisionNote}”</p>
                    ) : !x.proposal && (x.enquiryStatus === "sent" || x.enquiryStatus === "viewed") ? (
                      <form action={remindAction}>
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="enquiryId" value={x.enquiryId} />
                        <input type="hidden" name="back" value={back} />
                        <button className="btn-outline w-full" disabled={!x.canRemind} title={x.remindedAt ? `Last reminded ${dayTime(x.remindedAt)}` : undefined}>
                          {x.canRemind ? "Send reminder" : "Reminder sent"}
                        </button>
                      </form>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {!decided && received > 0 && <p className="text-[13px] text-muted">Accepting one proposal declines the others automatically and notifies each professional.</p>}
      {c.declined.length > 0 && <p className="text-[13px] text-muted">Declined: {c.declined.join(", ")}.</p>}
    </>
  );
}
