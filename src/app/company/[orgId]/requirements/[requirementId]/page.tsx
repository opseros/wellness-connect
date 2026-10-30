import type { Metadata } from "next";
import Link from "next/link";
import { getMatches, getRequirement, listRequirementEnquiries } from "@/modules/marketplace/service";
import { profileIdsForUsers } from "@/modules/professionals/service";
import { paiseRange, formatPaise } from "@/lib/money";
import { Badge, Flash, PageTitle } from "@/components/ui";
import { remindAction, sendEnquiriesAction, withdrawRequirementAction } from "../../../actions";
import { day, dayTime, getBuyerOrExit, MODE_LABEL, orNotFound, REQ_STATUS } from "../../company";

export const metadata: Metadata = { title: "Matched professionals" };

const FACTOR_LABEL: Record<string, string> = {
  expertise: "Expertise",
  relevance: "Requirement fit",
  credentials: "Credentials",
  experience: "Experience",
  budget: "Budget fit",
  location: "Location & delivery",
};
const REASON_LABEL: Record<string, string> = {
  not_discoverable: "not taking new work",
  not_in_category: "don't offer this category",
  not_verified: "not verified yet",
  missing_credential: "no approved credential for this category",
  delivery_mode: "don't deliver this way",
  location: "in a different city",
  language: "don't speak a required language",
  experience: "less experience than required",
};
const ENQ_LABEL: Record<string, string> = { sent: "Enquiry sent", viewed: "Opened", responded: "Proposal received", declined: "Declined", closed: "Closed" };

