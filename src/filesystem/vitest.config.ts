// Vitest config for the filesystem server. `npm test` runs the suite;
// `npm run coverage` runs it with v8 coverage and enforces the per-file gate
// from #4854: every source file at 90% or more on lines, statements,
// functions and branches. Code that genuinely cannot run under test carries a
// `/* v8 ignore ... -- <reason> */` hint at the source instead of a lower bar.
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
