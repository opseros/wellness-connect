import "server-only";
import { cache } from "react";
import { listBuyerOrgs } from "@/modules/organizations/service";
import { getOwnProfile } from "@/modules/professionals/service";
import { listingsForUser } from "@/modules/listings/service";
import type { NavOptions } from "./nav";

/** Which optional sections the main navigation shows for this user. */
export const navOptions = cache(async (userId: string): Promise<NavOptions> => {
  const [orgs, pro, listings] = await Promise.all([listBuyerOrgs(userId), getOwnProfile(userId), listingsForUser(userId)]);
  const l = listings[0];
  return {
    professional: Boolean(pro),
    companyHref: orgs.length ? `/company/${orgs[0].organization.id}` : null,
    listing: l ? { href: `/listing/${l.orgId}`, label: l.kind === "hospital" ? "Hospital" : "Homestay" } : null,
  };
});
