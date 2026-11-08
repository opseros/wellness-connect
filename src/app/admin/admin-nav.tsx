import { SideNav, type SideGroup } from "@/components/side-nav";
import type { AdminSection } from "./sections";

/**
 * Admin left-hand menu, as in the prototype: seven sections. Each section's
 * pages sit behind tabs at the top of the page (see AdminSectionTabs).
 */
export function AdminNav({ sections, isSuper }: { sections: AdminSection[]; isSuper: boolean }) {
  const groups: SideGroup[] = [
    {
      items: sections.map((s) => ({
        href: s.href,
        label: s.label,
        exact: s.key === "overview",
        isNew: s.isNew,
        badge: s.badge,
        also: s.tabs.flatMap((t) => [t.href.split("?")[0], ...(t.also ?? [])]),
      })),
    },
  ];
  return <SideNav label="Admin" heading={isSuper ? "Super admin" : "Admin"} groups={groups} />;
}
