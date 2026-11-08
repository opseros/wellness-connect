import type { Metadata } from "next";
import Link from "next/link";
import { getStaffOrExit } from "./staff";
import { adminCounts } from "@/modules/admin/service";
import { Logo } from "@/components/brand";
import { AdminNav } from "./admin-nav";

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
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-ink pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
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
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-start gap-6 px-4 py-6 sm:px-6">
        <aside className="min-w-0 flex-[1_1_200px] lg:sticky lg:top-20 lg:max-w-[220px]">
          <AdminNav
            pending={counts.pendingCredentials}
            homestays={counts.pendingHomestays}
            hospitals={counts.pendingHospitals}
            facilities={counts.pendingFacilities}
            showHospitals={counts.hospitals}
            hospitalsOn={counts.hospitalsOn}
            isSuper={me.platformRole === "super_admin"}
            reports={counts.openReports}
            finance={counts.financeAttention}
          />
        </aside>
        <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
          {children}
        </main>
      </div>
    </div>
  );
}
