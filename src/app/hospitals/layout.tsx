import { notFound } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";
import { hospitalsMode } from "@/modules/platform/features";
import { OffBanner } from "@/components/off-badge";

/** Hospitals are switched off by default (Admin → Settings); until then only super admins see these pages. */
export default async function HospitalsLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  const mode = await hospitalsMode(me?.id);
  if (mode === "hidden") notFound();
  return (
    <>
      {mode === "preview" && (
        <div className="mx-auto max-w-[1200px] px-4 pt-3 sm:px-8">
          <OffBanner />
        </div>
      )}
      {children}
    </>
  );
}
