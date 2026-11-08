import "server-only";
import { cache } from "react";
import { listBuyerOrgs } from "@/modules/organizations/service";
import { getOwnProfile } from "@/modules/professionals/service";
import { listingsForUser } from "@/modules/listings/service";
import { myWallets } from "@/modules/marketplace/credits";
import { plusFor } from "@/modules/platform/plus";
import type { NavOptions } from "./nav";

/** Which optional sections the main navigation shows for this user. */
export const navOptions = cache(async (userId: string): Promise<NavOptions> => {
  const [orgs, pro, listings, wallets, plus] = await Promise.all([listBuyerOrgs(userId), getOwnProfile(userId), listingsForUser(userId), myWallets(userId), plusFor(userId)]);
  const l = listings.find((x) => !x.suspended);
  return {
    professional: Boolean(pro),
    companyHref: orgs.length ? `/company/${orgs[0].organization.id}` : null,
    benefits: wallets.length > 0,
    plus: Boolean(plus),
    listing: l ? { href: `/listing/${l.orgId}`, label: { homestay: "Homestay", hospital: "Hospital", facility: "Facility" }[l.kind] } : null,
  };
});
