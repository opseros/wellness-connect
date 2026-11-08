import type { Metadata } from "next";
import { MemberShell } from "@/components/member-shell";

export const metadata: Metadata = { title: { default: "My sessions", template: "%s · Sessions" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <MemberShell section="bookings" next="/sessions">
      <main className="flex min-w-0 flex-col gap-5">{children}</main>
    </MemberShell>
  );
}
