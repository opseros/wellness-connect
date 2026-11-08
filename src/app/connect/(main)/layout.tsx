import type { Metadata } from "next";
import { MemberShell } from "@/components/member-shell";

export const metadata: Metadata = { title: { default: "Connect", template: "%s · Connect" } };

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return (
    <MemberShell section="connect" next="/connect">
      {children}
    </MemberShell>
  );
}
