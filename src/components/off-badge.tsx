import Link from "next/link";

/** Shown to super admins on hospital features while hospitals are switched off. */
export function OffBadge({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/admin/settings"
      title="Hospitals are switched off. Only super admins see this. Change it in Admin, Settings."
      className={`inline-flex items-center gap-1.5 rounded-full bg-[#fbe9e6] px-2.5 py-0.5 text-[12px] font-bold text-[#9b2c1f] hover:underline ${className}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[#9b2c1f]" />
      Off · only super admins see this
    </Link>
  );
}

/** A full-width note for hospital pages while switched off. */
export function OffBanner() {
  return (
    <p role="note" className="rounded-xl bg-[#fbe9e6] px-4 py-3 text-sm text-[#9b2c1f]">
      Hospitals are switched off. You can see this page because you&apos;re a super admin; members, hospital teams and visitors can&apos;t.{" "}
      <Link href="/admin/settings" className="font-semibold underline">Change in Admin, Settings</Link>
    </p>
  );
}
