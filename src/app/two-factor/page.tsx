"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

export default function TwoFactorPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const { error } = await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
    if (error) return setError("That code didn't work. Try the newest code from your authenticator app.");
    router.push("/app");
  }
  return (
    <AuthShell title="Two-factor check" subtitle="Enter the 6-digit code from your authenticator app.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label htmlFor="code" className="label">Code</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="input tracking-[0.3em]" />
        {error && <p role="alert" className="text-sm text-[#9b2c1f]">{error}</p>}
        <button className="btn-primary w-full">Verify</button>
      </form>
    </AuthShell>
  );
}
