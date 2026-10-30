import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffOrExit, when } from "../../staff";
import { getUserDetail } from "@/modules/admin/service";
import { AppError } from "@/lib/errors";
import { setRoleAction, suspendAction, unsuspendAction } from "../../actions";
import { Badge, Flash, PageTitle } from "../../ui";

const methodLabel: Record<string, string> = { credential: "Email and password", google: "Google", microsoft: "Microsoft" };
const roleLabel = { user: "User", ops: "Ops", super_admin: "Super admin" } as const;

export default async function UserDetail({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const [{ userId }, sp] = await Promise.all([params, searchParams]);
  const d = await getUserDetail(me, userId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const u = d.user;
  const isSuper = me.platformRole === "super_admin";
  const canManage = isSuper && !u.deletedAt && u.id !== me.id && u.platformRole !== "super_admin";
  const canEdit = isSuper && !u.deletedAt && (u.platformRole !== "super_admin" || u.id === me.id);

  return (
    <>
      <Link href="/admin/users" className="text-sm font-semibold text-brand hover:underline">← Users</Link>
      <PageTitle title={u.name} subtitle={u.email} />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[999_1_520px] flex-col gap-4 p-6">
          <dl className="grid grid-cols-[170px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[15px]">
            <dt className="text-muted">Status</dt>
            <dd>{u.deletedAt ? <><Badge status="removed" /> <span className="text-sm text-muted">on {when(u.deletedAt)}</span></> : u.suspendedAt ? <><Badge status="suspended" /> <span className="text-sm text-muted">since {when(u.suspendedAt)}: {u.suspendedReason}</span></> : <Badge status="active" />}</dd>
            <dt className="text-muted">Platform role</dt><dd>{roleLabel[u.platformRole]}</dd>
            <dt className="text-muted">Email verified</dt><dd>{u.emailVerified ? "Yes" : "No"}</dd>
            <dt className="text-muted">Two-factor</dt><dd>{u.twoFactorEnabled ? "On" : "Off"}</dd>
            <dt className="text-muted">Sign-in methods</dt><dd>{d.signInMethods.map((m) => methodLabel[m] ?? m).join(", ") || "None"}</dd>
            <dt className="text-muted">Active sessions</dt><dd>{d.activeSessions}</dd>
            <dt className="text-muted">Joined</dt><dd>{when(u.createdAt)}</dd>
            <dt className="text-muted">Professional</dt>
            <dd>{d.professional ? <>{d.professional.headline || "Profile started"} · <Badge status={d.professional.verificationStatus} /></> : "No"}</dd>
          </dl>
          <div>
            <h2 className="mb-2 font-bold">Organizations</h2>
            {d.memberships.length === 0 ? (
              <p className="text-sm text-muted">None.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {d.memberships.map((m) => (
                  <li key={m.orgId} className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.orgName}</span>
                    <span className="text-muted">{m.role.replace("_", " ")}</span>
                    <Badge status={m.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href={`/admin/audit?target=${u.id}`} className="text-sm font-semibold text-brand hover:underline">Audit history for this user →</Link>
        </section>

        <aside className="flex flex-[1_1_300px] flex-col gap-4">
          {canEdit && (
            <div className="card flex flex-col gap-3 p-5">
              <h2 className="font-bold">Details</h2>
              <Link href={`/admin/users/${u.id}/edit`} className="btn-outline">Edit name or email</Link>
            </div>
          )}
          {canManage ? (
            <>
              <form action={setRoleAction} className="card flex flex-col gap-3 p-5">
                <h2 className="font-bold">Staff access</h2>
                <input type="hidden" name="userId" value={u.id} />
                {u.platformRole === "ops" ? (
                  <button name="role" value="user" className="btn-outline">Remove ops access</button>
                ) : (
                  <button name="role" value="ops" className="btn-outline" disabled={!u.emailVerified}>Make ops staff</button>
                )}
                <p className="text-[13px] text-muted">Ops can review credentials and moderate. They must turn on two-factor first.</p>
              </form>
              {u.suspendedAt ? (
                <form action={unsuspendAction} className="card flex flex-col gap-3 p-5">
                  <h2 className="font-bold">Suspension</h2>
                  <input type="hidden" name="userId" value={u.id} />
                  <button className="btn-outline">Lift suspension</button>
                </form>
              ) : (
                <form id="suspend" action={suspendAction} className="card flex scroll-mt-24 flex-col gap-3 p-5">
                  <h2 className="font-bold">Suspend account</h2>
                  <input type="hidden" name="userId" value={u.id} />
                  <label htmlFor="reason" className="label">Reason (kept in the audit log)</label>
                  <textarea id="reason" name="reason" rows={2} minLength={5} maxLength={500} required className="input py-2.5" />
                  <button className="btn-outline text-[#9b2c1f]">Suspend and sign out everywhere</button>
                </form>
              )}
              <div className="card flex flex-col gap-3 p-5">
                <h2 className="font-bold">Remove account</h2>
                <p className="text-[13px] text-muted">Erases their personal details and stops sign-in for good. Records of bookings and payments are kept anonymously.</p>
                <Link href={`/admin/users/${u.id}/remove`} className="btn-outline text-[#9b2c1f]">Remove account…</Link>
              </div>
            </>
          ) : u.deletedAt ? (
            <p className="card p-5 text-sm text-muted">This account was removed. Nothing more can be changed.</p>
          ) : (
            <p className="card p-5 text-sm text-muted">
              {u.id === me.id ? "This is you." : u.platformRole === "super_admin" ? "Super admins can't be changed here." : "Only a super admin can change roles or suspend accounts."}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
