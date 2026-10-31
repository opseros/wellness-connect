import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { listMembers } from "@/modules/organizations/service";
import { ACCREDITATIONS_LIST, FEATURE_LABEL, getListingWorkspace, SERVES_LABEL, STATUS_LABEL } from "@/modules/listings/service";
import { POLICY_TEXT } from "@/modules/stays/policy";
import { STATE_NAMES } from "@/modules/marketplace/payments";
import { Badge, Flash } from "@/components/ui";
import {
  addPhotoAction,
  inviteAction,
  removeDocumentAction,
  removeMemberAction,
  removePhotoAction,
  saveListingAction,
  submitListingAction,
  uploadDocumentAction,
} from "../actions";

const when = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(d);
const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", wellness_manager: "Manager", member: "Member" };

export default async function ListingWorkspace({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const w = await getListingWorkspace(me.id, orgId);
  const team = await listMembers(me.id, orgId);
  const l = w.listing;
  const homestay = l.kind === "homestay";
  const noun = homestay ? "homestay" : "hospital";
  const publicHref = `/${homestay ? "homestays" : "hospitals"}/${w.org.slug}`;
  const hidden = <input type="hidden" name="orgId" value={orgId} />;
  const ro = !w.canEdit;
  const field = "flex flex-col gap-1.5 text-sm font-semibold";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">{homestay ? "Homestay workspace" : "Hospital workspace"}</span>
          <h1 className="font-display text-[30px] font-extrabold leading-tight">{w.org.name}</h1>
        </div>
        <span className="flex items-center gap-3">
          <Badge status={l.status} label={STATUS_LABEL[l.status]} />
          <Link href={publicHref} className="text-sm font-semibold text-brand hover:underline">{l.status === "verified" ? "View public page" : "Preview public page"}</Link>
        </span>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <nav aria-label="Sections" className="flex flex-wrap gap-1 text-sm font-semibold">
        {[["#details", "Details"], ["#photos", `Photos (${w.photos.length})`], ["#documents", "Documents"], ["#team", "Team"]].map(([h, t]) => (
          <a key={h} href={h} className="rounded-lg px-3 py-2 text-[#3d4842] hover:bg-white">{t}</a>
        ))}
      </nav>

      <section aria-labelledby="verify-h" className="card flex flex-col gap-4 p-6">
        <h2 id="verify-h" className="text-lg font-bold">
          {l.status === "verified" ? "Verified" : l.status === "pending" ? "Waiting for our review" : "Get verified to appear in the directory"}
        </h2>
        {l.status === "verified" && <p className="text-[15px] text-muted">Your {noun} is in the public directory{l.verifiedAt ? ` since ${when(l.verifiedAt)}` : ""}. New documents you upload are reviewed separately.</p>}
        {l.status === "pending" && <p className="text-[15px] text-muted">Sent {l.submittedAt ? when(l.submittedAt) : ""}. We usually review within 2 working days and will email the owners and admins.</p>}
        {(l.status === "changes_requested" || l.status === "rejected") && l.reviewNote && (
          <p className="rounded-xl bg-[#e8ecf5] px-4 py-3 text-[15px] text-[#2e3f66]"><span className="font-semibold">Note from our team:</span> {l.reviewNote}</p>
        )}
        {l.status !== "verified" && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {w.readiness.map((i) => (
              <li key={i.key} className="flex items-start gap-2.5 text-[15px]">
                <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[12px] font-bold ${i.done ? "bg-brand text-white" : "border-2 border-line"}`}>{i.done ? "✓" : ""}</span>
                <span>
                  {i.label}
                  {!i.required && <span className="text-muted"> (optional)</span>}
                  <span className="sr-only">{i.done ? ": done" : ": to do"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {(l.status === "draft" || l.status === "changes_requested") && w.canEdit && (
          <form action={submitListingAction} className="flex flex-wrap items-center gap-3">
            {hidden}
            <button className="btn-primary" disabled={!w.canSubmit}>Submit for verification</button>
            {!w.canSubmit && <span className="text-sm text-muted">Finish the items above first.</span>}
          </form>
        )}
      </section>

      <section id="details" aria-labelledby="details-h" className="card scroll-mt-6 p-6">
        <h2 id="details-h" className="mb-4 text-lg font-bold">Details</h2>
        <form action={saveListingAction} className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {hidden}
          <fieldset disabled={ro} className="contents">
            <label className={field}>Name<input name="name" required minLength={2} maxLength={120} defaultValue={w.org.name} className="input" /></label>
            <label className={field}>One-line tagline<input name="tagline" maxLength={140} defaultValue={l.tagline} className="input" placeholder={homestay ? "Garden home for quiet recovery stays" : "Orthopaedic and cardiac care with an international desk"} /></label>
            <label className={`${field} col-span-full`}>About (at least 40 characters)
              <textarea name="about" rows={4} maxLength={3000} defaultValue={l.about} className="input py-2.5" />
            </label>
            <label className={field}>City<input name="city" required maxLength={80} defaultValue={l.city} className="input" /></label>
            <label className={field}>State
              <select name="state" defaultValue={l.state} className="input"><option value="">Choose</option>{Object.values(STATE_NAMES).sort().map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <label className={field}>Area or landmark (public)<input name="area" maxLength={120} defaultValue={l.area} className="input" placeholder="Near Kuvempunagar" /></label>
            <label className={field}>Languages spoken<input name="languages" defaultValue={l.languages.join(", ")} className="input" placeholder="English, Kannada, Hindi" /></label>

            {homestay ? (
              <>
                <label className={field}>Rooms<input name="rooms" type="number" min={0} max={50} defaultValue={l.rooms ?? ""} className="input" /></label>
                <label className={field}>Guests at most<input name="maxGuests" type="number" min={0} max={200} defaultValue={l.maxGuests ?? ""} className="input" /></label>
                <label className={field}>Price from (₹ per night)<input name="priceFromRupees" type="number" min={0} step={1} defaultValue={l.priceFromPaise !== null ? l.priceFromPaise / 100 : ""} className="input" /></label>
                <fieldset className="col-span-full flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-semibold">Recovery-friendly and comfort features</legend>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                    {Object.entries(FEATURE_LABEL).map(([k, v]) => (
                      <label key={k} className="flex items-center gap-2 text-[15px]"><input type="checkbox" name="features" value={k} defaultChecked={l.features.includes(k)} className="size-4 accent-brand" />{v}</label>
                    ))}
                  </div>
                </fieldset>
                <label className={`${field} col-span-full`}>House rules<textarea name="houseRules" rows={2} maxLength={1500} defaultValue={l.houseRules} className="input py-2.5" /></label>
                <label className={field}>Cancellation policy
                  <select name="cancellationPolicy" defaultValue={l.cancellationPolicy} className="input">{Object.entries(POLICY_TEXT).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
                  <span className="text-[12.5px] font-normal text-muted">{Object.values(POLICY_TEXT).map((v) => `${v.name}: ${v.text}`).join(" ")}</span>
                </label>
                <label className={field}>Minimum nights<input name="minNights" type="number" min={1} max={30} defaultValue={l.minNights} className="input" /></label>
                <label className={field}>Check-in from<input name="checkInTime" type="time" defaultValue={l.checkInTime} className="input" /></label>
                <label className={field}>Check-out by<input name="checkOutTime" type="time" defaultValue={l.checkOutTime} className="input" /></label>
              </>
            ) : (
              <>
                <label className={`${field} col-span-full`}>Specialties (comma separated)<input name="specialties" defaultValue={l.specialties.join(", ")} className="input" placeholder="Orthopaedics, Cardiology, Oncology" /></label>
                <label className={field}>Beds<input name="beds" type="number" min={0} max={10000} defaultValue={l.beds ?? ""} className="input" /></label>
                <label className={field}>Patients you welcome
                  <select name="serves" defaultValue={l.serves} className="input">{Object.entries(SERVES_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </label>
                <fieldset className="col-span-full flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-semibold">Accreditations (shown once we&apos;ve checked the certificate)</legend>
                  <div className="flex flex-wrap gap-4">
                    {ACCREDITATIONS_LIST.map((a) => (
                      <label key={a} className="flex items-center gap-2 text-[15px]"><input type="checkbox" name="accreditations" value={a} defaultChecked={l.accreditations.includes(a)} className="size-4 accent-brand" />{a}</label>
                    ))}
                  </div>
                </fieldset>
                <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" name="internationalDesk" defaultChecked={l.internationalDesk} className="size-4 accent-brand" />International patient desk</label>
                <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" name="visaLetter" defaultChecked={l.visaLetter} className="size-4 accent-brand" />Issues medical visa invitation letters</label>
              </>
            )}

            <div className="col-span-full mt-2 border-t border-line pt-4">
              <p className="mb-3 text-sm text-muted">For our verification team only; never shown publicly.</p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                <label className={field}>Contact email<input name="contactEmail" type="email" defaultValue={l.contactEmail} className="input" /></label>
                <label className={field}>Contact phone<input name="contactPhone" type="tel" defaultValue={l.contactPhone} className="input" /></label>
                <label className={field}>Website<input name="website" type="url" defaultValue={l.website} className="input" placeholder="https://" /></label>
              </div>
            </div>
            {w.canEdit && <div className="col-span-full"><button className="btn-primary">Save details</button></div>}
          </fieldset>
        </form>
      </section>

      <section id="photos" aria-labelledby="photos-h" className="card scroll-mt-6 flex flex-col gap-4 p-6">
        <div>
          <h2 id="photos-h" className="text-lg font-bold">Photos</h2>
          <p className="text-sm text-muted">{homestay ? "At least 3: the outside, a bedroom and the bathroom or common area." : "At least 1: the building or reception."} Photos are public once you&apos;re verified.</p>
        </div>
        {w.photos.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {w.photos.map((p, i) => (
              <li key={p.id} className="flex flex-col gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- served through the access-checked route */}
                <img src={`/media/listing-photos/${p.id}`} alt={p.caption || `Photo ${i + 1} of ${w.org.name}`} className="aspect-[4/3] w-full rounded-xl border border-line object-cover" />
                <span className="flex items-center justify-between gap-2 text-[13px] text-muted">
                  <span className="truncate">{p.caption}</span>
                  {w.canEdit && (
                    <form action={removePhotoAction}>{hidden}<input type="hidden" name="photoId" value={p.id} /><button className="font-semibold text-[#9b2c1f] hover:underline">Remove</button></form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {w.canEdit && (
          <form action={addPhotoAction} className="flex flex-wrap items-end gap-3">
            {hidden}
            <label className={field}>Photo (JPG, PNG or WebP, up to 4 MB)<input name="file" type="file" required accept="image/jpeg,image/png,image/webp" className="input py-2" /></label>
            <label className={field}>Caption (optional)<input name="caption" maxLength={140} className="input" /></label>
            <button className="btn-outline">Add photo</button>
          </form>
        )}
      </section>

      <section id="documents" aria-labelledby="docs-h" className="card scroll-mt-6 flex flex-col gap-4 p-6">
        <div>
          <h2 id="docs-h" className="text-lg font-bold">Verification documents</h2>
          <p className="text-sm text-muted">Private: only your team and our verification staff can open them, and every staff view is logged. Don&apos;t upload patient or guest records.</p>
        </div>
        <ul className="flex flex-col gap-3">
          {w.checklist.map((c) => {
            const docs = w.docs.filter((d) => d.docType === c.key);
            return (
              <li key={c.key} className="flex flex-col gap-2 rounded-xl bg-ground p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="font-semibold">{c.label}{!c.required && <span className="font-normal text-muted"> (optional)</span>}</span>
                    <span className="text-[13px] text-muted">{c.hint}</span>
                  </span>
                </div>
                {docs.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                    <a href={`/listing/${orgId}/documents/${d.id}`} target="_blank" rel="noopener" className="font-semibold text-brand hover:underline">{d.name}</a>
                    <span className="flex items-center gap-3">
                      <span className="text-muted">{when(d.createdAt)}</span>
                      <Badge status={d.status} label={d.status === "pending" ? "Waiting for review" : undefined} />
                      {w.canEdit && d.status === "pending" && (
                        <form action={removeDocumentAction}>{hidden}<input type="hidden" name="documentId" value={d.id} /><button className="font-semibold text-[#9b2c1f] hover:underline">Remove</button></form>
                      )}
                    </span>
                  </div>
                ))}
                {w.canEdit && (
                  <form action={uploadDocumentAction} className="flex flex-wrap items-center gap-2">
                    {hidden}
                    <input type="hidden" name="docType" value={c.key} />
                    <label className="sr-only" htmlFor={`f-${c.key}`}>{c.label} file</label>
                    <input id={`f-${c.key}`} name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="input max-w-[340px] py-2 text-sm" />
                    <button className="btn-outline min-h-10 px-4 text-sm">{docs.length ? "Upload another" : "Upload"}</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section id="team" aria-labelledby="team-h" className="card scroll-mt-6 flex flex-col gap-4 p-6">
        <h2 id="team-h" className="text-lg font-bold">Team</h2>
        <ul className="flex flex-col gap-2">
          {team.filter((m) => m.status === "active").map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ground px-3.5 py-2.5 text-sm">
              <span><span className="font-semibold">{m.name}</span> <span className="text-muted">{m.email}</span></span>
              <span className="flex items-center gap-3">
                <span className="text-muted">{ROLE[m.role]}</span>
                {w.canEdit && m.role !== "owner" && m.userId !== me.id && (
                  <form action={removeMemberAction}>{hidden}<input type="hidden" name="membershipId" value={m.membershipId} /><button className="font-semibold text-[#9b2c1f] hover:underline">Remove</button></form>
                )}
              </span>
            </li>
          ))}
        </ul>
        {w.canEdit && (
          <form action={inviteAction} className="flex flex-wrap items-end gap-3">
            {hidden}
            <label className={field}>Invite by email<input name="email" type="email" required className="input" placeholder={homestay ? "co-host@example.com" : "desk@hospital.in"} /></label>
            <label className={field}>Role
              <select name="role" className="input"><option value="admin">Admin (can edit)</option><option value="member">Member (view only)</option></select>
            </label>
            <button className="btn-outline">Send invitation</button>
          </form>
        )}
      </section>
    </>
  );
}
