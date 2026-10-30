"use client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    // Runs outside React (inside the auth client), so a full navigation is intended here.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    twoFactorClient({ onTwoFactorRedirect: () => window.location.assign("/two-factor") })],
});
