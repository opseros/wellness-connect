import type { Metadata } from "next";
import { MemberShell } from "@/components/member-shell";

export const metadata: Metadata = { title: { default: "My stays", template: "%s · My stays" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <MemberShell section="bookings" next="/stays">
      <main className="flex min-w-0 flex-col gap-6">{children}</main>
    </MemberShell>
  );
}
