import type { Metadata } from "next";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { listMyEnquiries } from "@/modules/marketplace/service";
import { getProOrExit } from "./me";
import { SideNav, type SideGroup } from "@/components/side-nav";
import { proPendingSessionCount } from "@/modules/sessions/service";
import { navOptions } from "@/components/nav-options";

export const metadata: Metadata = { title: { default: "Professional", template: "%s · Professional" } };

/** Professional workspace: the prototype's left-hand menu (dashboard, sessions, schedule, earnings, profile). */
export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const { me, profile } = await getProOrExit();
  const [enquiries, sessionRequests] = await Promise.all([listMyEnquiries(me.id), proPendingSessionCount(me.id)]);
  const open = enquiries.filter((e) => e.status === "sent").length;
  const groups: SideGroup[] = [
    {
      items: [
        { href: "/pro", label: "Dashboard", exact: true },
        { href: "/pro/sessions", label: "Session requests", badge: sessionRequests },
        { href: "/pro/schedule", label: "Schedule" },
        { href: "/pro/earnings", label: "Earnings", isNew: true },
      ],
    },
    {
      title: "Companies",
      items: [
        { href: "/pro/enquiries", label: "Enquiries", badge: open },
        { href: "/pro/proposals", label: "Proposals & bookings" },
      ],
    },
    {
      title: "Profile",
      items: [
        { href: "/pro/profile", label: "Profile" },
        { href: "/pro/services", label: "Services" },
        { href: "/pro/credentials", label: "Credentials" },
        { href: `/p/${profile.id}`, label: "Public profile ↗" },
      ],
    },
  ];
  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "pro", await navOptions(me.id))} />
      <div className="mx-auto grid max-w-[1360px] gap-6 px-4 pt-[22px] pb-16 sm:px-6 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <SideNav label="Professional" heading="Professional workspace" groups={groups} />
        </aside>
        <main className="flex min-w-0 flex-col gap-[18px]">{children}</main>
      </div>
    </div>
  );
}
