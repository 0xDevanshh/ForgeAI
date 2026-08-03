import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // bcrypt at cost 12 + real network round-trips to Neon on every case.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
