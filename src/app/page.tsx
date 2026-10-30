import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/auth-forms";
import { enabledProviders } from "@/lib/providers";
import { getCurrentUser } from "@/modules/identity/session";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/app");
  const { reset } = await searchParams;
  return (
    <AuthShell title="Sign in" subtitle={reset ? "Password changed. Sign in with your new password." : "Use your work account or email."}>
      <SignInForm providers={enabledProviders()} />
    </AuthShell>
  );
}
