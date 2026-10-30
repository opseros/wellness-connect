import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthShell title="Check your email" subtitle={email ? `We sent a verification link to ${email}.` : "We sent you a verification link."}>
      <p className="text-[15px] leading-relaxed text-muted">
        Open the link to verify your address. You&apos;ll be signed in automatically. If you use a work email, we&apos;ll also
        let your company&apos;s admin know you&apos;d like to join.
      </p>
      <Link href="/" className="btn-outline w-full">Back to sign in</Link>
    </AuthShell>
  );
}
