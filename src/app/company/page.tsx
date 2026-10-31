import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";
import { listBuyerOrgs } from "@/modules/organizations/service";

/** /company → the first company the user can run, or onboarding. */
export default async function CompanyIndex() {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  const orgs = await listBuyerOrgs(me.id);
  redirect(orgs.length ? `/company/${orgs[0].organization.id}` : "/app/onboarding?as=company");
}
