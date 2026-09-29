// Tests for `workspaces.mjs` (#4864): which workspaces the root gate covers,
// and whether the root `validate` still runs each one. One case per rule.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { rootRunsWorkspaceValidate, workspaceDirs } from "./workspaces.mjs";

const runs = (validate, dir = "src/a", extra = {}) =>
  rootRunsWorkspaceValidate({ validate, ...extra }, dir);

test("rootRunsWorkspaceValidate: the aggregate form covers every workspace", () => {
  assert.ok(runs("npm run validate --workspaces"));
  assert.ok(runs("npm run validate -ws", "src/b"));
  assert.ok(runs("npm run-script validate --workspaces"));
  assert.ok(runs("npm run guards && npm run validate --workspaces"));
});

test("rootRunsWorkspaceValidate: the per-workspace forms cover only their own dir", () => {
  for (const cmd of [
    "npm run validate --workspace src/a",
    "npm run validate --workspace=src/a",
    "npm run validate -w src/a",
    "npm run validate -w ./src/a/",
    "cd src/a && npm run validate",
    "cd ./src/a && npm run validate",
    "npm --prefix src/a run validate",
  ]) {
    assert.ok(runs(cmd), cmd);
    assert.ok(!runs(cmd, "src/b"), `${cmd} must not vouch for src/b`);
  }
});

test("rootRunsWorkspaceValidate: a prefix-sibling dir does not count", () => {
  assert.ok(!runs("npm run validate -w src/a-next"));
  assert.ok(!runs("cd src/a-next && npm run validate"));
});

test("rootRunsWorkspaceValidate: --if-present is refused (it skips a workspace with no validate)", () => {
  assert.ok(!runs("npm run validate --workspaces --if-present"));
  assert.ok(!runs("npm run validate --if-present -w src/a"));
});

test("rootRunsWorkspaceValidate: another script name is not validate", () => {
  assert.ok(!runs("npm run validate:fast --workspaces"));
  assert.ok(!runs("npm run check --workspaces"));
});

test("rootRunsWorkspaceValidate: a mention or a masked failure is not an invocation", () => {
  assert.ok(!runs("echo npm run validate --workspaces"));
  assert.ok(!runs("npm run validate --workspaces || true"));
  assert.ok(!runs("true || npm run validate --workspaces"));
});

test("rootRunsWorkspaceValidate: follows delegation and lifecycle hooks", () => {
  assert.ok(
    runs("npm run validate:ts", "src/a", {
      "validate:ts": "npm run validate --workspaces",
    }),
  );
  assert.ok(
    runs("npm run guards", "src/a", {
      postvalidate: "npm run validate -w src/a",
    }),
  );
});

test("rootRunsWorkspaceValidate: a cd holds only within its own script body", () => {
  // `cd` then a delegated script: npm starts the delegate from the root again,
  // so the delegate's bare `npm run validate` is the ROOT's validate.
  assert.ok(
    !runs("cd src/a && npm run other", "src/a", {
      other: "npm run validate",
    }),
  );
  // Workspace flags are resolved from the workspace root, so under a `cd`
  // they are not the root's aggregate.
  assert.ok(!runs("cd src/b && npm run validate -w src/a"));
});

test("rootRunsWorkspaceValidate: nothing reachable, nothing run", () => {
  assert.ok(!rootRunsWorkspaceValidate({}, "src/a"));
  assert.ok(!rootRunsWorkspaceValidate(undefined, "src/a"));
});

function fixture(layout) {
  const dir = mkdtempSync(path.join(tmpdir(), "workspaces-"));
  for (const [rel, withManifest] of Object.entries(layout)) {
    mkdirSync(path.join(dir, rel), { recursive: true });
    if (withManifest) writeFileSync(path.join(dir, rel, "package.json"), "{}");
  }
  return dir;
}

test("workspaceDirs: expands a trailing /* and a plain dir, flags missing manifests", () => {
  const dir = fixture({
    "src/a": true,
    "src/b": false,
    "src/node_modules": false,
    tools: true,
  });
  try {
    assert.deepEqual(workspaceDirs(dir, ["src/*", "tools", "./missing"]), [
      { dir: "src/a", hasManifest: true },
      { dir: "src/b", hasManifest: false },
      { dir: "tools", hasManifest: true },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("workspaceDirs: a pattern it cannot read fails loudly instead of matching nothing", () => {
  assert.throws(() => workspaceDirs("/nowhere", ["src/**"]), /unsupported/);
  assert.throws(
    () => workspaceDirs("/nowhere", ["packages/*/x"]),
    /unsupported/,
  );
  assert.throws(() => workspaceDirs("/nowhere", [{}]), /unsupported/);
  assert.throws(() => workspaceDirs("/nowhere", []), /no `workspaces`/);
  assert.throws(() => workspaceDirs("/nowhere", undefined), /no `workspaces`/);
});
