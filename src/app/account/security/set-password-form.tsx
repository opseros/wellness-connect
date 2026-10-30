"use client";
import { useActionState } from "react";
import { setPasswordAction } from "../actions";

export function SetPasswordForm() {
  const [result, action, pending] = useActionState(setPasswordAction, null);
  if (result === "ok") return <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm text-brand-dark">Password set. You can now also sign in with email and password.</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-muted">You signed up with Google or Microsoft. Add a password to sign in by email too, and to set up two-factor.</p>
      <label htmlFor="new-pw" className="label">New password</label>
      <input id="new-pw" name="password" type="password" minLength={10} required autoComplete="new-password" className="input max-w-sm" />
      {result && <p role="alert" className="text-sm text-[#9b2c1f]">{result}</p>}
      <button className="btn-outline self-start" disabled={pending}>{pending ? "Saving…" : "Set password"}</button>
    </form>
  );
}
