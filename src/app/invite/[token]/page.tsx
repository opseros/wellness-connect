import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Flash } from "@/components/ui";
import { getCurrentUser } from "@/modules/identity/session";
import { previewInvitation } from "@/modules/organizations/service";
import { acceptInvitationAction } from "@/app/company/actions";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

const ROLE: Record<string, string> = { admin: "an admin", wellness_manager: "a wellness manager", member: "a member" };

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const [inv, me] = await Promise.all([previewInvitation(token), getCurrentUser()]);
  const here = `/invite/${token}`;

  if (!inv) {
    return (
      <AuthShell title="Invitation not available" subtitle="This invitation has expired, was revoked or has already been used.">
        <p className="text-[15px] text-muted">Ask the person who invited you to send a new one.</p>
        <Link href="/app" className="btn-primary">Go to the app</Link>
      </AuthShell>
    );
  }

  const title = `Join ${inv.orgName}`;
  const subtitle = `You've been invited as ${ROLE[inv.role]}.`;
  if (!me) {
    return (
      <AuthShell title={title} subtitle={subtitle}>
        <p className="text-[15px]">This invitation is for <span className="font-semibold">{inv.email}</span>. Sign in or create an account with that email to accept it.</p>
        <div className="flex flex-col gap-2">
          <Link href={`/?next=${encodeURIComponent(here)}`} className="btn-primary">Sign in</Link>
          <Link href={`/sign-up?email=${encodeURIComponent(inv.email)}&next=${encodeURIComponent(here)}`} className="btn-outline">Create an account</Link>
        </div>
      </AuthShell>
    );
  }
  const matches = me.email.toLowerCase() === inv.email;
  return (
    <AuthShell title={title} subtitle={subtitle}>
      <Flash error={sp.error} />
      {matches ? (
        me.emailVerified ? (
          <form action={acceptInvitationAction} className="flex flex-col gap-3">
            <input type="hidden" name="token" value={token} />
            <button className="btn-primary">Accept and join {inv.orgName}</button>
          </form>
        ) : (
          <p className="text-[15px]">Verify your email first, then open this link again.</p>
        )
      ) : (
        <>
          <p className="text-[15px]">
            You&apos;re signed in as <span className="font-semibold">{me.email}</span>, but this invitation is for <span className="font-semibold">{inv.email}</span>.
          </p>
          <form action="/sign-out" method="post">
            <button className="btn-outline w-full">Sign out and switch account</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
