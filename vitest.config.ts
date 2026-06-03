import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/rls/**/*.test.ts"],
    globalSetup: ["tests/rls/global-setup.ts"],
    sequence: { concurrent: false },
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      // dotenv loaded in db.ts — vitest doesn't auto-load .env.test
    },
  },
});
