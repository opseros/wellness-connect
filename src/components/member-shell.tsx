import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "./brand";
import { mainNav } from "./nav";
import { navOptions } from "./nav-options";
import { SideNav, type SideGroup } from "./side-nav";
import { getCurrentUser } from "@/modules/identity/session";
import { connectBadges, connectSnapshot } from "@/modules/connect/service";
import { pendingBuddyCount } from "@/modules/connect/social";
import { Avatar } from "@/app/connect/avatar";

type Section = Parameters<typeof mainNav>[1];

/**
 * The member's shell, as in the Wellness Connect prototype: top menu, a
 * profile card and one left-hand menu for Connect, Explore, My bookings and
 * Benefits, then the page. Used by Connect, Explore, bookings, benefits,
 * Plus, sessions and stays so the menu never changes under you.
 */
export async function MemberShell({ section, next, children }: { section: Section; next: string; children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  const [nav, badges, buddies, snap] = await Promise.all([navOptions(me.id), connectBadges(me.id), pendingBuddyCount(me.id), connectSnapshot(me.id)]);

  const groups: SideGroup[] = [
    {
      items: [
        { href: "/connect", label: "Feed", exact: true },
        { href: "/connect/network", label: "My network", badge: badges.invites, also: ["/connect/members"] },
        { href: "/connect/messages", label: "Messages", badge: badges.unread },
        { href: "/connect/groups", label: "Groups & circles" },
        { href: "/connect/meetups", label: "Meet-ups" },
        { href: "/connect/challenges", label: "Challenges" },
        { href: "/connect/buddies", label: "Find a buddy", badge: buddies },
        ...(nav.professional ? [{ href: "/connect/referrals", label: "Referrals", badge: badges.referrals }] : []),
      ],
    },
    {
      title: "Book",
      items: [
        { href: "/explore", label: "Explore", isNew: true },
        { href: "/bookings", label: "My bookings", isNew: true, also: ["/sessions", "/stays"] },
        ...(nav.benefits ? [{ href: "/benefits", label: "My benefits", isNew: true }] : []),
        ...(nav.plus ? [{ href: "/plus", label: "Moosam Plus", isNew: true }] : []),
      ],
    },
    {
      title: "You",
      items: [
        { href: "/app/workspaces", label: "Your workspaces" },
        { href: "/connect/setup", label: "Edit my profile" },
      ],
    },
  ];

  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, section, nav)} />
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-start gap-5 px-4 py-6 sm:px-6">
        <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-3 lg:sticky lg:top-20 lg:max-w-[230px]">
          <section aria-label="Your profile" className="card hidden flex-col overflow-hidden lg:flex">
            <div aria-hidden className="h-14 bg-[linear-gradient(120deg,var(--color-wellness),var(--color-travel),var(--color-meetup))]" />
            <div className="-mt-7 flex flex-col gap-1 px-4 pb-4">
              <span className="w-fit rounded-full ring-4 ring-white"><Avatar name={me.name} size={56} /></span>
              <Link href={`/connect/members/${me.id}`} className="mt-1 font-bold hover:underline">{me.name}</Link>
              <span className="text-[13px] leading-snug text-muted">{snap.headline || "Add a headline so people know what you do"}</span>
              {snap.city && <span className="text-[12.5px] text-muted">{snap.city}</span>}
              <div className="mt-3 flex flex-col border-t border-line pt-2 text-[13.5px]">
                {[
                  { href: "/connect/network", label: "Connections", n: snap.connections },
                  { href: "/connect/groups", label: "Groups & circles", n: snap.groups },
                  { href: `/connect/members/${me.id}`, label: "Posts", n: snap.posts },
                ].map((x) => (
                  <Link key={x.label} href={x.href} className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 text-[#3d4842] hover:bg-ground">
                    {x.label}
                    <span className="font-bold tabular-nums text-ink">{x.n}</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
          <SideNav label="Member menu" heading="Connect" headingOnDesktop={false} groups={groups} />
        </div>
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}
