import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { Badge, Flash } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { paiseRange } from "@/lib/money";
import { getCurrentUser } from "@/modules/identity/session";
import { getOwnProfile, getPublicProfile } from "@/modules/professionals/service";
import { connectionState } from "@/modules/connect/service";
import { connectAction } from "@/app/pro/actions";
import { BRAND } from "@/lib/brand";

const MODE: Record<string, string> = { in_person: "In person", virtual: "Virtual", hybrid: "Hybrid" };

export const metadata: Metadata = { title: "Professional profile", robots: { index: false } };

export default async function PublicProfile({ params, searchParams }: { params: Promise<{ profileId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = await getCurrentUser();
  const { profileId } = await params;
  if (!me) redirect(`/?next=/p/${profileId}`);
  if (!me.emailVerified) redirect("/check-email");
  const [sp, ownPro] = await Promise.all([searchParams, getOwnProfile(me.id)]);
  const d = await getPublicProfile(me.id, profileId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const p = d.profile;
  const state = await connectionState(me.id, p.userId);
  const initials = d.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, d.isOwner ? "pro" : "connect", { professional: Boolean(ownPro) })} />
      <main className="mx-auto flex max-w-[960px] flex-col gap-5 px-6 py-8">
        {d.isOwner && (
          <p className="rounded-xl bg-[#e8ecf5] px-4 py-3 text-sm text-[#2e3f66]">
            {d.isPublic ? "This is how companies and members see your profile." : "Preview: only you can see this page until you're verified and visible in search."}{" "}
            <Link href="/pro/profile" className="font-semibold underline">Edit profile</Link>
          </p>
        )}
        <Flash msg={sp.msg} error={sp.error} />
        <section className="card flex flex-wrap items-start gap-5 p-6">
          <span aria-hidden className="grid size-20 shrink-0 place-items-center rounded-2xl bg-brand-soft text-2xl font-bold text-brand-dark">{initials}</span>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5">
            <h1 className="flex flex-wrap items-center gap-2 text-[26px] font-bold">
              {d.name}
              {p.verificationStatus === "verified" && <Badge status="verified" label="✓ Verified" />}
            </h1>
            <p className="text-[16px]">{p.headline}</p>
            <p className="text-sm text-muted">
              {[p.city, p.yearsExperience ? `${p.yearsExperience} years' experience` : null, p.languages.join(", ") || null].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {d.categories.map((c) => (
                <span key={c.id} className="rounded-full bg-ground px-3 py-1 text-[13px] font-semibold">{c.name}</span>
              ))}
            </div>
          </div>
          {!d.isOwner && (
            <div className="flex flex-col items-end gap-2">
              {state === "none" && (
                <form action={connectAction}>
                  <input type="hidden" name="profileId" value={p.id} />
                  <input type="hidden" name="userId" value={p.userId} />
                  <button className="btn-primary">Connect</button>
                </form>
              )}
              {state === "sent" && <span className="btn-outline pointer-events-none">Request sent</span>}
              {state === "received" && <Link href="/connect" className="btn-primary">Respond to their request</Link>}
              {state === "connected" && <span className="btn-outline pointer-events-none">✓ Connected</span>}
            </div>
          )}
        </section>

        {p.bio && (
          <section className="card flex flex-col gap-2 p-6">
            <h2 className="text-lg font-bold">About</h2>
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{p.bio}</p>
          </section>
        )}

        <section className="card flex flex-col gap-3 p-6">
          <h2 className="text-lg font-bold">Services</h2>
          {d.services.length === 0 ? (
            <p className="text-sm text-muted">No services listed yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {d.services.map(({ service: s, categoryName }) => (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
                  <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1">
                    <span className="font-semibold">{s.title}</span>
                    <span className="text-[13px] text-muted">{categoryName} · {s.deliveryModes.map((m) => MODE[m]).join(", ")} · {s.durationMinutes} min</span>
                    {s.description && <p className="text-sm">{s.description}</p>}
                  </div>
                  <span className="font-semibold">{paiseRange(s.priceMinPaise, s.priceMaxPaise)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {d.credentials.length > 0 && (
          <section className="card flex flex-col gap-2 p-6">
            <h2 className="text-lg font-bold">Verified credentials</h2>
            <ul className="flex flex-col gap-1.5 text-[15px]">
              {d.credentials.map((c, i) => (
                <li key={i}>✓ {c.name}{c.issuer ? <span className="text-muted"> · {c.issuer}</span> : null}</li>
              ))}
            </ul>
            <p className="text-[13px] text-muted">Checked by the {BRAND.name} team. Documents are never shown publicly.</p>
          </section>
        )}
      </main>
    </div>
  );
}
