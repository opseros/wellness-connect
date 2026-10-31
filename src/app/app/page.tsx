import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { navOptions } from "@/components/nav-options";
import { getCurrentUser } from "@/modules/identity/session";
import { listMemberships } from "@/modules/organizations/service";
import { getOwnProfile } from "@/modules/professionals/service";
import { listingsForUser, STATUS_LABEL } from "@/modules/listings/service";
import { connectBadges, getMemberProfile } from "@/modules/connect/service";

const roleLabel: Record<string, string> = { owner: "Owner", admin: "Admin", wellness_manager: "Wellness manager", member: "Member" };

function Card({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`card flex flex-col gap-3 p-5 ${wide ? "md:col-span-2 md:row-span-2" : ""}`}>
      <h3 className="text-lg font-bold">{title}</h3>
      {children}
    </div>
  );
}
const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-sm font-semibold text-brand hover:underline">{children}</Link>
);

/**
 * Signed-in home, in two parts so it's clear what's what:
 * "Use" (Connect, booking a stay, Care & Travel) and "Offer" (things you run:
 * a professional profile, a company, a homestay or a hospital).
 */
function ListingCard({ title, empty, items, add }: { title: string; empty: string; items: Awaited<ReturnType<typeof listingsForUser>>; add: { href: string; label: string } }) {
  return (
    <Card title={title}>
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

export default async function AppHome({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  const [all, pro, listings, badges, member] = await Promise.all([listMemberships(me.id), getOwnProfile(me.id), listingsForUser(me.id), connectBadges(me.id), getMemberProfile(me.id)]);
  const companies = all.filter((m) => m.organization.kind === "company");
  const firstName = me.name.split(" ")[0];
  const { notice } = await searchParams;
  const profileMissing = !member?.headline || !member?.city;
  const homestays = listings.filter((l) => l.kind === "homestay");
  const hospitals = listings.filter((l) => l.kind === "hospital");

  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "home", await navOptions(me.id))} />
      <main className="mx-auto flex max-w-[1120px] flex-col gap-9 px-4 py-8 sm:px-6">
        <h1 className="font-display text-[32px] font-bold tracking-tight">Welcome, {firstName}</h1>
        {notice === "suspended" && <p role="status" className="rounded-xl bg-[#fff4dc] px-4 py-3 text-sm text-[#7a4b00]">That organisation is suspended by our team, so its workspace is closed for now. Contact support to find out more.</p>}

        <section aria-labelledby="use-h" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="use-h" className="text-[20px] font-bold">Use Moosam</h2>
            <p className="text-[15px] text-muted">Your network, and things you can book for yourself.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Connect" wide>
              {profileMissing ? (
                <p className="rounded-lg bg-brand-soft px-3.5 py-3 text-sm text-brand-dark">Add a headline and your city so people can find you. <Link href="/connect/setup" className="font-semibold underline">Finish my profile</Link></p>
              ) : (
                <p className="text-sm text-muted">{member?.headline} · {member?.city}</p>
              )}
              <ul className="flex flex-wrap gap-2 text-sm">
                <li><Link href="/connect/network" className="flex items-center gap-2 rounded-full bg-ground px-3.5 py-2 font-semibold hover:bg-brand-soft">Invitations{badges.invites > 0 && <span className="rounded-full bg-[#f2c46d] px-2 text-xs">{badges.invites}</span>}</Link></li>
                <li><Link href="/connect/messages" className="flex items-center gap-2 rounded-full bg-ground px-3.5 py-2 font-semibold hover:bg-brand-soft">Messages{badges.unread > 0 && <span className="rounded-full bg-[#f2c46d] px-2 text-xs">{badges.unread}</span>}</Link></li>
                <li><Link href="/connect/groups" className="rounded-full bg-ground px-3.5 py-2 font-semibold hover:bg-brand-soft">Groups &amp; spaces</Link></li>
                <li><Link href="/connect/meetups" className="rounded-full bg-ground px-3.5 py-2 font-semibold hover:bg-brand-soft">Meet-ups</Link></li>
              </ul>
              <span className="mt-auto"><A href="/connect">Open my feed</A></span>
            </Card>
            <Card title="Book a stay">
              <p className="text-sm text-muted">Verified homestays for a break, recovery or a team retreat. You pay once the host accepts.</p>
              <span className="mt-auto flex flex-wrap gap-x-4 gap-y-1"><A href="/homestays">Find a homestay</A><A href="/stays">My stays</A></span>
            </Card>
            <Card title="Care & Travel">
              <p className="text-sm text-muted">Compare verified hospitals and ask up to three for a quote, without sharing your records.</p>
              <span className="mt-auto flex flex-wrap gap-x-4 gap-y-1"><A href="/hospitals">Browse hospitals</A><A href="/care/requests">My care requests</A></span>
            </Card>
          </div>
        </section>

        <section aria-labelledby="offer-h" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="offer-h" className="text-[20px] font-bold">Offer on Moosam</h2>
            <p className="text-[15px] text-muted">Things you run. Each is optional and uses this same account.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            <ListingCard title="Hospital (Care & Travel)" items={hospitals} empty="Run your hospital’s international patient desk: packages, quote requests and travelling patients." add={{ href: "/app/onboarding?as=hospital", label: hospitals.length ? "Register another hospital" : "Register a hospital" }} />
          </div>
        </section>
      </main>
    </div>
  );
}
