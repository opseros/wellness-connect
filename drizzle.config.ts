import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Use Neon's DIRECT (non-pooled) connection string for migrations.
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
  strict: true,
});
