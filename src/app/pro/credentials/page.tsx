import type { Metadata } from "next";
import { listOwnCredentials } from "@/modules/professionals/service";
import { Badge, Flash, PageTitle } from "@/components/ui";
import { resubmitCredentialAction, uploadCredentialAction } from "../actions";
import { Field } from "../fields";
import { day, getProOrExit } from "../me";

export const metadata: Metadata = { title: "Credentials" };

const statusLabel: Record<string, string> = {
  pending: "In review",
  approved: "Approved",
  rejected: "Not approved",
  info_requested: "More information needed",
};

const FileInput = ({ id }: { id: string }) => (
  <input id={id} name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="input py-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:font-semibold file:text-brand-dark" />
);

export default async function Credentials({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { me, profile } = await getProOrExit();
  const [creds, sp] = await Promise.all([listOwnCredentials(me.id), searchParams]);

  return (
    <>
      <PageTitle title="Credentials" subtitle="Certificates and registrations our team checks before companies can book you." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
          <p className="text-sm">
            Profile verification: <Badge status={profile.verificationStatus} />
          </p>
          {creds.length === 0 && <p className="card p-6 text-[15px] text-muted">Nothing uploaded yet. Add your main certification to get verified.</p>}
          {creds.map((c) => {
            const needsChange = c.status === "info_requested" || c.status === "rejected";
            return (
              <article key={c.id} id={`c-${c.id}`} className="card flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-bold">{c.name}</span>
                    <span className="text-[13px] text-muted">{c.issuer || "Issuer not given"} · uploaded {day(c.createdAt)}</span>
                  </div>
                  <Badge status={c.status} label={statusLabel[c.status]} />
                </div>
                {c.reviewNote && needsChange && (
                  <p className="rounded-xl bg-[#fbf0dc] px-4 py-3 text-sm text-[#7a4b00]">
                    <span className="font-semibold">Note from our team: </span>
                    {c.reviewNote}
                  </p>
                )}
                {needsChange && (
                  <form action={resubmitCredentialAction} className="flex flex-col gap-2 border-t border-line pt-3">
                    <input type="hidden" name="credentialId" value={c.id} />
                    <label htmlFor={`file-${c.id}`} className="label">Upload an updated document</label>
                    <div className="flex flex-wrap gap-2">
                      <div className="min-w-0 flex-[1_1_260px]">
                        <FileInput id={`file-${c.id}`} />
                      </div>
                      <button className="btn-primary">Resubmit for review</button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </section>

        <form action={uploadCredentialAction} className="card flex flex-[1_1_300px] flex-col gap-4 p-5">
          <h2 className="font-bold">Add a credential</h2>
          <Field id="name" label="Name of the credential">
            <input id="name" name="name" required minLength={3} maxLength={200} className="input" placeholder="RYT-500 Yoga Teacher" />
          </Field>
          <Field id="issuer" label="Issued by">
            <input id="issuer" name="issuer" maxLength={200} className="input" placeholder="Yoga Alliance" />
          </Field>
          <Field id="file" label="Document" hint="PDF, JPG or PNG, up to 4 MB. Only our review team can open it.">
            <FileInput id="file" />
          </Field>
          <button className="btn-primary">Upload for review</button>
        </form>
      </div>
    </>
  );
}
