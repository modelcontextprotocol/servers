// Vitest for the everything server. `npm run coverage` enforces the per-file
// coverage gate (#4854): every source file must reach 90% lines, statements,
// functions and branches on its own, so a well-tested file cannot carry an
// untested one. Code that genuinely cannot run is marked at the source with
// `/* v8 ignore ... -- <reason> */` rather than lowering these numbers.
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