const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default async function RequirementMatches({ params, searchParams }: { params: Promise<{ orgId: string; requirementId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId, requirementId } = await params;
  const [{ me }, sp] = await Promise.all([getBuyerOrExit(orgId), searchParams]);
  const { requirement: r, categoryName } = await orNotFound(getRequirement(me.id, orgId, requirementId));
  const [m, enquiries] = await Promise.all([getMatches(me.id, orgId, requirementId), listRequirementEnquiries(me.id, orgId, requirementId)]);
  const profiles = await profileIdsForUsers(m.matches.map((x) => x.candidate.userId));
  const contacted = new Map(enquiries.map((e) => [e.enquiry.professionalUserId, e]));
  const open = r.status === "published";
  const base = `/company/${orgId}/requirements/${r.id}`;
  const reasonCounts: Record<string, number> = {};
  for (const e of m.excluded) for (const reason of e.reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  const proposals = enquiries.filter((e) => e.proposal).length;
  const selectable = m.matches.filter((x) => !contacted.has(x.candidate.userId));

  return (
    <>
      <Link href={`/company/${orgId}/requirements`} className="text-sm font-semibold text-brand hover:underline">← Requirements</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle title={r.title} subtitle={[categoryName, `${MODE_LABEL[r.deliveryMode]}${r.city ? ` · ${r.city}` : ""}`, `${r.participants} participants`, paiseRange(r.budgetMinPaise, r.budgetMaxPaise), r.preferredDate ? day(r.preferredDate) : null].filter(Boolean).join("  ·  ")} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={r.status === "published" ? "active" : r.status === "draft" ? "pending" : "closed"} label={REQ_STATUS[r.status]} />
          {proposals > 0 && <Link href={`${base}/proposals`} className="btn-primary">Compare {proposals} proposal{proposals === 1 ? "" : "s"}</Link>}
          {(r.status === "draft" || r.status === "published") && <Link href={`${base}/edit`} className="btn-outline">Edit</Link>}
        </div>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      {r.status === "draft" && (
        <p className="rounded-xl bg-[#fbf0dc] px-4 py-3 text-sm text-[#7a4b00]">
          This is a draft. <Link href={`${base}/edit`} className="font-semibold underline">Publish it</Link> to send enquiries. These are the matches it would get today.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-[15px]">
          <p>
            <span className="font-bold">{m.matches.length} professional{m.matches.length === 1 ? "" : "s"}</span> meet every must-have.
            {m.excluded.length > 0 && <> {m.excluded.length} {m.excluded.length === 1 ? "was" : "were"} excluded by hard filters.</>}
          </p>
          {m.excluded.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-brand">Why excluded?</summary>
              <ul className="mt-2 flex flex-col gap-1 text-muted">
                {Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                  <li key={k}>{n} {REASON_LABEL[k] ?? k}</li>
                ))}
              </ul>
              <p className="mt-2 text-[13px] text-muted">Loosen a must-have to see more people. Scores never override must-haves.</p>
            </details>
          )}
        </div>

        {m.matches.length === 0 ? (
          <p className="card p-6 text-[15px] text-muted">No one meets every must-have yet. Try a wider budget, another delivery mode, or fewer must-haves.</p>
        ) : (
          <form action={sendEnquiriesAction} className="flex flex-col gap-3">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="requirementId" value={r.id} />
            {m.matches.map(({ candidate: c, score, factors }) => {
              const sent = contacted.get(c.userId);
              const svc = c.services.filter((s) => s.active && s.categoryId === r.categoryId);
              const price = svc.length ? paiseRange(Math.min(...svc.map((s) => s.priceMinPaise)), Math.max(...svc.map((s) => s.priceMaxPaise))) : null;
              const pid = profiles.get(c.userId);
              return (
                <article key={c.userId} className="card flex flex-wrap gap-5 p-5 has-[:checked]:border-brand has-[:checked]:ring-1 has-[:checked]:ring-brand">
                  <div className="flex min-w-0 flex-[999_1_360px] gap-4">
                    <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg font-bold text-brand-dark">{initials(c.name)}</span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[17px] font-bold">{c.name}</span>
                      <span className="text-sm text-muted">{[c.headline, c.city].filter(Boolean).join(" · ")}</span>
                      <span className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                        {c.verificationStatus === "verified" && <span className="font-semibold text-brand-dark">✓ Credentials verified</span>}
                        <span>{c.yearsExperience} years</span>
                        {price && <span>{price} per session</span>}
                        {c.languages.length > 0 && <span className="text-muted">{c.languages.join(", ")}</span>}
                      </span>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {sent ? (
                          <Badge status={sent.proposal ? "responded" : sent.enquiry.status} label={sent.proposal ? "Proposal received" : ENQ_LABEL[sent.enquiry.status]} />
                        ) : open ? (
                          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#c9d1cc] px-3 text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                            <input type="checkbox" name="pro" value={c.userId} className="size-4 accent-[#0f6b5c]" />
                            Shortlist
                          </label>
                        ) : null}
                        {pid && <Link href={`/p/${pid}`} className="text-sm font-semibold text-brand hover:underline" target="_blank">View profile</Link>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-[1_1_240px] flex-col gap-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted">Match score</span>
                      <span className="text-2xl font-bold text-brand-dark">{score}</span>
                    </div>
                    {Object.entries(factors).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[120px_1fr_32px] items-center gap-2 text-[12.5px]">
                        <span className="text-muted">{FACTOR_LABEL[k] ?? k}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-ground" aria-hidden>
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${v}%` }} />
                        </span>
                        <span className="text-right tabular-nums">{v}</span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
            {open && selectable.length > 0 && (
              <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 p-4 shadow-sm backdrop-blur">
                <span className="text-sm text-muted">Shortlist the professionals you&apos;d like proposals from. They see your requirement, not your employees.</span>
                <button className="btn-primary">Send enquiry to shortlist →</button>
              </div>
            )}
          </form>
        )}
      </section>

      {enquiries.length > 0 && (
        <section id="enquiries" className="card flex flex-col gap-2 p-5">
          <h2 className="text-lg font-bold">Enquiries sent</h2>
          <ul className="flex flex-col divide-y divide-line">
            {enquiries.map((e) => (
              <li key={e.enquiry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="flex flex-col">
                  <span className="font-semibold">{e.name}</span>
                  <span className="text-[13px] text-muted">Sent {dayTime(e.enquiry.createdAt)}{e.enquiry.matchScore != null ? ` · match ${e.enquiry.matchScore}` : ""}</span>
                </span>
                <span className="flex items-center gap-3">
                  {e.proposal ? (
                    <span>
                      {formatPaise(e.proposal.feePaise)} · <Badge status={e.proposal.status} label={e.proposal.status === "revision_requested" ? "Changes requested" : undefined} />
                    </span>
                  ) : (
                    <Badge status={e.enquiry.status} label={ENQ_LABEL[e.enquiry.status]} />
                  )}
                  {open && !e.proposal && (e.enquiry.status === "sent" || e.enquiry.status === "viewed") && (
                    <form action={remindAction}>
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="enquiryId" value={e.enquiry.id} />
                      <input type="hidden" name="back" value={`${base}#enquiries`} />
                      <button className="font-semibold text-brand hover:underline">Send reminder</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(r.status === "draft" || r.status === "published") && (
        <form action={withdrawRequirementAction} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line p-4 text-sm">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="requirementId" value={r.id} />
          <span className="text-muted">No longer needed? Withdrawing closes it and tells anyone you contacted.</span>
          <button className="btn-outline text-[#9b2c1f]">Withdraw requirement</button>
        </form>
      )}
    </>
  );
}
