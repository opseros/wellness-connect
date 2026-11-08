import type { Metadata } from "next";
import Link from "next/link";
import { getStaffOrExit } from "./staff";
import { adminCounts } from "@/modules/admin/service";
import { Logo } from "@/components/brand";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getStaffOrExit();
  const counts = await adminCounts(me);
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-ink px-6 py-3.5 text-white sm:px-8">
        <span className="flex items-center gap-3">
          <Logo href="/admin" light />
          <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">Admin</span>
        </span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[#d5dcd8]">
            {me.name} · {me.platformRole === "super_admin" ? "Super admin" : "Ops"}
          </span>
          <Link href="/app" className="font-semibold text-white hover:underline">Exit admin</Link>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-start gap-6 px-4 py-6 sm:px-6">
        <aside className="min-w-0 flex-[1_1_200px] lg:sticky lg:top-4 lg:max-w-[220px]">
          <AdminNav pending={counts.pendingCredentials} homestays={counts.pendingHomestays} hospitals={counts.pendingHospitals} facilities={counts.pendingFacilities} showHospitals={counts.hospitals} hospitalsOn={counts.hospitalsOn} isSuper={me.platformRole === "super_admin"} reports={counts.openReports} finance={counts.financeAttention} />
        </aside>
        <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
