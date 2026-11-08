// Admin information architecture (as in the Wellness Connect prototype):
// Overview, Approvals, Organisations, Partners, Finance, Reports, Settings.
// Every existing admin page lives in one section; sections with several pages
// show them as tabs. URLs are unchanged.

export type AdminTab = { href: string; label: string; badge?: number; also?: string[] };
export type AdminSection = { key: string; href: string; label: string; badge?: number; isNew?: boolean; tabs: AdminTab[] };

type Counts = {
  pendingCredentials: number;
  pendingHomestays: number;
  pendingFacilities: number;
  pendingHospitals: number;
  hospitals: boolean;
  hospitalsOn: boolean;
  openReports: number;
  financeAttention: number;
};

export function adminSections(c: Counts, isSuper: boolean): AdminSection[] {
  const approvals: AdminTab[] = [
    { href: "/admin/professionals", label: "Professionals", badge: c.pendingCredentials, also: ["/admin/credentials"] },
    { href: "/admin/homestays", label: "Homestays", badge: c.pendingHomestays, also: ["/admin/listings"] },
    { href: "/admin/facilities", label: "Gyms & studios", badge: c.pendingFacilities },
    ...(c.hospitals ? [{ href: "/admin/hospitals", label: c.hospitalsOn ? "Hospitals" : "Hospitals (off)", badge: c.pendingHospitals }] : []),
  ];
  const pending = c.pendingCredentials + c.pendingHomestays + c.pendingFacilities + (c.hospitals ? c.pendingHospitals : 0);
  return [
    { key: "overview", href: "/admin", label: "Overview", isNew: true, tabs: [] },
    { key: "approvals", href: "/admin/approvals", label: "Approvals", badge: pending, tabs: approvals },
    {
      key: "organisations",
      href: "/admin/organizations",
      label: "Organisations",
      tabs: [
        { href: "/admin/organizations", label: "Organisations" },
        { href: "/admin/users", label: "People" },
      ],
    },
    { key: "partners", href: "/admin/partners", label: "Partners", isNew: true, tabs: [{ href: "/admin/partners", label: "Partners" }] },
    {
      key: "finance",
      href: "/admin/finance",
      label: "Finance",
      badge: c.financeAttention,
      tabs: [
        { href: "/admin/finance", label: "Bookings & payouts", badge: c.financeAttention },
        { href: "/admin/credits", label: "Wellness credits" },
      ],
    },
    {
      key: "reports",
      href: "/admin/reports",
      label: "Reports",
      badge: c.openReports,
      tabs: [
        { href: "/admin/reports", label: "Reported content", badge: c.openReports },
        { href: "/admin/challenges", label: "Challenges" },
        { href: "/admin/audit", label: "Audit log" },
      ],
    },
    ...(isSuper ? [{ key: "settings", href: "/admin/settings", label: "Settings", tabs: [{ href: "/admin/settings", label: "Settings" }] }] : []),
  ];
}
