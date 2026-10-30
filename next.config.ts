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
  experimental: {
    // Credential uploads go through server actions. Vercel caps request
    // bodies at 4.5 MB, so files are limited to 4 MB (src/lib/storage.ts).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
