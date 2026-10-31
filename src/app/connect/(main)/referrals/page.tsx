import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";
import { listReferrals, referralTargets } from "@/modules/connect/service";
import { getOwnProfile, listCategories } from "@/modules/professionals/service";
import { Badge } from "@/components/ui";
import { referralAction, referralUpdateAction } from "../../actions";
import { Flash, when } from "../../ui";

export const metadata: Metadata = { title: "Referrals" };
const LABEL: Record<string, [string, string]> = {
  pending: ["pending", "Waiting"],
  accepted: ["active", "Accepted"],
  declined: ["closed", "Declined"],
  completed: ["completed", "Completed"],
  withdrawn: ["closed", "Withdrawn"],
};

export default async function Referrals({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  if (!(await getOwnProfile(me.id))) redirect("/connect");
  const [rows, targets, categories, sp] = await Promise.all([listReferrals(me.id), referralTargets(me.id), listCategories(), searchParams]);
  const act = (id: string, status: string, label: string, primary = false) => (
    <form action={referralUpdateAction}>
      <input type="hidden" name="referralId" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={`${primary ? "btn-primary" : "btn-outline"} min-h-9 px-4 text-sm`}>{label}</button>
    </form>
  );
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">Referrals</h1>
        <p className="text-[15px] text-muted">Pass work to professionals you trust. Share the minimum: who it&apos;s for in a few words and what they need. No names, contact details or health information.</p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      <details className="card p-5" open={rows.length === 0}>
        <summary className="cursor-pointer font-bold">Send a referral</summary>
        {targets.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Connect with other professionals first. <Link href="/connect/network" className="text-brand underline">Find people</Link></p>
        ) : (
          <form action={referralAction} className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">To
              <select name="toUserId" required className="input">{targets.map((t) => <option key={t.id} value={t.id}>{t.name}{t.headline ? ` · ${t.headline}` : ""}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Category (optional)
              <select name="categoryId" className="input"><option value="">Any</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="col-span-full flex flex-col gap-1.5 text-sm font-semibold">Who it&apos;s for
              <input name="clientLabel" required minLength={3} maxLength={120} className="input" placeholder="HR team at a 200-person company" />
            </label>
            <label className="col-span-full flex flex-col gap-1.5 text-sm font-semibold">What they need
              <textarea name="note" required minLength={10} maxLength={600} rows={3} className="input py-2.5" placeholder="A nutrition talk in February; I'm fully booked." />
            </label>
            <div className="col-span-full"><button className="btn-primary">Send referral</button></div>
          </form>
        )}
      </details>
      {rows.map(({ referral: r, incoming, fromName, toName, categoryName, trail }) => (
        <article key={r.id} className="card flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[13px] text-muted">{incoming ? `From ${fromName}` : `To ${toName}`}{categoryName ? ` · ${categoryName}` : ""}</span>
              <span className="font-bold">{r.clientLabel}</span>
            </div>
            <Badge status={LABEL[r.status][0]} label={LABEL[r.status][1]} />
          </div>
          <p className="whitespace-pre-line text-[15px]">{r.note}</p>
          <ol className="flex flex-col gap-1 border-l-2 border-line pl-4 text-[13px] text-muted">
            {trail.map((e, i) => (
              <li key={i}>{when(e.createdAt)}: {e.actorName} {e.status === "pending" ? "sent it" : `marked it ${e.status}`}{e.note ? ` (“${e.note}”)` : ""}</li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {incoming && r.status === "pending" && <>{act(r.id, "accepted", "Accept", true)}{act(r.id, "declined", "Decline")}</>}
            {incoming && r.status === "accepted" && act(r.id, "completed", "Mark completed", true)}
            {!incoming && (r.status === "pending" || r.status === "accepted") && act(r.id, "withdrawn", "Withdraw")}
          </div>
        </article>
      ))}
    </>
  );
}
