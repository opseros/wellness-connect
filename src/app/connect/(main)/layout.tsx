import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { navOptions } from "@/components/nav-options";
import { getCurrentUser } from "@/modules/identity/session";
import Link from "next/link";
import { connectBadges, connectSnapshot } from "@/modules/connect/service";
import { Avatar } from "../avatar";
import { ConnectNav } from "../connect-nav";

export const metadata: Metadata = { title: { default: "Connect", template: "%s · Connect" } };

export default async function ConnectLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in?next=/connect");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  const [nav, badges, snap] = await Promise.all([navOptions(me.id), connectBadges(me.id), connectSnapshot(me.id)]);
  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "connect", nav)} />
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-5 px-4 py-6 sm:px-6">
        <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-3 lg:sticky lg:top-4 lg:max-w-[230px]">
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
                  { href: "/connect/groups", label: "Groups & spaces", n: snap.groups },
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
          <ConnectNav badges={badges} professional={Boolean(nav.professional)} />
        </div>
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}
