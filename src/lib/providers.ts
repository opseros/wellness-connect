import "server-only";
import type { Providers } from "@/components/auth-forms";

/** Show a sign-in button only when that provider is configured. */
export function enabledProviders(): Providers {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  };
}
