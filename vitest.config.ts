import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/bun-sqlite.d.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 65, functions: 75, branches: 50 },
    },
  },
});
