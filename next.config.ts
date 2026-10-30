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
};

export default nextConfig;
