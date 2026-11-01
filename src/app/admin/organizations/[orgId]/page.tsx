import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffOrExit, when } from "../../staff";
import { getOrganizationDetail, staffSeesHospitals } from "@/modules/admin/service";
import { STATUS_LABEL } from "@/modules/listings/service";
import { AppError } from "@/lib/errors";
import { editOrganizationAction, removeOrganizationAction, setDomainAction, suspendOrganizationAction, unsuspendOrganizationAction } from "../../actions";
import { Badge, Flash, PageTitle } from "../../ui";

const KIND = { company: "Company", homestay: "Homestay", hospital: "Hospital · Care & Travel", facility: "Gym, studio or wellness centre", provider: "Provider" } as const;
const BACK = {
  company: "/admin/organizations#company",
  homestay: "/admin/organizations#homestay",
  hospital: "/admin/organizations#hospital",
  facility: "/admin/organizations#facility",
  provider: "/admin/organizations",
} as const;
const DIR = { homestay: "homestays", hospital: "hospitals", facility: "facilities" } as const;
const roleLabel: Record<string, string> = { owner: "Owner", admin: "Admin", wellness_manager: "Wellness manager", member: "Member" };

function Field({ id, label, value, type = "text", hint }: { id: string; label: string; value: string; type?: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} name={id} type={type} defaultValue={value} className="input" />
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </div>
  );
}

