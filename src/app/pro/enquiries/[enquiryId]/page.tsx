import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMyEnquiry } from "@/modules/marketplace/service";
import { AppError } from "@/lib/errors";
import { formatPaise, paiseRange } from "@/lib/money";
import { Badge, Flash, PageTitle } from "@/components/ui";
import { declineEnquiryAction, reviseProposalAction, submitProposalAction } from "../../actions";
import { ProposalForm } from "./proposal-form";
import { day, dayTime, getProOrExit, istParts, MODE_LABEL, tomorrowInIndia } from "../../me";

const PROPOSAL_LABEL: Record<string, string> = { submitted: "Waiting for the company", accepted: "Accepted", rejected: "Not selected", withdrawn: "Withdrawn", revision_requested: "Changes requested" };

export const metadata: Metadata = { title: "Enquiry" };

export default async function EnquiryDetail({ params, searchParams }: { params: Promise<{ enquiryId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { me } = await getProOrExit();
  const [{ enquiryId }, sp] = await Promise.all([params, searchParams]);
  const d = await getMyEnquiry(me.id, enquiryId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const r = d.requirement;
  const tomorrow = tomorrowInIndia();

  return (
    <>
      <Link href="/pro/enquiries" className="text-sm font-semibold text-brand hover:underline">← Enquiries</Link>
      <PageTitle title={r.title} subtitle={`${d.orgName} · ${d.categoryName}`} />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[1_1_360px] flex-col gap-4 p-6">
          <h2 className="font-bold">What they need</h2>
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[15px]">
            <dt className="text-muted">Format</dt><dd>{MODE_LABEL[r.deliveryMode]}{r.city ? ` · ${r.city}` : ""}</dd>
            <dt className="text-muted">Participants</dt><dd>{r.participants}</dd>
            <dt className="text-muted">Budget</dt><dd>{paiseRange(r.budgetMinPaise, r.budgetMaxPaise)}</dd>
            <dt className="text-muted">Preferred date</dt><dd>{r.preferredDate ? day(r.preferredDate) : "Flexible"}</dd>
            {r.mustLanguages.length > 0 && (<><dt className="text-muted">Languages</dt><dd>{r.mustLanguages.join(", ")}</dd></>)}
            <dt className="text-muted">Received</dt><dd>{dayTime(d.enquiry.createdAt)}</dd>
          </dl>
          {r.details && <p className="whitespace-pre-line border-t border-line pt-4 text-[15px] leading-relaxed">{r.details}</p>}
          <p className="text-[13px] text-muted">Companies share aggregate needs only, never individual employees&apos; health information.</p>
        </section>

        <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
          {d.proposal?.status === "revision_requested" && r.status === "published" ? (
            <div className="flex flex-col gap-3">
              <p className="rounded-xl bg-[#fbf0dc] px-4 py-3 text-sm text-[#7a4b00]">
                <span className="font-semibold">The company asked for changes: </span>
                {d.proposal.revisionNote}
              </p>
              <ProposalForm
                title="Send a revised proposal"
                action={reviseProposalAction}
                hidden={{ enquiryId: d.enquiry.id, proposalId: d.proposal.id }}
                min={tomorrow}
                budget={paiseRange(r.budgetMinPaise, r.budgetMaxPaise)}
                defaults={{
                  fee: d.proposal.feePaise / 100,
                  participants: d.proposal.maxParticipants,
                  ...istParts(d.proposal.proposedStart),
                  inclusions: d.proposal.inclusions,
                  message: d.proposal.message,
                  cancellationDays: d.proposal.freeCancellationDays,
                }}
                submit="Send revised proposal"
              />
            </div>
          ) : d.proposal ? (
            <div className="card flex flex-col gap-3 p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold">Your proposal</h2>
                <Badge status={d.proposal.status} label={PROPOSAL_LABEL[d.proposal.status]} />
              </div>
              <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15px]">
                <dt className="text-muted">Fee</dt><dd className="font-semibold">{formatPaise(d.proposal.feePaise)}</dd>
                <dt className="text-muted">Start</dt><dd>{dayTime(d.proposal.proposedStart)}</dd>
                <dt className="text-muted">Up to</dt><dd>{d.proposal.maxParticipants} participants</dd>
                <dt className="text-muted">Free cancellation</dt><dd>Up to {d.proposal.freeCancellationDays} days before</dd>
              </dl>
              {d.proposal.inclusions && <p className="whitespace-pre-line text-sm"><span className="font-semibold">Includes: </span>{d.proposal.inclusions}</p>}
              {d.proposal.revisionCount > 0 && <p className="text-[13px] text-muted">Revised {d.proposal.revisionCount} time{d.proposal.revisionCount === 1 ? "" : "s"}.</p>}
              <Link href="/pro/proposals" className="text-sm font-semibold text-brand hover:underline">All proposals and bookings →</Link>
            </div>
          ) : d.canPropose ? (
            <ProposalForm
              title="Send a proposal"
              action={submitProposalAction}
              hidden={{ enquiryId: d.enquiry.id, requirementId: r.id }}
              min={tomorrow}
              budget={paiseRange(r.budgetMinPaise, r.budgetMaxPaise)}
              defaults={{ participants: r.participants, date: r.preferredDate ?? undefined, time: "10:00", cancellationDays: 7 }}
              submit="Send proposal"
            />
          ) : (
            <p className="card p-6 text-[15px] text-muted">
              {d.enquiry.status === "declined" ? "You declined this enquiry." : "This requirement is closed and no longer accepts proposals."}
            </p>
          )}
          {(d.enquiry.status === "sent" || d.enquiry.status === "viewed") && !d.proposal && r.status === "published" && (
            <form action={declineEnquiryAction} className="card flex flex-wrap items-center justify-between gap-3 p-5">
              <input type="hidden" name="enquiryId" value={d.enquiry.id} />
              <span className="text-sm text-muted">Not a fit? Let the company know so they can move on.</span>
              <button className="btn-outline">Decline enquiry</button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
