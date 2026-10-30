import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffOrExit } from "../../../staff";
import { getUserDetail } from "@/modules/admin/service";
import { AppError } from "@/lib/errors";
import { editUserAction } from "../../../actions";
import { Flash, PageTitle } from "../../../ui";

export default async function EditUser({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await getStaffOrExit();
  const [{ userId }, sp] = await Promise.all([params, searchParams]);
  const d = await getUserDetail(me, userId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const u = d.user;
  if (u.deletedAt) notFound();
  const allowed = me.platformRole === "super_admin" && (u.platformRole !== "super_admin" || u.id === me.id);

  return (
    <>
      <Link href={`/admin/users/${u.id}`} className="text-sm font-semibold text-brand hover:underline">← {u.name}</Link>
      <PageTitle title="Edit user" subtitle={u.email} />
      <Flash error={sp.error} />
      {allowed ? (
        <form action={editUserAction} className="card flex max-w-xl flex-col gap-4 p-6">
          <input type="hidden" name="userId" value={u.id} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="label">Full name</label>
            <input id="name" name="name" defaultValue={u.name} required minLength={2} maxLength={120} className="input" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" type="email" defaultValue={u.email} required className="input" />
            <p className="text-[13px] text-muted">Changing the email signs them out everywhere and they must verify the new address before signing in again.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Save changes</button>
            <Link href={`/admin/users/${u.id}`} className="btn-outline">Cancel</Link>
          </div>
        </form>
      ) : (
        <p className="card max-w-xl p-5 text-sm text-muted">Only a super admin can edit users, and other super admins can&apos;t be edited here.</p>
      )}
    </>
  );
}
