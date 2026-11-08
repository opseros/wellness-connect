import type { Metadata } from "next";
import Link from "next/link";
import { getStaffOrExit } from "./staff";
import { adminCounts } from "@/modules/admin/service";
import { Logo } from "@/components/brand";
import { AdminNav } from "./admin-nav";
import { AdminSectionTabs } from "./section-tabs";
import { adminSections } from "./sections";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getStaffOrExit();
  const counts = await adminCounts(me);
  const isSuper = me.platformRole === "super_admin";
  const sections = adminSections(counts, isSuper);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-ink pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-3">
            <Logo href="/admin" light />
            <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
              Admin
            </span>
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-[#d5dcd8] sm:inline">
              {me.name} ·{" "}
              {me.platformRole === "super_admin" ? "Super admin" : "Ops"}
            </span>
            <Link
              href="/app"
              className="font-semibold whitespace-nowrap text-white hover:underline"
            >
              Exit admin
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1360px] gap-6 px-4 pt-[22px] pb-16 sm:px-6 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <AdminNav sections={sections} isSuper={isSuper} />
        </aside>
        <main className="flex min-w-0 flex-col gap-[18px]">
          <AdminSectionTabs sections={sections} />
          {children}
        </main>
      </div>
    </div>
  );
}
