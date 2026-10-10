import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["**/*.ts"],
      exclude: ["**/__tests__/**", "**/dist/**"],
      // The #4854 gate: every file at >= 90 on all four dimensions. Code that
      // genuinely cannot run in-process carries a reasoned `v8 ignore` at the
      // source instead of a lower threshold here.
      thresholds: {
        perFile: true,
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
