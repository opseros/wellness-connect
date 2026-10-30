import type { Metadata } from "next";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { listMyEnquiries } from "@/modules/marketplace/service";
import { getProOrExit } from "./me";
import { ProNav } from "./pro-nav";

export const metadata: Metadata = { title: { default: "Professional", template: "%s · Professional" } };

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const { me, profile } = await getProOrExit();
  const enquiries = await listMyEnquiries(me.id);
  const open = enquiries.filter((e) => e.status === "sent").length;
  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "pro", { professional: true })} />
      <div className="border-b border-line bg-ground">
        <div className="mx-auto max-w-[1120px] px-6 py-2">
          <ProNav openEnquiries={open} profileId={profile.id} />
        </div>
      </div>
      <main className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 py-8">{children}</main>
    </div>
  );
}
