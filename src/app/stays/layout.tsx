import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { navOptions } from "@/components/nav-options";
import { getCurrentUser } from "@/modules/identity/session";

export const metadata: Metadata = { title: { default: "My stays", template: "%s · My stays" } };

export default async function StaysLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in?next=/stays");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "home", await navOptions(me.id))} />
      <main className="mx-auto flex max-w-[960px] flex-col gap-6 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
