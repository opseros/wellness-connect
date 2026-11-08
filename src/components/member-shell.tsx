import "server-only";
import { redirect } from "next/navigation";
import { AppHeader } from "./brand";
import { mainNav } from "./nav";
import { navOptions } from "./nav-options";
import { SideNav, type SideGroup } from "./side-nav";
import { getCurrentUser } from "@/modules/identity/session";
import { connectBadges } from "@/modules/connect/service";
import { pendingBuddyCount } from "@/modules/connect/social";

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
  const [nav, badges, buddies] = await Promise.all([navOptions(me.id), connectBadges(me.id), pendingBuddyCount(me.id)]);

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
      items: [
        { href: "/explore", label: "Explore", isNew: true },
        { href: "/bookings", label: "My bookings", isNew: true, also: ["/sessions", "/stays"] },
        ...(nav.benefits ? [{ href: "/benefits", label: "My benefits", isNew: true }] : []),
        ...(nav.plus ? [{ href: "/plus", label: "Moosam Plus", isNew: true }] : []),
      ],
    },
  ];

  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, section, nav)} />
      <div className="mx-auto grid max-w-[1360px] gap-6 px-4 pt-[22px] pb-16 sm:px-6 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside aria-label="Connect" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <SideNav label="Member menu" heading="Connect" groups={groups} />
        </aside>
        <div className="flex min-w-0 flex-col gap-[18px]">{children}</div>
      </div>
    </div>
  );
}
