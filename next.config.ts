import type { NextConfig } from "next";

// Cache Components is off on purpose: almost every screen here is
// per-user and per-organization, so pages render dynamically and the
// codebase stays conventional. Revisit once public pages exist.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["@electric-sql/pglite"],
  images: {
    // Home page photos come from Unsplash (free Unsplash License) and are
    // resized and served from our own domain by Next.js image optimisation.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/photo-*" }],
    // 75 is the default; 90 keeps the full-width hero slider sharp.
    qualities: [75, 90],
  },
  experimental: {
    // Credential uploads go through server actions. Vercel caps request
    // bodies at 4.5 MB, so files are limited to 4 MB (src/lib/storage.ts).
    serverActions: { bodySizeLimit: "4.5mb" },
    // Reuse a page the browser rendered in the last 30 seconds (back/forward and
    // quick hops between tabs feel instant). Every save calls revalidatePath,
    // which clears this cache, so nobody sees their own change missing.
    // Full prefetches (menu links on hover, see IntentLink) are kept 30 seconds, not 5 minutes.
    staleTimes: { dynamic: 30, static: 30 },
  },
};

export default nextConfig;
