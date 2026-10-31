import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { navOptions } from "@/components/nav-options";
import { getCurrentUser } from "@/modules/identity/session";

export const metadata: Metadata = { title: { default: "Care & Travel", template: "%s · Care & Travel" }, robots: { index: false } };

export default async function CareLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/?next=/care/requests");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "home", await navOptions(me.id))} />
      <main className="mx-auto flex max-w-[1080px] flex-col gap-6 px-4 py-8 sm:px-6">
        {children}
        <p className="text-[12.5px] text-muted">Care &amp; Travel helps you compare hospitals and plan the trip. It isn&apos;t medical advice: talk to a qualified doctor about your treatment.</p>
      </main>
    </div>
  );
}