/** Edit, suspend or remove a company, homestay or hospital (super admins); ops see it read-only. */
export default async function OrganizationDetail({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const d = await getOrganizationDetail(me, orgId).catch((e) => {
    if (e instanceof AppError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  });
  const { org, listing: l } = d;
  if (org.kind === "hospital" && !(await staffSeesHospitals(me))) notFound();
  const kind = org.kind as keyof typeof KIND;
  const isSuper = me.platformRole === "super_admin";
  const canChange = isSuper && !org.removedAt;
  const dir = l ? DIR[l.kind] : null;
  const reviewHref = dir ? `/admin/${dir}/${org.id}` : null;
  const publicHref = l && dir && l.status === "verified" ? `/${dir}/${org.slug}` : null;

  return (
    <>
      <Link href={BACK[kind]} className="text-sm font-semibold text-brand hover:underline">← Organizations</Link>
      <PageTitle title={org.name} subtitle={KIND[kind]} />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-5">
          <section className="card flex flex-col gap-4 p-6">
            <dl className="grid grid-cols-[170px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[15px]">
              <dt className="text-muted">Standing</dt>
              <dd>
                {org.removedAt ? <><Badge status="removed" /> <span className="text-sm text-muted">on {when(org.removedAt)}</span></>
                  : org.suspendedAt ? <><Badge status="suspended" /> <span className="text-sm text-muted">since {when(org.suspendedAt)}: {org.suspendedReason}</span></>
                  : <Badge status="active" />}
              </dd>
              {l && (<><dt className="text-muted">Verification</dt><dd className="flex flex-wrap items-center gap-3"><Badge status={l.status} label={STATUS_LABEL[l.status]} />{reviewHref && <Link href={reviewHref} className="text-sm font-semibold text-brand hover:underline">Open review</Link>}</dd></>)}
              <dt className="text-muted">Location</dt><dd>{(l ? [l.area, l.city, l.state] : [org.city]).filter(Boolean).join(", ") || "—"}</dd>
              {kind === "company" && (<><dt className="text-muted">Email domain</dt><dd>{org.domain ? `${org.domain} · ${org.domainVerifiedAt ? "verified" : "not verified"}` : "—"}</dd></>)}
              {kind === "company" && (<><dt className="text-muted">Billing</dt><dd>{[org.billingEmail, org.gstin && `GSTIN ${org.gstin}`].filter(Boolean).join(" · ") || "—"}</dd></>)}
              {l && (<><dt className="text-muted">Contact (private)</dt><dd>{[l.contactEmail, l.contactPhone, l.website].filter(Boolean).join(" · ") || "—"}</dd></>)}
              <dt className="text-muted">Created</dt><dd>{when(org.createdAt)}</dd>
              {publicHref && !org.suspendedAt && (<><dt className="text-muted">Public page</dt><dd><Link href={publicHref} className="font-semibold text-brand hover:underline">{publicHref}</Link></dd></>)}
            </dl>
            <div>
              <h2 className="mb-2 font-bold">Team</h2>
              {d.team.length === 0 ? (
                <p className="text-sm text-muted">No members.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {d.team.map((t) => (
                    <li key={t.userId} className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/users/${t.userId}`} className="font-semibold text-brand hover:underline">{t.name}</Link>
                      <span className="text-muted">{t.email} · {roleLabel[t.role] ?? t.role}</span>
                      {t.status !== "active" && <Badge status={t.status} />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Link href={`/admin/audit?target=${org.id}`} className="text-sm font-semibold text-brand hover:underline">Audit history for this organisation →</Link>
          </section>

          {canChange && (
            <form action={editOrganizationAction} className="card flex flex-col gap-4 p-6">
              <h2 className="font-bold">Edit details</h2>
              <input type="hidden" name="orgId" value={org.id} />
              <Field id="name" label="Name" value={org.name} />
              {kind === "company" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="city" label="City" value={org.city} />
                  <Field id="billingEmail" label="Billing email" type="email" value={org.billingEmail} />
                  <Field id="gstin" label="GSTIN" value={org.gstin} />
                  <Field id="address" label="Address" value={org.address} />
                </div>
              ) : l ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Field id="tagline" label="Tagline" value={l.tagline} /></div>
                  <Field id="area" label="Area" value={l.area} />
                  <Field id="city" label="City" value={l.city} />
                  <Field id="state" label="State" value={l.state} />
                  <Field id="website" label="Website" value={l.website} />
                  <Field id="contactEmail" label="Contact email (private)" type="email" value={l.contactEmail} />
                  <Field id="contactPhone" label="Contact phone (private)" value={l.contactPhone} />
                </div>
              ) : null}
              <p className="text-[13px] text-muted">Changes are logged. Verification status stays as it is; the team can still edit everything else in their workspace.</p>
              <button className="btn self-start bg-brand px-6 text-white hover:bg-brand-dark">Save changes</button>
            </form>
          )}
        </div>

        <aside className="flex flex-[1_1_300px] flex-col gap-4">
          {!canChange ? (
            <p className="card p-5 text-sm text-muted">{org.removedAt ? "This organisation was removed. Nothing more can be changed." : "Only a super admin can edit, suspend or remove organisations."}</p>
          ) : (
            <>
              {kind === "company" && (
                <form action={setDomainAction} className="card flex flex-col gap-3 p-5">
                  <h2 className="font-bold">Email domain</h2>
                  <input type="hidden" name="orgId" value={org.id} />
                  <label htmlFor="domain" className="label">Verified domain</label>
                  <input id="domain" name="domain" defaultValue={org.domain ?? ""} placeholder="company.com" className="input" />
                  <p className="text-[13px] text-muted">Only link a domain after confirming the company owns it. Leave empty to remove.</p>
                  <button className="btn-outline">Save domain</button>
                </form>
              )}
              {org.suspendedAt ? (
                <form action={unsuspendOrganizationAction} className="card flex flex-col gap-3 p-5">
                  <h2 className="font-bold">Suspension</h2>
                  <input type="hidden" name="orgId" value={org.id} />
                  <button className="btn-outline">Lift suspension</button>
                </form>
              ) : (
                <form action={suspendOrganizationAction} className="card flex flex-col gap-3 p-5">
                  <h2 className="font-bold">Suspend</h2>
                  <p className="text-[13px] text-muted">
                    {kind === "company" ? "Its team can't post needs, book or pay until you lift it." : "Hidden from the directory and can't take new requests. Its team can't open the workspace until you lift it."} Nothing is deleted.
                  </p>
                  <input type="hidden" name="orgId" value={org.id} />
                  <label htmlFor="reason" className="label">Reason (kept in the audit log)</label>
                  <textarea id="reason" name="reason" rows={2} minLength={5} maxLength={500} required className="input py-2.5" />
                  <button className="btn-outline text-[#9b2c1f]">Suspend</button>
                </form>
              )}
              <form action={removeOrganizationAction} className="card flex flex-col gap-3 p-5">
                <h2 className="font-bold">Remove</h2>
                <p className="text-[13px] text-muted">Closes it for good: the team loses access, invitations are cancelled and the email domain is released. Bookings, stays, invoices and the audit trail are kept.</p>
                {d.openWork ? (
                  <p className="rounded-lg bg-[#fff4dc] px-3 py-2 text-[13px] text-[#7a4b00]">It still has {d.openWork}. Finish or cancel them first.</p>
                ) : (
                  <>
                    <input type="hidden" name="orgId" value={org.id} />
                    <label htmlFor="confirm" className="label">Type <span className="font-bold">{org.name}</span> to confirm</label>
                    <input id="confirm" name="confirm" required autoComplete="off" className="input" />
                    <button className="btn-outline text-[#9b2c1f]">Remove organisation</button>
                  </>
                )}
              </form>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
