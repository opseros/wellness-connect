import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { getCurrentUser } from "@/modules/identity/session";
import { listMemberships } from "@/modules/organizations/service";
import { getOwnProfile } from "@/modules/professionals/service";
import { listingsForUser, STATUS_LABEL } from "@/modules/listings/service";
import { BRAND } from "@/lib/brand";
import { navOptions } from "@/components/nav-options";

const roleLabel: Record<string, string> = { owner: "Owner", admin: "Admin", wellness_manager: "Wellness manager", member: "Member" };

export default async function AppHome() {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  const [all, pro, listings] = await Promise.all([listMemberships(me.id), getOwnProfile(me.id), listingsForUser(me.id)]);
  const memberships = all.filter((m) => m.organization.kind === "company");
  const firstName = me.name.split(" ")[0];
  const nothingYet = memberships.length === 0 && !pro && listings.length === 0;

  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "home", await navOptions(me.id))} />
      <main className="mx-auto flex max-w-[1120px] flex-col gap-7 px-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold">Welcome, {firstName}</h1>
          <p className="text-[15px] text-muted">Every account includes Connect. Add a company, professional profile, homestay or hospital any time.</p>
        </div>

        {nothingYet && (
          <div className="rounded-xl bg-brand-soft px-5 py-4 text-[15px] text-brand-dark">
            Choose how you&apos;ll use {BRAND.name} to get started.{" "}
            <Link href="/app/onboarding" className="font-semibold underline">Set up my account</Link>
          </div>
        )}

        <section className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          <div className="card flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold">Companies</h2>
            {memberships.length === 0 ? (
              <p className="text-sm text-muted">You don&apos;t belong to a company yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {memberships.map(({ membership: m, organization: o }) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-ground px-3.5 py-3 text-sm">
                    {m.status === "active" && m.role !== "member" ? (
                      <Link href={`/company/${o.id}`} className="font-semibold text-brand hover:underline">{o.name}</Link>
                    ) : (
                      <span className="font-semibold">{o.name}</span>
                    )}
                    <span className={m.status === "pending" ? "font-semibold text-[#7a4b00]" : "text-muted"}>
                      {m.status === "pending" ? "Waiting for approval" : roleLabel[m.role]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/app/onboarding?as=company" className="text-sm font-semibold text-brand hover:underline">+ Create a company</Link>
          </div>

          <div className="card flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold">Professional profile</h2>
            {pro ? (
              <>
                <p className="text-sm text-muted">{pro.headline || "No headline yet"} · {pro.city || "No city"}</p>
                <span className="self-start rounded-full bg-brand-soft px-3 py-1 text-[13px] font-semibold text-brand-dark">
                  Verification: {pro.verificationStatus}
                </span>
                <Link href="/pro" className="text-sm font-semibold text-brand hover:underline">Open my professional workspace →</Link>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Offer workshops and programs to companies once your credentials are verified.</p>
                <Link href="/app/onboarding?as=pro" className="text-sm font-semibold text-brand hover:underline">+ Become a wellness professional</Link>
              </>
            )}
          </div>

          <div className="card flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold">Homestays &amp; hospitals</h2>
            {listings.length === 0 ? (
              <p className="text-sm text-muted">Host travellers who come to rest or recover, or welcome patients who travel for care.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {listings.map((l) => (
                  <li key={l.orgId} className="flex items-center justify-between gap-3 rounded-lg bg-ground px-3.5 py-3 text-sm">
                    <Link href={`/listing/${l.orgId}`} className="font-semibold text-brand hover:underline">{l.name}</Link>
                    <span className={l.status === "verified" ? "text-muted" : "font-semibold text-[#7a4b00]"}>{l.kind === "hospital" ? "Hospital" : "Homestay"} · {STATUS_LABEL[l.status]}</span>
                  </li>
                ))}
              </ul>
            )}
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/app/onboarding?as=homestay" className="text-sm font-semibold text-brand hover:underline">+ List a homestay</Link>
              <Link href="/app/onboarding?as=hospital" className="text-sm font-semibold text-brand hover:underline">+ Register a hospital</Link>
            </span>
          </div>

          <div className="card flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold">Stays</h2>
            <p className="text-sm text-muted">Verified homestays for rest, recovery or a team retreat. Request dates; pay once the host accepts.</p>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/stays" className="text-sm font-semibold text-brand hover:underline">My stays →</Link>
              <Link href="/homestays" className="text-sm font-semibold text-brand hover:underline">Find a homestay</Link>
            </span>
          </div>

          <div className="card flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold">Connect</h2>
            <p className="text-sm text-muted">Your free professional network: posts, connections and messages.</p>
            <Link href="/connect" className="text-sm font-semibold text-brand hover:underline">Open Connect →</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
