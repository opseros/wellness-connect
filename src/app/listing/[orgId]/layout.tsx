import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { navOptions } from "@/components/nav-options";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { getListingWorkspace } from "@/modules/listings/service";
import { isOrgSuspendedError } from "@/modules/organizations/service";
import { hostPendingCount } from "@/modules/stays/service";
import { hospitalOpenRequestCount } from "@/modules/care/service";
import { ListingNav } from "../listing-nav";

export const metadata: Metadata = { title: "Workspace" };

export default async function ListingLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect(`/check-email?email=${encodeURIComponent(me.email)}`);
  const { orgId } = await params;
  const w = await getListingWorkspace(me.id, orgId).catch((e) => {
    if (e instanceof AppError && (e.status === 404 || e.status === 400)) notFound();
    if (isOrgSuspendedError(e)) redirect("/app?notice=suspended");
    throw e;
  });
  const nav = await navOptions(me.id);
  const kind = w.listing.kind;
  const pending = kind === "homestay" ? await hostPendingCount(me.id, orgId) : kind === "hospital" ? await hospitalOpenRequestCount(me.id, orgId) : 0;
  const label = { homestay: "Homestay", hospital: "Hospital", facility: "Facility" }[kind];
  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "listing", { ...nav, listing: { href: `/listing/${orgId}`, label } })} />
      <main className="mx-auto flex max-w-[1120px] flex-col gap-6 px-4 py-8 sm:px-6">
        {(
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ListingNav base={`/listing/${orgId}`} pending={pending} kind={kind} />
            <span className="text-sm font-semibold">{w.org.name}</span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
