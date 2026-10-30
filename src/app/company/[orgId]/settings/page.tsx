import type { Metadata } from "next";
import { listInvitations, listMembers } from "@/modules/organizations/service";
import { Badge, Flash, PageTitle } from "@/components/ui";
import { Field } from "@/app/pro/fields";
import { inviteAction, memberRoleAction, removeMemberAction, revokeInviteAction, saveSettingsAction } from "../../actions";
import { day, getCompanyOrExit, ROLE_LABEL } from "../company";

export const metadata: Metadata = { title: "Settings and members" };

const ROLE_HELP: Record<string, string> = {
  admin: "Manages members and company details, and books.",
  wellness_manager: "Posts requirements, compares proposals and books.",
  member: "Joins sessions; no marketplace access.",
};

export default async function Settings({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId } = await params;
  const [{ me, org, role, isAdmin }, sp] = await Promise.all([getCompanyOrExit(orgId), searchParams]);
  const [members, invites] = await Promise.all([listMembers(me.id, orgId), isAdmin ? listInvitations(me.id, orgId) : Promise.resolve([])]);
  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "pending");
  const isOwner = role === "owner";
  const assignable = (isOwner ? ["admin", "wellness_manager", "member"] : ["wellness_manager", "member"]) as string[];
  const canManage = (m: (typeof members)[number]) => isAdmin && m.userId !== me.id && m.role !== "owner" && (isOwner || m.role !== "admin");
  const hidden = <input type="hidden" name="orgId" value={orgId} />;

  return (
    <>
      <PageTitle title={isAdmin ? "Settings and members" : "Members"} subtitle={org.name} />
      <Flash msg={sp.msg} error={sp.error} />

      {isAdmin && (
        <form action={saveSettingsAction} className="card flex flex-col gap-4 p-6">
          {hidden}
          <h2 className="text-lg font-bold">Company details</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            <Field id="name" label="Company name">
              <input id="name" name="name" defaultValue={org.name} required minLength={2} maxLength={120} className="input" />
            </Field>
            <Field id="city" label="City" hint="Used as the default for new requirements.">
              <input id="city" name="city" defaultValue={org.city} maxLength={80} className="input" />
            </Field>
            <Field id="address" label="Office address" hint="Pre-filled as the location of in-person bookings.">
              <input id="address" name="address" defaultValue={org.address} maxLength={400} className="input" />
            </Field>
            <Field id="billingEmail" label="Billing email">
              <input id="billingEmail" name="billingEmail" type="email" defaultValue={org.billingEmail} className="input" />
            </Field>
            <Field id="gstin" label="GSTIN (optional)" hint="Printed on GST invoices.">
              <input id="gstin" name="gstin" defaultValue={org.gstin} maxLength={15} pattern="[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]" title="15 characters, e.g. 29ABCDE1234F1Z5" className="input uppercase" />
            </Field>
          </div>
          {org.domain && <p className="text-[13px] text-muted">People who verify an @{org.domain} email can ask to join; you approve them below.</p>}
          <div><button className="btn-primary">Save details</button></div>
        </form>
      )}

      {isAdmin && pending.length > 0 && (
        <section className="card flex flex-col gap-3 p-6">
          <h2 className="text-lg font-bold">Requests to join <Badge status="pending" label={String(pending.length)} /></h2>
          <ul className="flex flex-col divide-y divide-line">
            {pending.map((m) => (
              <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="flex flex-col">
                  <span className="font-semibold">{m.name}</span>
                  <span className="text-[13px] text-muted">{m.email} · asked {day(m.createdAt)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <form action={memberRoleAction} className="flex gap-2">
                    {hidden}
                    <input type="hidden" name="membershipId" value={m.membershipId} />
                    <input type="hidden" name="approving" value="1" />
                    <label htmlFor={`approve-${m.membershipId}`} className="sr-only">Role</label>
                    <select id={`approve-${m.membershipId}`} name="role" defaultValue="member" className="input w-auto">
                      {assignable.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                    <button className="btn-primary">Approve</button>
                  </form>
                  <form action={removeMemberAction}>
                    {hidden}
                    <input type="hidden" name="membershipId" value={m.membershipId} />
                    <input type="hidden" name="declining" value="1" />
                    <button className="btn-outline">Decline</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="members" className="card flex flex-col gap-3 p-6">
        <h2 className="text-lg font-bold">Members ({active.length})</h2>
        <ul className="flex flex-col divide-y divide-line">
          {active.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex flex-col">
                <span className="font-semibold">{m.name}{m.userId === me.id && <span className="font-normal text-muted"> (you)</span>}</span>
                <span className="text-[13px] text-muted">{m.email}</span>
              </span>
              {canManage(m) ? (
                <span className="flex flex-wrap items-center gap-2">
                  <form action={memberRoleAction} className="flex gap-2">
                    {hidden}
                    <input type="hidden" name="membershipId" value={m.membershipId} />
                    <label htmlFor={`role-${m.membershipId}`} className="sr-only">Role for {m.name}</label>
                    <select id={`role-${m.membershipId}`} name="role" defaultValue={m.role} className="input w-auto">
                      {assignable.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                    <button className="btn-outline">Save</button>
                  </form>
                  <form action={removeMemberAction}>
                    {hidden}
                    <input type="hidden" name="membershipId" value={m.membershipId} />
                    <button className="px-2 text-sm font-semibold text-[#9b2c1f] hover:underline">Remove</button>
                  </form>
                </span>
              ) : (
                <Badge status={m.role === "owner" || m.role === "admin" ? "active" : "viewed"} label={ROLE_LABEL[m.role]} />
              )}
            </li>
          ))}
        </ul>
        {!isAdmin && <p className="text-[13px] text-muted">Owners and admins manage members and roles.</p>}
      </section>

      {isAdmin && (
        <section id="invite" className="card flex flex-col gap-4 p-6">
          <h2 className="text-lg font-bold">Invite people</h2>
          <form action={inviteAction} className="flex flex-wrap items-end gap-3">
            {hidden}
            <div className="flex-[2_1_260px]">
              <Field id="invite-email" label="Email">
                <input id="invite-email" name="email" type="email" required className="input" placeholder="colleague@company.com" />
              </Field>
            </div>
            <div className="flex-[1_1_200px]">
              <Field id="invite-role" label="Role">
                <select id="invite-role" name="role" defaultValue="wellness_manager" className="input">
                  {assignable.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <button className="btn-primary">Send invitation</button>
          </form>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2 text-[13px] text-muted">
            {assignable.map((r) => (
              <li key={r}><span className="font-semibold text-ink">{ROLE_LABEL[r]}:</span> {ROLE_HELP[r]}</li>
            ))}
          </ul>
          {invites.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-line pt-3">
              <h3 className="font-semibold">Waiting to be accepted</h3>
              <ul className="flex flex-col divide-y divide-line">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <span>{i.email} · {ROLE_LABEL[i.role]} <span className="text-muted">· expires {day(i.expiresAt)}</span></span>
                    <form action={revokeInviteAction}>
                      {hidden}
                      <input type="hidden" name="invitationId" value={i.id} />
                      <button className="font-semibold text-[#9b2c1f] hover:underline">Revoke</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}
