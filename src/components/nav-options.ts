import "server-only";
import { cache } from "react";
import { listBuyerOrgs } from "@/modules/organizations/service";
import { getOwnProfile } from "@/modules/professionals/service";
import type { NavOptions } from "./nav";

/** Which optional sections the main navigation shows for this user. */
export const navOptions = cache(async (userId: string): Promise<NavOptions> => {
  const [orgs, pro] = await Promise.all([listBuyerOrgs(userId), getOwnProfile(userId)]);
  return { professional: Boolean(pro), companyHref: orgs.length ? `/company/${orgs[0].organization.id}` : null };
});
