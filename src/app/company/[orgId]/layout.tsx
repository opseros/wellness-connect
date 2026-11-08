import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { navOptions } from "@/components/nav-options";
import { listBuyerOrgs } from "@/modules/organizations/service";
import { listOrgProposals } from "@/modules/marketplace/service";
import { getCompanyOrExit } from "./company";
import { hospitalsVisible } from "@/modules/platform/features";
import { CompanyNav } from "./company-nav";

export const metadata: Metadata = { title: { default: "Company", template: "%s · Company" } };

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { me, org, isBuyer, isAdmin } = await getCompanyOrExit(orgId);
  const [nav, orgs, proposals, healthChecks] = await Promise.all([
    navOptions(me.id),
    listBuyerOrgs(me.id),
    isBuyer ? listOrgProposals(me.id, orgId) : Promise.resolve([]),
    hospitalsVisible(me.id),
  ]);
  const toReview = proposals.filter((p) => p.proposal.status === "submitted" && p.requirementStatus === "published").length;
  const others = orgs.filter((o) => o.organization.id !== orgId);
  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "company", { ...nav, companyHref: `/company/${orgId}` })} />
      <div className="mx-auto grid max-w-[1360px] gap-6 px-4 pt-[22px] pb-16 sm:px-6 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <CompanyNav base={`/company/${orgId}`} name={org.name} toReview={toReview} isBuyer={isBuyer} isAdmin={isAdmin} healthChecks={healthChecks} />
          {others.length > 0 && (
            <p className="hidden px-3.5 text-[13px] text-muted lg:block">
              Also:{" "}
              {others.map((o, i) => (
                <span key={o.organization.id}>
                  {i > 0 && ", "}
                  <Link href={`/company/${o.organization.id}`} className="font-semibold text-brand hover:underline">{o.organization.name}</Link>
                </span>
              ))}
            </p>
          )}
        </aside>
        <main className="flex min-w-0 flex-col gap-[18px]">{children}</main>
      </div>
    </div>
  );
}
