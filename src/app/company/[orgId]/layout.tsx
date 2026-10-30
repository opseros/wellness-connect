import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { navOptions } from "@/components/nav-options";
import { listBuyerOrgs } from "@/modules/organizations/service";
import { listOrgProposals } from "@/modules/marketplace/service";
import { getCompanyOrExit } from "./company";
import { CompanyNav } from "./company-nav";

export const metadata: Metadata = { title: { default: "Company", template: "%s · Company" } };

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { me, org, isBuyer, isAdmin } = await getCompanyOrExit(orgId);
  const [nav, orgs, proposals] = await Promise.all([
    navOptions(me.id),
    listBuyerOrgs(me.id),
    isBuyer ? listOrgProposals(me.id, orgId) : Promise.resolve([]),
  ]);
  const toReview = proposals.filter((p) => p.proposal.status === "submitted" && p.requirementStatus === "published").length;
  const others = orgs.filter((o) => o.organization.id !== orgId);
  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "company", { ...nav, companyHref: `/company/${orgId}` })} />
      <div className="border-b border-line bg-ground">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-2">
          <CompanyNav base={`/company/${orgId}`} toReview={toReview} isBuyer={isBuyer} isAdmin={isAdmin} />
          <span className="flex items-center gap-2 text-sm text-muted">
            <span className="font-semibold text-ink">{org.name}</span>
            {others.map((o) => (
              <Link key={o.organization.id} href={`/company/${o.organization.id}`} className="text-brand hover:underline">· {o.organization.name}</Link>
            ))}
          </span>
        </div>
      </div>
      <main className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-8">{children}</main>
    </div>
  );
}
