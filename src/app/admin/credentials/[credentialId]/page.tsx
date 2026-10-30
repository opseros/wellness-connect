import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffOrExit, when } from "../../staff";
import { getCredentialForReview } from "@/modules/admin/service";
import { AppError } from "@/lib/errors";
import { decideCredentialAction } from "../../actions";
import { Badge, Flash, PageTitle } from "../../ui";

export default async function CredentialReview({
  params,
  searchParams,
}: {
  params: Promise<{ credentialId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await getStaffOrExit();
  const [{ credentialId }, sp] = await Promise.all([params, searchParams]);
  const data = await getCredentialForReview(me, credentialId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const { credential: c, profile, owner, others, reviewerName } = data;
  const fileUrl = `/admin/credentials/${c.id}/file`;
  const isPdf = c.blobPath?.endsWith(".pdf");

  return (
    <>
      <Link href="/admin" className="text-sm font-semibold text-brand hover:underline">← Verification queue</Link>
      <PageTitle title={c.name} subtitle={`${owner?.name ?? "Unknown"} · ${owner?.email ?? ""}`} />
      <Flash error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[999_1_520px] flex-col gap-4 p-6">
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[15px]">
            <dt className="text-muted">Status</dt><dd><Badge status={c.status} /></dd>
            <dt className="text-muted">Issuer stated</dt><dd>{c.issuer || "Not given"}</dd>
            <dt className="text-muted">Submitted</dt><dd>{when(c.createdAt)}</dd>
            <dt className="text-muted">Profile</dt>
            <dd>{profile ? `${profile.headline || "No headline"} · ${profile.city || "No city"} · ${profile.yearsExperience} years` : "—"}</dd>
            <dt className="text-muted">Profile status</dt><dd>{profile && <Badge status={profile.verificationStatus} />}</dd>
            {c.reviewedAt && (
              <>
                <dt className="text-muted">Last decision</dt>
                <dd>{reviewerName ?? "Staff"} · {when(c.reviewedAt)}{c.reviewNote ? ` · "${c.reviewNote}"` : ""}</dd>
              </>
            )}
          </dl>
          {c.blobPath ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Document</span>
                <a href={fileUrl} target="_blank" rel="noopener" className="font-semibold text-brand hover:underline">Open in new tab</a>
              </div>
              {isPdf ? (
                <iframe title={`Document for ${c.name}`} src={fileUrl} className="h-[560px] w-full rounded-lg border border-line" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file
                <img src={fileUrl} alt={`Uploaded document for ${c.name}`} className="max-h-[560px] w-auto rounded-lg border border-line object-contain" />
              )}
              <p className="text-[13px] text-muted">Opening this document is recorded in the audit log.</p>
            </div>
          ) : (
            <p className="rounded-lg bg-ground px-4 py-3 text-sm text-muted">No file attached to this credential.</p>
          )}
        </section>

        <aside className="flex flex-[1_1_300px] flex-col gap-4">
          <form action={decideCredentialAction} className="card flex flex-col gap-3 p-5">
            <h2 className="font-bold">Decision</h2>
            <input type="hidden" name="credentialId" value={c.id} />
            <label htmlFor="note" className="label">Note to the professional</label>
            <textarea id="note" name="note" rows={3} maxLength={1000} className="input py-2.5" placeholder="Required to request info or reject" />
            <div className="flex flex-col gap-2">
              <button name="decision" value="approved" className="btn-primary">Approve</button>
              <button name="decision" value="info_requested" className="btn-outline">Request more info</button>
              <button name="decision" value="rejected" className="btn-outline text-[#9b2c1f]">Reject</button>
            </div>
            <p className="text-[13px] text-muted">The professional is emailed, and the decision is audited under your name.</p>
          </form>
          {others.length > 0 && (
            <section className="card flex flex-col gap-2 p-5 text-sm">
              <h2 className="font-bold">Other credentials</h2>
              {others.map((o) => (
                <Link key={o.id} href={`/admin/credentials/${o.id}`} className="flex items-center justify-between gap-2 hover:underline">
                  <span>{o.name}</span>
                  <Badge status={o.status} />
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
