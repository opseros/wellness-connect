import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
    },
  },
});
