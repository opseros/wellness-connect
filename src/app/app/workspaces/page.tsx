import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MemberShell } from "@/components/member-shell";
import { getCurrentUser } from "@/modules/identity/session";
import { listMemberships } from "@/modules/organizations/service";
import { getOwnProfile } from "@/modules/professionals/service";
import { listingsForUser, STATUS_LABEL } from "@/modules/listings/service";
import { hospitalsMode } from "@/modules/platform/features";
import { OffBadge } from "@/components/off-badge";

const roleLabel: Record<string, string> = { owner: "Owner", admin: "Admin", wellness_manager: "Wellness manager", member: "Member" };

function Card({ title, children, badge }: { title: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className={`card flex flex-col gap-3 p-5`}>
      <h3 className="text-lg font-bold">{title}</h3>
      {badge && <span className="-mt-1">{badge}</span>}
      {children}
    </div>
  );
}
const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-sm font-semibold text-brand hover:underline">{children}</Link>
);

function ListingCard({ title, empty, items, add, badge }: { title: string; empty: string; items: Awaited<ReturnType<typeof listingsForUser>>; add: { href: string; label: string }; badge?: React.ReactNode }) {
  return (
    <Card title={title} badge={badge}>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((l) => (
            <li key={l.orgId} className="flex items-center justify-between gap-3 rounded-lg bg-ground px-3.5 py-2.5 text-sm">
              {l.suspended ? <span className="font-semibold">{l.name}</span> : <Link href={`/listing/${l.orgId}`} className="font-semibold text-brand hover:underline">{l.name}</Link>}
              <span className={l.status === "verified" && !l.suspended ? "text-muted" : "font-semibold text-[#7a4b00]"}>{l.suspended ? "Suspended" : STATUS_LABEL[l.status]}</span>
            </li>
          ))}
        </ul>
      )}
      <span className="mt-auto"><A href={add.href}>{add.label}</A></span>
    </Card>
  );
}

export const metadata: Metadata = { title: "Your workspaces" };

/**
 * Your workspaces: the things you run on Moosam (a professional profile, a
 * company, a homestay, a gym or a hospital), each optional and on this same
 * account. Connect, Explore and bookings live in the member menu.
 */
export default async function Workspaces({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  const [all, pro, listings] = await Promise.all([listMemberships(me.id), getOwnProfile(me.id), listingsForUser(me.id)]);
  const companies = all.filter((m) => m.organization.kind === "company");
  const { notice } = await searchParams;
  const homestays = listings.filter((l) => l.kind === "homestay");
  const hospitals = listings.filter((l) => l.kind === "hospital");
  const facilities = listings.filter((l) => l.kind === "facility");
  const hospitalMode = await hospitalsMode(me.id);
  const showHospitals = hospitalMode !== "hidden";

  return (
    <MemberShell section="home" next="/app/workspaces">
      <main className="flex min-w-0 flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[28px] font-bold tracking-tight">Your workspaces</h1>
          <p className="text-[15px] text-muted">Things you run on Moosam. Each is optional and uses this same account.</p>
        </div>
        {notice === "suspended" && <p role="status" className="rounded-xl bg-[#fff4dc] px-4 py-3 text-sm text-[#7a4b00]">That organisation is suspended by our team, so its workspace is closed for now. Contact support to find out more.</p>}

        <section aria-labelledby="offer-h" className="flex flex-col gap-4">
          <h2 id="offer-h" className="sr-only">Offer on Moosam</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Professional profile">
              {pro ? (
                <>
                  <p className="text-sm text-muted">{pro.headline || "No headline yet"}{pro.city ? ` · ${pro.city}` : ""}</p>
                  <span className="self-start rounded-full bg-brand-soft px-3 py-1 text-[13px] font-semibold text-brand-dark">{pro.verificationStatus === "verified" ? "Verified" : `Verification: ${pro.verificationStatus}`}</span>
                  <A href="/pro">Open my professional workspace</A>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">For coaches, nutritionists, physiotherapists and therapists: get verified and get booked by companies.</p>
                  <span className="mt-auto"><A href="/app/onboarding?as=pro">Become a wellness professional</A></span>
                </>
              )}
            </Card>
            <Card title="Company">
              {companies.length === 0 ? (
                <p className="text-sm text-muted">Book wellness programmes for your teams and pay with GST invoices.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {companies.map(({ membership: m, organization: o }) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-ground px-3.5 py-2.5 text-sm">
                      {m.status === "active" && m.role !== "member" && !o.suspendedAt ? <Link href={`/company/${o.id}`} className="font-semibold text-brand hover:underline">{o.name}</Link> : <span className="font-semibold">{o.name}</span>}
                      <span className={m.status === "pending" || o.suspendedAt ? "font-semibold text-[#7a4b00]" : "text-muted"}>{o.suspendedAt ? "Suspended" : m.status === "pending" ? "Waiting for approval" : roleLabel[m.role]}</span>
                    </li>
                  ))}
                </ul>
              )}
              <span className="mt-auto"><A href="/app/onboarding?as=company">{companies.length ? "Add another company" : "Set up a company"}</A></span>
            </Card>
            <ListingCard title="Homestay" items={homestays} empty="Host guests who come to rest, recover or hold a team retreat. To book one for yourself, use “Book a stay”." add={{ href: "/app/onboarding?as=homestay", label: homestays.length ? "List another homestay" : "List a homestay" }} />
            <ListingCard title="Gym, studio or wellness centre" items={facilities} empty="List your gym, yoga or pilates studio, pool or wellness centre so members and companies can find you." add={{ href: "/app/onboarding?as=facility", label: facilities.length ? "List another facility" : "List your facility" }} />
            {showHospitals && <ListingCard badge={hospitalMode === "preview" ? <OffBadge /> : undefined} title="Hospital (Care & Travel)" items={hospitals} empty="Run your hospital’s international patient desk: packages, quote requests and travelling patients." add={{ href: "/app/onboarding?as=hospital", label: hospitals.length ? "Register another hospital" : "Register a hospital" }} />}
          </div>
        </section>
        {showHospitals && (
          <section aria-labelledby="care-h" className="flex flex-col gap-4">
            <h2 id="care-h" className="text-[20px] font-bold">Also on Moosam</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Care & Travel" badge={hospitalMode === "preview" ? <OffBadge /> : undefined}>
                <p className="text-sm text-muted">Compare verified hospitals and ask up to three for a quote, without sharing your records.</p>
                <span className="mt-auto flex flex-wrap gap-x-4 gap-y-1"><A href="/hospitals">Browse hospitals</A><A href="/care/requests">My care requests</A></span>
              </Card>
            </div>
          </section>
        )}
      </main>
    </MemberShell>
  );
}
