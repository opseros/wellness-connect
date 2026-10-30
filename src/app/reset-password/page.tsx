import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/auth-forms";

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
