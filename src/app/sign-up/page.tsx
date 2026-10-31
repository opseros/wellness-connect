import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { JoinPanel } from "@/components/join-panel";
import { enabledProviders } from "@/lib/providers";
import { getCurrentUser } from "@/modules/identity/session";

export const metadata: Metadata = { title: "Join free" };

export const dynamic = "force-dynamic"; // provider buttons depend on runtime env

/** ?as=pro preselects "wellness professional"; a ?next= (e.g. a homestay or hospital set-up) hides the choice. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ as?: string; next?: string }> }) {
  if (await getCurrentUser()) redirect("/app");
  const sp = await searchParams;
  return (
    <AuthShell>
      <JoinPanel providers={enabledProviders()} initialRole={sp.as === "pro" ? "pro" : "member"} showRoles={!sp.next} />
    </AuthShell>
  );
}
