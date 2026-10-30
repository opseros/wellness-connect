import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { getCurrentUser } from "@/modules/identity/session";
import { listMySessions, listMySignInMethods } from "@/modules/identity/account";
import { revokeOtherSessionsAction, revokeSessionAction } from "../actions";
import { TwoFactorPanel } from "./two-factor-panel";
import { SetPasswordForm } from "./set-password-form";
import { getOwnProfile } from "@/modules/professionals/service";

export const metadata: Metadata = { title: "Account security" };

const methodLabel: Record<string, string> = { credential: "Email and password", google: "Google", microsoft: "Microsoft" };
const when = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ need2fa?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect("/check-email");
  const [{ need2fa }, sessions, methods, pro] = await Promise.all([searchParams, listMySessions(me.id), listMySignInMethods(me.id), getOwnProfile(me.id)]);
  const hasPassword = methods.some((m) => m.providerId === "credential");
  const isStaff = me.platformRole !== "user";

  return (
    <div>
      <AppHeader
        name={me.name}
        nav={mainNav(me, "account", { professional: Boolean(pro) })}
      />
      <main className="mx-auto flex max-w-[820px] flex-col gap-5 px-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold">Account security</h1>
          <p className="text-[15px] text-muted">{me.email}</p>
        </div>

        {need2fa && isStaff && !me.twoFactorEnabled && (
          <p role="status" className="rounded-xl bg-[#fbf0dc] px-5 py-4 text-[15px] text-[#7a4b00]">
            Admin tools need two-factor authentication. Turn it on below, then open Admin again.
          </p>
        )}

        <section className="card flex flex-col gap-3 p-6">
          <h2 className="text-lg font-bold">Sign-in methods</h2>
          <ul className="flex flex-wrap gap-2">
            {methods.map((m) => (
              <li key={m.providerId} className="rounded-full bg-ground px-3 py-1.5 text-sm font-semibold">{methodLabel[m.providerId] ?? m.providerId}</li>
            ))}
          </ul>
          {!hasPassword && <SetPasswordForm />}
        </section>

        <section className="card flex flex-col gap-3 p-6">
          <h2 className="text-lg font-bold">Two-factor authentication</h2>
          <TwoFactorPanel enabled={me.twoFactorEnabled} hasPassword={hasPassword} />
        </section>

        <section className="card flex flex-col gap-3 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Where you&apos;re signed in</h2>
            {sessions.length > 1 && (
              <form action={revokeOtherSessionsAction}>
                <button className="text-sm font-semibold text-brand hover:underline">Sign out everywhere else</button>
              </form>
            )}
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="flex flex-col">
                  <span className="font-semibold">
                    {device(s.userAgent)} {s.id === me.sessionId && <span className="ml-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-dark">This device</span>}
                  </span>
                  <span className="text-[13px] text-muted">Last active {when(s.updatedAt)}{s.ipAddress ? ` · ${s.ipAddress}` : ""}</span>
                </span>
                {s.id !== me.sessionId && (
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <button className="btn-outline min-h-9 px-3 text-sm">Sign out</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
