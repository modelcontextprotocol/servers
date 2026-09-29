// Table-driven tests for the shared npm-script reachability helpers. Each case
// pins a rule the inspector#1799 review took a round to get right — the comment names it.
// Run via `npm run test:scripts` (node:test; the root has no vitest harness).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reachableScripts,
  rootReachesScript,
  rootRunsClientValidate,
  tokenize,
} from "./npm-scripts.mjs";

test("tokenize: quoting (r17)", () => {
  const cases = [
    [
      "tsc --noEmit -p tsconfig.json",
      ["tsc", "--noEmit", "-p", "tsconfig.json"],
    ],
    [`tsc -p "tsconfig.test.json"`, ["tsc", "-p", "tsconfig.test.json"]],
    [`tsc -p 'tsconfig.test.json'`, ["tsc", "-p", "tsconfig.test.json"]],
    [
      `prettier --check "core/**/*.ts"`,
      ["prettier", "--check", "core/**/*.ts"],
    ],
    ["  spaced   out  ", ["spaced", "out"]],
    ["", []],
  ];
  for (const [input, expected] of cases)
    assert.deepEqual(tokenize(input), expected, input);
});

test("reachableScripts: follows `npm run` refs and pre/post hooks (r10)", () => {
  const scripts = {
    validate: "npm run lint && npm run build",
    lint: "eslint .",
    build: "tsc",
    prebuild: "echo pre", // implicit hook npm runs around `build`
    postbuild: "echo post",
    unrelated: "noop",
  };
  const reached = reachableScripts(scripts, "validate");
  assert.ok(reached.has("validate"));
  assert.ok(reached.has("lint"));
  assert.ok(reached.has("build"));
  assert.ok(reached.has("prebuild"), "pre<name> hook");
  assert.ok(reached.has("postbuild"), "post<name> hook");
  assert.ok(!reached.has("unrelated"));
});

test("reachableScripts: follows every npm spelling of `run` (inspector#2341)", () => {
  // `run-script` is the canonical command; `run`, `rum` and `urn` are its
  // aliases. A chain written in any of them reaches the same scripts, so a
  // guard that only followed `npm run` would let `npm run-script validate:web`
  // reintroduce what it exists to forbid (Copilot).
  const scripts = {
    gate: "npm run-script a && npm rum b && npm urn c && npm run d",
    a: "noop",
    b: "noop",
    c: "noop",
    d: "noop",
    e: "noop",
  };
  const reached = reachableScripts(scripts, "gate");
  for (const name of ["a", "b", "c", "d"])
    assert.ok(reached.has(name), `npm spelling reaching ${name}`);
  assert.ok(!reached.has("e"));
});

test("reachableScripts: a `prevalidate`-hosted typecheck is reachable (r10)", () => {
  const scripts = {
    validate: "npm run build && npm run test",
    prevalidate: "npm run typecheck",
    typecheck: "tsc --noEmit",
    build: "tsc",
    test: "vitest run",
  };
  assert.ok(reachableScripts(scripts, "validate").has("typecheck"));
});

test("rootRunsClientValidate: forms that count vs. don't", () => {
  // `cmd` lives in `vt`, reached from `validate` via `npm run vt`.
  const runs = (cmd) =>
    rootRunsClientValidate({ validate: "npm run vt", vt: cmd }, "clients/tui");
  // Counts:
  assert.ok(runs("cd clients/tui && npm run validate"), "plain cd");
  assert.ok(runs("cd ./clients/tui && npm run validate"), "leading ./ (r15)");
  assert.ok(runs(`cd "clients/tui" && npm run validate`), "quoted dir (r17)");
  assert.ok(
    runs(`cd clients/tui && npm run "validate"`),
    "quoted script name (r18)",
  );
  assert.ok(
    runs("cd clients/tui && npm run build && npm run validate"),
    "extra step",
  );
  assert.ok(runs("npm --prefix clients/tui run validate"), "--prefix (r19)");
  // Does NOT count:
  assert.ok(
    !runs("cd clients/tui-next && npm run validate"),
    "prefix-sibling must not match the shorter name (r16)",
  );
  assert.ok(
    !runs("cd clients/tui && npm run validate:fast"),
    "`run validate:fast` is a different script (r20)",
  );
  assert.ok(!runs("cd clients/tui && npm run build"), "no validate");
});

test("rootRunsClientValidate: only counts a reachable script (r5)", () => {
  // A cd-validate call in a script nothing reachable from `validate` runs must
  // NOT count — that's the whole reason the reachability restriction exists.
  assert.ok(
    !rootRunsClientValidate(
      {
        validate: "npm run something-else",
        orphan: "cd clients/tui && npm run validate",
      },
      "clients/tui",
    ),
    "orphan script isn't reachable from validate",
  );
  // Reached via one hop of indirection counts.
  assert.ok(
    rootRunsClientValidate(
      {
        validate: "npm run validate:tui",
        "validate:tui": "cd clients/tui && npm run validate",
      },
      "clients/tui",
    ),
    "reached via validate:tui",
  );
});

test("rootReachesScript: sibling-guard vouching", () => {
  const scripts = {
    validate: "npm run verify:format-coverage && npm run validate:web",
    "validate:web": "cd clients/web && npm run validate",
  };
  assert.ok(rootReachesScript(scripts, "verify:format-coverage"));
  assert.ok(rootReachesScript(scripts, "validate:web"));
  assert.ok(!rootReachesScript(scripts, "verify:typecheck-coverage"));
});
