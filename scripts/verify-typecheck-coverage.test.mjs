// Table-driven tests for verify-typecheck-coverage's pure parsers, ported from
// the MCP Inspector for #4864. Importing the module exposes these without
// running the guard (its execution is behind `main()`, called only when the
// file is run directly). Each case pins a rule an Inspector review round
// (inspector#1799, `rN`) found; the `tsc`-script and tsconfig-graph parsers
// are tested in `lib/tsc-program.test.mjs`. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesTestGlob,
  isRequiredSource,
  integrityAdvice,
  isScriptsTestFile,
  testScriptGlobs,
  testScriptNarrowingFlags,
  testScriptProblems,
  tscBuildStatus,
} from "./verify-typecheck-coverage.mjs";

test("isRequiredSource: TS extensions, ambient .d.ts excluded (r7)", () => {
  for (const f of ["a.ts", "a.tsx", "a.mts", "a.cts"])
    assert.ok(isRequiredSource(f), f);
  for (const f of ["a.js", "a.d.ts", "a.d.mts", "a.d.cts", "a.json"])
    assert.ok(!isRequiredSource(f), f);
});

test("tscBuildStatus: ok / neutered / none (r25)", () => {
  const status = (build) =>
    tscBuildStatus({ validate: "npm run build", build });
  assert.equal(status("tsc -b && vite build"), "ok");
  assert.equal(status("tsc --build"), "ok");
  assert.equal(status("tsc -b --noCheck && vite build"), "neutered");
  assert.equal(status("vite build"), "none");
  assert.equal(status("tsc --noEmit -p tsconfig.json"), "none"); // -b required
});

test("matchesTestGlob: the guard's contract, not node's glob engine", () => {
  // Only the two properties the guard actually relies on — the rest of node's
  // glob semantics are node's to test, which is the point of delegating to it.
  const g = "scripts/**/*.test.mjs";
  assert.ok(matchesTestGlob("scripts/verify-typecheck-coverage.test.mjs", g)); // zero-depth **
  assert.ok(matchesTestGlob("scripts/lib/npm-scripts.test.mjs", g)); // nested
  assert.ok(!matchesTestGlob("scripts/lib/npm-scripts.spec.mjs", g)); // the probe-B rename
});

test("testScriptGlobs: harvests across delegation (r31 finding 1 / r32 finding 2)", () => {
  // Direct form — the glob itself, with `node` and flags dropped.
  assert.deepEqual(
    testScriptGlobs({ "test:scripts": 'node --test "scripts/**/*.test.mjs"' }),
    ["scripts/**/*.test.mjs"],
  );
  // Delegating form — BOTH child globs, not the literal npm/run/<name> tokens.
  const delegating = testScriptGlobs({
    "test:scripts": "npm run test:scripts:lib && npm run test:scripts:guard",
    "test:scripts:lib": 'node --test "scripts/lib/**/*.test.mjs"',
    "test:scripts:guard": 'node --test "scripts/*.test.mjs"',
  });
  assert.ok(delegating.includes("scripts/lib/**/*.test.mjs"));
  assert.ok(delegating.includes("scripts/*.test.mjs"));
  // A pre<name> hook is reached too (npm runs it implicitly).
  assert.ok(
    testScriptGlobs({
      "test:scripts": "node --test scripts/a.test.mjs",
      "pretest:scripts": "node --test scripts/b.test.mjs",
    }).includes("scripts/b.test.mjs"),
  );
  // An unreachable script contributes nothing.
  assert.deepEqual(
    testScriptGlobs({
      "test:scripts": "node --test scripts/a.test.mjs",
      other: "node --test scripts/z.test.mjs",
    }),
    ["scripts/a.test.mjs"],
  );
});

test("testScriptGlobs: only `node --test` segments contribute (r33 finding 1)", () => {
  // A reachable NON-runner command's glob must not be attributed to the runner:
  // `scripts/**/*.mjs` matches a renamed `*.spec.mjs`, so harvesting it would
  // make the probe-B rename pass while `node --test` silently ran 6 fewer tests.
  assert.deepEqual(
    testScriptGlobs({
      "test:scripts": 'node --test "scripts/**/*.test.mjs"',
      "pretest:scripts": 'prettier --check "scripts/**/*.mjs"',
    }),
    ["scripts/**/*.test.mjs"],
  );
  // Same within one command: only the `--test` segment's args are harvested.
  assert.deepEqual(
    testScriptGlobs({
      "test:scripts":
        'prettier --check "scripts/**/*.mjs" && node --test "scripts/**/*.test.mjs"',
    }),
    ["scripts/**/*.test.mjs"],
  );
});

