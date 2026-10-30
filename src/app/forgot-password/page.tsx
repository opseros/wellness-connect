import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/auth-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      <ForgotPasswordForm />
      <Link href="/" className="text-center text-sm font-semibold text-brand hover:underline">Back to sign in</Link>
    </AuthShell>
  );
}
