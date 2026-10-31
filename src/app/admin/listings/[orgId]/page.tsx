import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getStaffOrExit, when } from "../../staff";
import { getListingForReview } from "@/modules/admin/service";
import { DOC_CHECKLIST, FEATURE_LABEL, SERVES_LABEL, STATUS_LABEL } from "@/modules/listings/service";
import { decideListingAction } from "../../actions";
import { Badge, Flash, PageTitle } from "../../ui";

const rupees = (p: number | null) => (p === null ? "—" : `₹${(p / 100).toLocaleString("en-IN")}`);

export default async function ListingReview({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const d = await getListingForReview(me, orgId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const l = d.listing;
  const homestay = l.kind === "homestay";
  const docLabel = Object.fromEntries(DOC_CHECKLIST[l.kind].map((c) => [c.key, c.label]));
  const canDecide = l.status === "pending" || l.status === "verified";
  const rows: [string, React.ReactNode][] = [
    ["Status", <Badge key="s" status={l.status} label={STATUS_LABEL[l.status]} />],
    ["Location", [l.area, l.city, l.state].filter(Boolean).join(", ") || "—"],
    ["Tagline", l.tagline || "—"],
    ["About", <span key="a" className="whitespace-pre-line">{l.about || "—"}</span>],
    ...(homestay
      ? ([
          ["Rooms / guests", `${l.rooms ?? "—"} rooms · up to ${l.maxGuests ?? "—"} guests`],
          ["Price from", `${rupees(l.priceFromPaise)} a night`],
          ["Features", l.features.map((f) => FEATURE_LABEL[f as keyof typeof FEATURE_LABEL] ?? f).join(", ") || "—"],
          ["House rules", l.houseRules || "—"],
        ] as [string, React.ReactNode][])
      : ([
          ["Specialties", l.specialties.join(", ") || "—"],
          ["Accreditations claimed", l.accreditations.join(", ") || "None"],
          ["Patients", SERVES_LABEL[l.serves]],
          ["International desk", `${l.internationalDesk ? "Yes" : "No"} · visa letters: ${l.visaLetter ? "yes" : "no"}`],
          ["Beds", l.beds ?? "—"],
        ] as [string, React.ReactNode][])),
    ["Languages", l.languages.join(", ") || "—"],
    ["Contact (private)", [l.contactEmail, l.contactPhone, l.website].filter(Boolean).join(" · ") || "—"],
    ["Team", d.team.map((t) => `${t.name} (${t.role}, ${t.email})`).join("; ")],
    ["Submitted", when(l.submittedAt)],
  ];
  if (l.reviewedAt) rows.push(["Last decision", `${d.reviewerName ?? "Staff"} · ${when(l.reviewedAt)}${l.reviewNote ? ` · "${l.reviewNote}"` : ""}`]);

  return (
    <>
      <span className="flex flex-wrap justify-between gap-3">
        <Link href={homestay ? "/admin/homestays" : "/admin/hospitals"} className="text-sm font-semibold text-brand hover:underline">← {homestay ? "Homestays" : "Hospitals"}</Link>
        <Link href={`/admin/organizations/${orgId}`} className="text-sm font-semibold text-brand hover:underline">Edit, suspend or remove →</Link>
      </span>
      <PageTitle title={d.org.name} subtitle={homestay ? "Homestay" : "Hospital · Care & Travel"} />
      {d.org.removedAt ? (
        <p className="rounded-xl bg-[#fbe9e7] px-4 py-3 text-sm text-[#9b2c1f]">Removed {when(d.org.removedAt)}. Kept for records only.</p>
      ) : d.org.suspendedAt ? (
        <p className="rounded-xl bg-[#fbe9e7] px-4 py-3 text-sm text-[#9b2c1f]">Suspended {when(d.org.suspendedAt)}: {d.org.suspendedReason}. Hidden from the directory while suspended.</p>
      ) : null}
      <Flash msg={sp.msg} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <section className="card p-6">
            <dl className="grid grid-cols-[170px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[15px]">
              {rows.map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </section>
          <section className="card flex flex-col gap-3 p-6">
            <h2 className="font-bold">Documents</h2>
            {d.docs.length === 0 && <p className="text-sm text-muted">No documents uploaded.</p>}
            {d.docs.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ground px-3.5 py-2.5 text-sm">
                <span className="flex flex-col">
                  <a href={`/admin/listings/documents/${doc.id}`} target="_blank" rel="noopener" className="font-semibold text-brand hover:underline">{docLabel[doc.docType] ?? doc.docType}</a>
                  <span className="text-[13px] text-muted">{doc.isPdf ? "PDF" : "Image"} · uploaded by {doc.uploadedBy} · {when(doc.createdAt)}</span>
                </span>
                <Badge status={doc.status} />
              </div>
            ))}
            <p className="text-[13px] text-muted">Opening a document is recorded in the audit log under your name.</p>
          </section>
          <section className="card flex flex-col gap-3 p-6">
            <h2 className="font-bold">Photos ({d.photos.length})</h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {d.photos.map((p, i) => (
                <li key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, staff-checked route */}
                  <img src={`/admin/listings/photos/${p.id}`} alt={p.caption || `Photo ${i + 1}`} className="aspect-[4/3] w-full rounded-lg border border-line object-cover" />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex flex-[1_1_320px] flex-col gap-4">
          {canDecide ? (
            <form action={decideListingAction} className="card flex flex-col gap-3 p-5">
              <h2 className="font-bold">Checklist and decision</h2>
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="kind" value={l.kind} />
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm text-muted">Tick each check you&apos;ve done. All required checks are needed to approve.</legend>
                {d.checks.map((c) => (
                  <label key={c.key} className="flex items-start gap-2.5 text-[14.5px]">
                    <input type="checkbox" name="checked" value={c.key} className="mt-1 size-4 accent-brand" />
                    <span>{c.label}{!c.required && <span className="text-muted"> (not uploaded)</span>}</span>
                  </label>
                ))}
              </fieldset>
              <label htmlFor="note" className="label">Note to the owners</label>
              <textarea id="note" name="note" rows={3} maxLength={1000} className="input py-2.5" placeholder="Required to request changes or reject" />
              <div className="flex flex-col gap-2">
                {l.status === "pending" && <button name="decision" value="approved" className="btn-primary">Approve and publish</button>}
                <button name="decision" value="changes_requested" className="btn-outline">Request changes</button>
                <button name="decision" value="rejected" className="btn-outline text-[#9b2c1f]">{l.status === "verified" ? "Take down" : "Reject"}</button>
              </div>
              <p className="text-[13px] text-muted">The owners and admins are emailed, and the decision is audited under your name.</p>
            </form>
          ) : (
            <p className="card p-5 text-sm text-muted">{l.status === "draft" ? "Not submitted yet." : "Waiting for the owners to update and resubmit."}</p>
          )}
        </aside>
      </div>
    </>
  );
}