test("testScriptGlobs: flag values and ./ prefixes (r34 findings 1 & 2)", () => {
  // A glob-valued `--test-*` flag is NOT a positional arg. `scripts/**/*.mjs`
  // matches a renamed `*.spec.mjs`, so harvesting it would vouch for the very
  // file the runner skips — the r33 suppression one level in.
  assert.deepEqual(
    testScriptGlobs({
      "test:scripts":
        'node --test --experimental-test-coverage --test-coverage-include "scripts/**/*.mjs" "scripts/**/*.test.mjs"',
    }),
    ["scripts/**/*.test.mjs"],
  );
  // A leading `./` is normalized off — `node --test` accepts it, `git ls-files`
  // never emits it, so keeping it would blame every file for a rename that
  // never happened.
  assert.deepEqual(
    testScriptGlobs({
      "test:scripts": 'node --test "./scripts/**/*.test.mjs"',
    }),
    ["scripts/**/*.test.mjs"],
  );
  // …and the normalized glob really does match what `git ls-files` emits.
  assert.ok(
    testScriptProblems(
      {
        validate: "npm run test:scripts",
        "test:scripts": 'node --test "./scripts/**/*.test.mjs"',
      },
      ["scripts/lib/npm-scripts.test.mjs"],
    ).length === 0,
  );
});

test("testScriptGlobs: empty when no glob is named (r33 finding 2)", () => {
  // The condition the "`test:scripts` names no path/glob" branch keys off — a
  // bare `node --test` auto-discovers, so the guard can't tell what it runs.
  assert.deepEqual(testScriptGlobs({ "test:scripts": "node --test" }), []);
  assert.deepEqual(testScriptGlobs({}), []);
});

test("testScriptProblems: all three axes (r33 finding 2)", () => {
  const WIRED = {
    validate: "npm run test:scripts",
    "test:scripts": 'node --test "scripts/**/*.test.mjs"',
  };
  const only = (p) => (assert.equal(p.length, 1, p.join("\n")), p[0]);

  // Green: wired, non-empty, every file glob-matched.
  assert.deepEqual(testScriptProblems(WIRED, ["scripts/a.test.mjs"]), []);

  // Axis 1 — not reachable from `validate`. Reported alone: with the tests
  // unrun, the other two axes are moot.
  assert.match(
    only(
      testScriptProblems(
        { validate: "echo hi", "test:scripts": WIRED["test:scripts"] },
        ["scripts/a.test.mjs"],
      ),
    ),
    /no longer runs `test:scripts`/,
  );

  // Axis 2 — no tracked test files at all.
  assert.match(
    only(testScriptProblems(WIRED, [])),
    /no `scripts\/\*\*\/\*\.test\.\*` files are tracked/,
  );

  // Axis 3 — a file `node --test` would skip (the probe-B rename).
  assert.match(
    only(testScriptProblems(WIRED, ["scripts/a.spec.mjs"])),
    /^scripts\/a\.spec\.mjs: not matched by the `test:scripts` glob/,
  );

  // The empty-harvest branch: ONE message naming the real problem, not one
  // unfollowable blame per file. (`if (false)`-mutating it yields 2 messages.)
  assert.match(
    only(
      testScriptProblems(
        { validate: "npm run test:scripts", "test:scripts": "node --test" },
        ["scripts/a.test.mjs", "scripts/b.test.mjs"],
      ),
    ),
    /names no path\/glob/,
  );
});

