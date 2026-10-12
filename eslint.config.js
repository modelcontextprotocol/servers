import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// The one ESLint config for the whole repo (#4864). Every TypeScript workspace
// under `src/*` lints against it (each workspace's `lint` is `eslint .`, and
// ESLint finds this file by walking up), and the root's `lint:root` lints the
// root tooling with it. There is deliberately no per-workspace config: a second
// config is a second place for a rule to be weakened.
//
// Every `lint` script runs with `--max-warnings 0`, so a warning fails the gate
// exactly as an error does — severity here is for the editor, not the gate. A
// rule meant to be enforced is set to `error` so the squiggle reads right too.
//
// Findings are fixed, never silenced through this file: no rule is turned off
// and no first-party path is ignored to make `lint` pass. An inline disable is
// the only waiver, and it carries a one-line justification.

// A leading `_` is the explicit "intentionally unused" marker — an
// interface-conformance parameter, a destructuring-rest omission. Honor it
// rather than deleting the signal.
const unusedVars = {
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
};

export default defineConfig([
  // Build output and installs are never a gate target: a bundle or a `.d.ts`
  // tsc wrote is not first-party source, and a finding inside one names a
  // defect nobody here can fix. When a build starts writing somewhere new, add
  // that location here in the same change.
  globalIgnores(["**/dist/**", "**/coverage/**", "**/node_modules/**"]),
  {
    // The TypeScript servers. Type-aware, because the rule that matters most
    // here — `no-floating-promises` — needs type information.
    //
    // The parser project is each workspace's `tsconfig.test.json`, not its
    // `tsconfig.json`: the build config excludes the tests (so `tsc` does not
    // emit them into `dist/`), and a parser project must literally contain
    // every file it is asked to lint. `tsconfig.test.json` covers the whole
    // workspace, and it is also the program `typecheck` runs, so the file set
    // that is linted and the one that is typechecked cannot drift apart. The
    // glob picks up a new workspace with no edit here.
    files: ["src/*/**/*.{ts,mts,cts}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
      parserOptions: {
        project: ["./src/*/tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...unusedVars,
      // The class this catches is invisible at review time: a floated call
      // reads like an awaited one minus four characters, and the rejection it
      // drops surfaces somewhere else entirely, or not at all. Every promise is
      // awaited, returned, ended with `.catch(…)`, or discarded with `void`
      // plus a comment saying why the caller cannot hold it.
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    // Root tooling: the guard scripts and this config. Plain JavaScript that
    // no tsconfig contains, so it gets the non-type-aware rules — asking the
    // parser for a project would fail these files outright rather than lint
    // them.
    files: ["scripts/**/*.{js,mjs,cjs}", "*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
