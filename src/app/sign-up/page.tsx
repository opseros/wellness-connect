import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "@/components/auth-forms";
import { enabledProviders } from "@/lib/providers";

export const metadata: Metadata = { title: "Create an account" };

export const dynamic = "force-dynamic"; // provider buttons depend on runtime env

export default function SignUpPage() {
  return (
    <AuthShell title="Create your account" subtitle="Free for everyone. Pick how you'll use it after signing up.">
      <SignUpForm providers={enabledProviders()} />
    </AuthShell>
  );
}
