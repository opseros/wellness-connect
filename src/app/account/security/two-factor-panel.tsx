"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth-client";

type Step = { kind: "idle" } | { kind: "scan"; qr: string; secret: string; backupCodes: string[] } | { kind: "codes"; backupCodes: string[] };

export function TwoFactorPanel({ enabled, hasPassword }: { enabled: boolean; hasPassword: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasPassword) {
    return <p className="text-sm text-muted">Set a password first (above). Two-factor setup asks for it to confirm it&apos;s you.</p>;
  }

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { data, error } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (error || !data || !("totpURI" in data)) return setError("That password isn't right.");
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setStep({ kind: "scan", qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }), secret, backupCodes: data.backupCodes });
  }

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== "scan") return;
    setBusy(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (error) return setError("That code didn't match. Use the newest code from your app.");
    setStep({ kind: "codes", backupCodes: step.backupCodes });
  }

  async function disable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) return setError("That password isn't right.");
    router.refresh();
  }

  const err = error && <p role="alert" className="text-sm text-[#9b2c1f]">{error}</p>;

  if (step.kind === "codes") {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-dark">Two-factor is on.</p>
        <p className="text-sm">
          Save these backup codes somewhere safe. Each works once if you lose your phone. <strong>They won&apos;t be shown again.</strong>
        </p>
        <pre className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-ground p-4 font-mono text-sm">{step.backupCodes.map((c) => <span key={c}>{c}</span>)}</pre>
        <button className="btn-primary self-start" onClick={() => router.refresh()}>I&apos;ve saved them</button>
      </div>
    );
  }

  if (step.kind === "scan") {
    return (
      <form onSubmit={confirm} className="flex flex-col gap-3">
        <p className="text-sm">Scan this with Google Authenticator, Microsoft Authenticator or a similar app, then enter the 6-digit code.</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img src={step.qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded-lg border border-line" />
        <p className="text-[13px] text-muted">
          Can&apos;t scan? Enter this key: <code className="break-all font-mono text-ink">{step.secret}</code>
        </p>
        <label htmlFor="code" className="label">6-digit code</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="input max-w-48 tracking-[0.3em]" />
        {err}
        <button className="btn-primary self-start" disabled={busy}>{busy ? "Checking…" : "Turn on two-factor"}</button>
      </form>
    );
  }

  return enabled ? (
    <form onSubmit={disable} className="flex flex-col gap-3">
      <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-dark">Two-factor is on. You&apos;ll be asked for a code each time you sign in.</p>
      <label htmlFor="pw-off" className="label">Password to turn it off</label>
      <input id="pw-off" name="password" type="password" required autoComplete="current-password" className="input max-w-sm" />
      {err}
      <button className="btn-outline self-start" disabled={busy}>Turn off two-factor</button>
    </form>
  ) : (
    <form onSubmit={start} className="flex flex-col gap-3">
      <p className="text-sm text-muted">Adds a code from an authenticator app at sign-in. Required for platform staff.</p>
      <label htmlFor="pw-on" className="label">Confirm your password</label>
      <input id="pw-on" name="password" type="password" required autoComplete="current-password" className="input max-w-sm" />
      {err}
      <button className="btn-primary self-start" disabled={busy}>{busy ? "Starting…" : "Set up two-factor"}</button>
    </form>
  );
}
