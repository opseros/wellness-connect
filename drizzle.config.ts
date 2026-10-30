import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Load .env.local / .env exactly the way Next.js does.
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
// `generate` works offline; commands that talk to the database need a URL.
const needsDb = process.argv.some((a) => ["migrate", "push", "pull", "studio", "check"].includes(a));
if (needsDb && !url) {
  throw new Error("Set DATABASE_URL (and ideally DATABASE_URL_UNPOOLED) in .env.local before running database commands.");
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Neon's DIRECT (non-pooled) connection string is preferred for migrations.
  dbCredentials: { url },
  strict: true,
});
