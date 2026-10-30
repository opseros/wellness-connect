import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { onUserCreated, onEmailVerified } from "@/modules/identity/hooks";

function socialProviders(): BetterAuthOptions["socialProviders"] {
  const providers: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      prompt: "select_account",
    };
  }
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    providers.microsoft = {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      // "common" = any work/school account plus personal Microsoft accounts.
      tenantId: process.env.MICROSOFT_TENANT_ID ?? "common",
      prompt: "select_account",
    };
  }
  return providers;
}

function trustedOrigins(): string[] {
  const origins = [process.env.BETTER_AUTH_URL, process.env.NEXT_PUBLIC_APP_URL];
  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`);
  return origins.filter((o): o is string => Boolean(o));
}

function buildAuth() {
  const isProd = process.env.NODE_ENV === "production";
  return betterAuth({
    appName: "Wellness Connect",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      transaction: true,
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
        twoFactor: schema.twoFactor,
      },
    }),
    advanced: { database: { generateId: "uuid" } },
    user: {
      additionalFields: {
        // input: false means sign-up and profile-update requests cannot set it.
        platformRole: { type: "string", required: false, defaultValue: "user", input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Reset your Wellness Connect password",
          text: `Use this link to choose a new password. It works once and expires in 1 hour:\n\n${url}\n\nIf you didn't ask for this, ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Verify your email for Wellness Connect",
          text: `Confirm your email address to finish setting up your account:\n\n${url}`,
        });
      },
      afterEmailVerification: async (user) => {
        await onEmailVerified({ id: user.id, email: user.email });
      },
    },
    socialProviders: socialProviders(),
    account: {
      accountLinking: {
        enabled: true,
        // Link Google/Microsoft to an existing account only when the provider
        // vouches for the email (and the local email is already verified).
        trustedProviders: ["google", "microsoft"],
        allowDifferentEmails: false,
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await onUserCreated({ id: user.id, email: user.email, emailVerified: user.emailVerified });
          },
        },
      },
    },
    rateLimit: {
      enabled: isProd || process.env.AUTH_RATE_LIMIT === "on",
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
      },
    },
    plugins: [
      twoFactor({ issuer: "Wellness Connect" }),
      ...(isProd && process.env.DISABLE_PWNED_CHECK !== "1" ? [haveIBeenPwned()] : []),
      nextCookies(), // must stay last
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;
let authInstance: Auth | undefined;

/** Lazy so builds and tests don't need a database at import time. */
export function getAuth(): Auth {
  authInstance ??= buildAuth();
  return authInstance;
}

/** Tests rebuild auth after swapping the database. */
export function resetAuthForTesting() {
  authInstance = undefined;
}
