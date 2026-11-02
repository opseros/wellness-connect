import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { navOptions } from "@/components/nav-options";
import { getCurrentUser } from "@/modules/identity/session";

export const metadata: Metadata = { title: { default: "My sessions", template: "%s · Sessions" } };

export default async function SessionsLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in?next=/sessions");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "home", await navOptions(me.id))} />
      <main className="mx-auto flex max-w-[880px] flex-col gap-5 px-6 py-8">{children}</main>
    </div>
  );
}
