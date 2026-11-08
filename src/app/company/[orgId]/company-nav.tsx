import { SideNav, type SideGroup } from "@/components/side-nav";

/** Company workspace menu, grouped as in the prototype: overview and people, benefits, buying, records. */
export function CompanyNav({ base, name, toReview, isBuyer, isAdmin, healthChecks = false }: { base: string; name: string; toReview: number; isBuyer: boolean; isAdmin: boolean; healthChecks?: boolean }) {
  const groups: SideGroup[] = [
    {
      items: [
        { href: base, label: "Overview", exact: true },
        { href: `${base}/settings`, label: isAdmin ? "People & settings" : "People" },
      ],
    },
    ...(isBuyer
      ? [
          {
            title: "Benefits",
            items: [
              { href: `${base}/credits`, label: "Benefit policy", isNew: true },
              { href: `${base}/retreats`, label: "Team retreats", isNew: true },
              { href: `${base}/challenges`, label: "Challenges" },
              ...(healthChecks ? [{ href: `${base}/health-checks`, label: "Health check-ups" }] : []),
            ],
          },
          {
            title: "Programmes",
            items: [
              { href: `${base}/requirements`, label: "Requirements" },
              { href: `${base}/proposals`, label: "Proposals", badge: toReview },
              { href: `${base}/bookings`, label: "Bookings" },
              { href: `${base}/invoices`, label: "Invoices" },
            ],
          },
        ]
      : []),
  ];
  return <SideNav label="Company" heading={name} groups={groups} />;
}
