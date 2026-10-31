"use client";
import { useState } from "react";
import { SignInForm, SignUpForm, type Providers } from "./auth-forms";

export type JoinRole = "member" | "pro";

/** Where a new account goes after verifying its email. */
export const NEXT_FOR: Record<JoinRole, string> = { member: "/connect/setup", pro: "/app/onboarding?as=pro" };

const ROLES: { key: JoinRole; title: string; line: string }[] = [
  { key: "member", title: "I want to connect", line: "Meet people, join spaces and meet-ups" },
  { key: "pro", title: "I'm a wellness professional", line: "Get verified and win work from companies" },
];

/** Role choice + join / sign-in in one card (home page and /sign-up). */
export function JoinPanel({
  providers,
  initialMode = "join",
  initialRole = "member",
  onRoleChange,
  showRoles = true,
}: {
  providers: Providers;
  initialMode?: "join" | "signin";
  initialRole?: JoinRole;
  onRoleChange?: (r: JoinRole) => void;
  showRoles?: boolean;
}) {
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState<JoinRole>(initialRole);
  const pick = (r: JoinRole) => {
    setRole(r);
    onRoleChange?.(r);
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[26px] font-bold tracking-tight">{mode === "join" ? (role === "pro" ? "Join as a professional" : "Join Connect free") : "Welcome back"}</h2>
        <p className="text-[14.5px] text-muted">{mode === "join" ? (role === "pro" ? "Create your account, then your profile and services." : "Create your account in a minute. Always free.") : "Sign in to your feed, messages and bookings."}</p>
      </div>
      {mode === "join" && showRoles && (
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">How will you use it?</legend>
          {ROLES.map((r) => (
            <label
              key={r.key}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3 text-left has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${role === r.key ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-[#c9d1cc]"}`}
            >
              <input type="radio" name="join-role" value={r.key} checked={role === r.key} onChange={() => pick(r.key)} className="sr-only" />
              <span className="text-[14px] font-bold leading-snug">{r.title}</span>
              <span className="text-[12.5px] leading-snug text-muted">{r.line}</span>
            </label>
          ))}
        </fieldset>
      )}
      {mode === "join" ? (
        <SignUpForm key={role} providers={providers} next={NEXT_FOR[role]} onSwitch={() => setMode("signin")} />
      ) : (
        <SignInForm providers={providers} onSwitch={() => setMode("join")} />
      )}
    </div>
  );
}
