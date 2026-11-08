import { SideNav, type SideGroup } from "@/components/side-nav";

/** Homestay, gym/studio or hospital workspace menu. */
export function ListingNav({ base, name, pending, kind = "homestay" }: { base: string; name: string; pending: number; kind?: "homestay" | "hospital" | "facility" }) {
  const items =
    kind === "facility"
      ? [
          { href: base, label: "Overview & listing", exact: true },
          { href: `${base}/plans`, label: "Plans & passes", isNew: true },
          { href: `${base}/members`, label: "Members", isNew: true },
        ]
      : kind === "hospital"
        ? [
            { href: base, label: "Profile", exact: true },
            { href: `${base}/packages`, label: "Packages" },
            { href: `${base}/requests`, label: "Quote requests", badge: pending },
          ]
        : [
            { href: base, label: "Overview & listing", exact: true },
            { href: `${base}/bookings`, label: "Stay requests", badge: pending },
            { href: `${base}/calendar`, label: "Calendar & prices" },
          ];
  const groups: SideGroup[] = [{ items }];
  return <SideNav label={{ homestay: "Homestay", hospital: "Hospital", facility: "Facility" }[kind]} heading={name} groups={groups} />;
}
