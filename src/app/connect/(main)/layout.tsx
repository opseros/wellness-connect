import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { navOptions } from "@/components/nav-options";
import { getCurrentUser } from "@/modules/identity/session";
import { connectBadges } from "@/modules/connect/service";
import { ConnectNav } from "../connect-nav";

export const metadata: Metadata = { title: { default: "Connect", template: "%s · Connect" } };

export default async function ConnectLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/?next=/connect");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  const [nav, badges] = await Promise.all([navOptions(me.id), connectBadges(me.id)]);
  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "connect", nav)} />
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-5 px-4 py-6 sm:px-6">
        <ConnectNav badges={badges} professional={Boolean(nav.professional)} />
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}
