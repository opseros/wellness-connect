import { SideNav, type SideGroup } from "@/components/side-nav";

/** Admin left-hand menu, grouped as in the prototype: overview, approvals, people, money, community, system. */
export function AdminNav({ pending, homestays = 0, hospitals = 0, facilities = 0, showHospitals = true, hospitalsOn = true, isSuper = false, reports, finance = 0 }: { pending: number; homestays?: number; hospitals?: number; facilities?: number; showHospitals?: boolean; hospitalsOn?: boolean; isSuper?: boolean; reports: number; finance?: number }) {
  const groups: SideGroup[] = [
    { items: [{ href: "/admin", label: "Overview", exact: true, isNew: true }] },
    {
      title: "Approvals",
      items: [
        { href: "/admin/professionals", label: "Professionals", badge: pending, also: ["/admin/credentials"] },
        { href: "/admin/homestays", label: "Homestays", badge: homestays },
        { href: "/admin/facilities", label: "Gyms & studios", badge: facilities },
        ...(showHospitals ? [{ href: "/admin/hospitals", label: hospitalsOn ? "Hospitals" : "Hospitals (off)", badge: hospitals }] : []),
      ],
    },
    {
      title: "People",
      items: [
        { href: "/admin/users", label: "Users" },
        { href: "/admin/organizations", label: "Organisations" },
      ],
    },
    {
      title: "Money",
      items: [
        { href: "/admin/finance", label: "Finance", badge: finance },
        { href: "/admin/credits", label: "Wellness credits", isNew: true },
      ],
    },
    {
      title: "Community",
      items: [
        { href: "/admin/challenges", label: "Challenges" },
        { href: "/admin/reports", label: "Reports", badge: reports },
      ],
    },
    {
      title: "System",
      items: [
        { href: "/admin/audit", label: "Audit log" },
        ...(isSuper ? [{ href: "/admin/settings", label: "Settings" }] : []),
      ],
    },
  ];
  return <SideNav label="Admin" heading="Admin" groups={groups} />;
}
