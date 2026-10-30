"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export type Providers = { google: boolean; microsoft: boolean };

function SocialButtons({ providers }: { providers: Providers }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!providers.google && !providers.microsoft) return null;
  const go = async (provider: "google" | "microsoft") => {
    setBusy(provider);
    await authClient.signIn.social({ provider, callbackURL: "/app" });
  };
  // Replace these with each provider's official branded button before launch.
  return (
    <div className="flex flex-col gap-3">
      {providers.google && (
        <button type="button" className="btn-outline w-full" disabled={busy !== null} onClick={() => go("google")}>
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>
      )}
      {providers.microsoft && (
        <button type="button" className="btn-outline w-full" disabled={busy !== null} onClick={() => go("microsoft")}>
          {busy === "microsoft" ? "Opening Microsoft…" : "Continue with Microsoft"}
        </button>
      )}
      <div className="flex items-center gap-3 text-[13px] text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-[#fbe9e6] px-3.5 py-2.5 text-sm text-[#9b2c1f]">
      {message}
    </p>
  );
}

export function SignInForm({ providers }: { providers: Providers }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setUnverified(false);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL: "/app",
    });
    setPending(false);
    if (!error) return router.push("/app");
    if (error.code === "ACCOUNT_SUSPENDED") return setError("This account is suspended. Contact support if you think this is a mistake.");
    if (error.code === "EMAIL_NOT_VERIFIED" || error.status === 403) {
      setUnverified(true);
      return setError("Please verify your email first. We've just sent you a new link.");
    }
    setError(error.status === 429 ? "Too many attempts. Wait a minute and try again." : "That email and password don't match an account.");
  }

  return (
    <div className="flex flex-col gap-5">
      <SocialButtons providers={providers} />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="you@company.com" />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="label">Password</label>
            <Link href="/forgot-password" className="text-[13px] text-brand hover:underline">Forgot password?</Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <ErrorText message={error} />
        {unverified && <p className="text-sm text-muted">Check your inbox (and spam) for the verification email.</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="text-center text-sm text-muted">
        New here? <Link href="/sign-up" className="font-semibold text-brand hover:underline">Create an account</Link>
      </p>
    </div>
  );
}

export function SignUpForm({ providers }: { providers: Providers }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 10) return setError("Use at least 10 characters for your password.");
    setPending(true);
    setError(null);
    const email = String(form.get("email"));
    const { error } = await authClient.signUp.email({ name: String(form.get("name")), email, password, callbackURL: "/app" });
    setPending(false);
    if (error) {
      return setError(
        error.code === "PASSWORD_COMPROMISED"
          ? "That password has appeared in a data breach. Please choose a different one."
          : error.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "We couldn't create that account. Check the details and try again.",
      );
    }
    router.push(`/check-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <SocialButtons providers={providers} />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" name="name" autoComplete="name" required className="input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="Use your work email to join your company" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className="input" placeholder="At least 10 characters" />
        </div>
        <ErrorText message={error} />
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      </form>
      <p className="text-center text-sm text-muted">
        Already have an account? <Link href="/" className="font-semibold text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    await authClient.requestPasswordReset({
      email: String(new FormData(e.currentTarget).get("email")),
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    setSent(true); // Same message whether or not the account exists.
  }
  if (sent) return <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm text-brand-dark">If an account uses that email, a reset link is on its way. It works once and expires in 1 hour.</p>;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" required className="input" />
      </div>
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(params.get("error") ? "This link is invalid or has expired. Request a new one." : null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const newPassword = String(new FormData(e.currentTarget).get("password"));
    if (newPassword.length < 10) return setError("Use at least 10 characters.");
    if (!token) return setError("This link is missing its token. Request a new one.");
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) return setError("This link is invalid or has expired. Request a new one.");
    router.push("/?reset=1");
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="label">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className="input" />
      </div>
      <ErrorText message={error} />
      <p className="text-sm text-muted">Changing your password signs you out on every device.</p>
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Set new password"}</button>
    </form>
  );
}
