import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/auth-forms";
import { enabledProviders } from "@/lib/providers";
import { getCurrentUser } from "@/modules/identity/session";

export const metadata: Metadata = { title: "Sign in" };

export const dynamic = "force-dynamic"; // provider buttons depend on runtime env

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") && !sp.next.startsWith("/\\") ? sp.next : "/app";
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title={sp.reset ? "Password changed" : "Welcome back"} subtitle={sp.reset ? "Sign in with your new password." : "Sign in to your feed, messages and bookings."}>
      <SignInForm providers={enabledProviders()} />
    </AuthShell>
  );
}
