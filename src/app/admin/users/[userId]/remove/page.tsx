import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffOrExit } from "../../../staff";
import { getUserDetail } from "@/modules/admin/service";
import { AppError } from "@/lib/errors";
import { removeUserAction } from "../../../actions";
import { Flash, PageTitle } from "../../../ui";

export default async function RemoveUser({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await getStaffOrExit();
  const [{ userId }, sp] = await Promise.all([params, searchParams]);
  const d = await getUserDetail(me, userId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const u = d.user;
  if (u.deletedAt) notFound();
  const allowed = me.platformRole === "super_admin" && u.id !== me.id && u.platformRole !== "super_admin";

  return (
    <>
      <Link href={`/admin/users/${u.id}`} className="text-sm font-semibold text-brand hover:underline">← {u.name}</Link>
      <PageTitle title="Remove account" subtitle={`${u.name} · ${u.email}`} />
      <Flash error={sp.error} />
      {allowed ? (
        <form action={removeUserAction} className="card flex max-w-xl flex-col gap-4 p-6">
          <input type="hidden" name="userId" value={u.id} />
          <div className="rounded-xl bg-[#fbe9e6] px-4 py-3 text-sm text-[#9b2c1f]">
            <p className="font-semibold">This can&apos;t be undone.</p>
            <ul className="mt-1.5 list-disc pl-5">
              <li>Their name, email and sign-in methods are erased; they are signed out and cannot sign in again.</li>
              <li>Their posts and comments are hidden, connections and company memberships are deleted.</li>
              {d.professional && <li>Their professional profile stops appearing in search.</li>}
              <li>Bookings, payments and the audit log keep an anonymous &ldquo;Removed user&rdquo; record.</li>
            </ul>
          </div>
          <p className="text-sm">If you only want to stop them signing in for now, <Link href={`/admin/users/${u.id}#suspend`} className="font-semibold text-brand hover:underline">suspend the account</Link> instead.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmEmail" className="label">Type <span className="font-mono">{u.email}</span> to confirm</label>
            <input id="confirmEmail" name="confirmEmail" required autoComplete="off" className="input" />
          </div>
          <div className="flex gap-2">
            <button className="btn-outline border-[#9b2c1f] text-[#9b2c1f]">Remove account permanently</button>
            <Link href={`/admin/users/${u.id}`} className="btn-outline">Cancel</Link>
          </div>
        </form>
      ) : (
        <p className="card max-w-xl p-5 text-sm text-muted">{u.id === me.id ? "You can't remove your own account here." : "Only a super admin can remove accounts, and super admins can't be removed."}</p>
      )}
    </>
  );
}