test("isScriptsTestFile: discovery by content, not name (r36 finding 1)", () => {
  const TEST_SRC = 'import { test } from "node:test";\ntest("x", () => {});\n';
  // The name is irrelevant — a dot→hyphen rename escapes every name pattern,
  // and that is exactly the rename that silently dropped 6 of 24 tests.
  assert.ok(isScriptsTestFile("scripts/lib/npm-scripts.test.mjs", TEST_SRC));
  assert.ok(isScriptsTestFile("scripts/lib/npm-scripts-test.mjs", TEST_SRC));
  assert.ok(isScriptsTestFile("scripts/tokenize-tests.mjs", TEST_SRC));
  assert.ok(isScriptsTestFile("scripts/a.test.js", TEST_SRC));
  assert.ok(
    isScriptsTestFile(
      "scripts/a.test.cjs",
      "const { test } = require('node:test');\ntest('x', () => {});\n",
    ),
  );
  // A shared helper importing `node:test`'s `mock` registers no tests — telling
  // it to rename itself to `*.test.mjs` would make node run an empty file.
  assert.ok(
    !isScriptsTestFile(
      "scripts/lib/test-mocks.mjs",
      'import { mock } from "node:test";\nexport const resetAll = () => mock.reset();\n',
    ),
  );
  // A guard script that merely mentions testing is not a test.
  assert.ok(
    !isScriptsTestFile(
      "scripts/verify-typecheck-coverage.mjs",
      "// runs the test:scripts glob\nimport path from 'node:path';\n",
    ),
  );
  // Non-JS never counts, whatever it contains.
  assert.ok(!isScriptsTestFile("scripts/notes.md", TEST_SRC));
  assert.ok(!isScriptsTestFile("scripts/a.test.ts", TEST_SRC));
});

test("testScriptNarrowingFlags: flags that shrink the run (r35 finding 1)", () => {
  const flags = (cmd) => testScriptNarrowingFlags({ "test:scripts": cmd });
  const GLOB = '"scripts/**/*.test.mjs"';
  // `--test-shard 1/2` keeps every glob intact and runs half the suite, exit 0.
  assert.deepEqual(flags(`node --test --test-shard 1/2 ${GLOB}`), [
    "--test-shard",
  ]);
  assert.deepEqual(flags(`node --test --test-only ${GLOB}`), ["--test-only"]);
  assert.deepEqual(flags(`node --test --test-name-pattern zzz ${GLOB}`), [
    "--test-name-pattern",
  ]);
  assert.deepEqual(flags(`node --test --test-skip-pattern=zzz ${GLOB}`), [
    "--test-skip-pattern",
  ]); // `=` form
  // Not narrowing: the plain form, and a coverage flag that only reports.
  assert.deepEqual(flags(`node --test ${GLOB}`), []);
  assert.deepEqual(
    flags(
      `node --test --experimental-test-coverage --test-coverage-include "scripts/**/*.mjs" ${GLOB}`,
    ),
    [],
  );
  // A narrowing flag on a NON-runner segment isn't the runner's (r33 gate).
  assert.deepEqual(
    testScriptNarrowingFlags({
      "test:scripts": `node --test ${GLOB}`,
      "pretest:scripts": "some-tool --test-only",
    }),
    [],
  );
  // Reported as a gate-integrity problem, with the globs still harvested.
  const wired = {
    validate: "npm run test:scripts",
    "test:scripts": `node --test --test-shard 1/2 ${GLOB}`,
  };
  assert.deepEqual(testScriptGlobs(wired), ["scripts/**/*.test.mjs"]);
  const problems = testScriptProblems(wired, ["scripts/a.test.mjs"]);
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /--test-shard.*runs only part of the matched suite/,
  );
});

test("integrityAdvice: typecheck footer only for typecheck issues (r35 finding 2 / nit 3)", () => {
  const TYPECHECK =
    "src/memory: the root `validate` chain no longer runs its `validate` …";
  const SIBLING =
    "the root `validate` no longer runs `verify:format-coverage` …";
  const TESTS = "scripts/a.spec.mjs: not matched by the `test:scripts` glob …";
  // Only typecheck-wiring issues → advise.
  assert.match(
    integrityAdvice([TYPECHECK], []),
    /Restore the `typecheck` wiring/,
  );
  // Every issue is a non-typecheck one → stay silent. The sibling-guard vouch
  // and client-enrollment problems count here too, not just `test:scripts`.
  assert.equal(integrityAdvice([TESTS], [TESTS]), null);
  assert.equal(integrityAdvice([SIBLING], [SIBLING]), null);
  assert.equal(integrityAdvice([SIBLING, TESTS], [SIBLING, TESTS]), null);
  // Client enrollment ("declares no `typecheck` script …") IS about the
  // typecheck pass — the footer's first clause is its fix — so it advises.
  const ENROLLMENT =
    "src/time: declares no `typecheck` script, has no `tsconfig.json` `references` …";
  assert.match(
    integrityAdvice([ENROLLMENT], [SIBLING, TESTS]),
    /Restore the `typecheck` wiring/,
  );
  // A mix still advises — the typecheck issue is real.
  assert.match(
    integrityAdvice([SIBLING, TYPECHECK, TESTS], [SIBLING, TESTS]),
    /Restore the `typecheck` wiring/,
  );
});
