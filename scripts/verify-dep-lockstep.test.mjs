// Tests for `verify-dep-lockstep.mjs` (#4864): the pure rule, the sibling
// vouch, and the guard against the repository as it stands. Run via
// `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHARED_DEV_DEPENDENCIES,
  lockstepProblems,
} from "./verify-dep-lockstep.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

test("lockstep: one range everywhere passes", () => {
  assert.deepEqual(
    lockstepProblems([
      { dir: ".", pkg: {} },
      { dir: "src/a", pkg: { devDependencies: { typescript: "^5.8.2" } } },
      { dir: "src/b", pkg: { devDependencies: { typescript: "^5.8.2" } } },
    ]),
    [],
  );
});

test("lockstep: declared only once (hoisted to the root) passes", () => {
  assert.deepEqual(
    lockstepProblems([
      { dir: ".", pkg: { devDependencies: { prettier: "3.8.4" } } },
      { dir: "src/a", pkg: {} },
    ]),
    [],
  );
});

test("lockstep: a divergent range fails, naming every declaration", () => {
  const problems = lockstepProblems([
    { dir: ".", pkg: {} },
    { dir: "src/a", pkg: { devDependencies: { typescript: "^5.6.2" } } },
    { dir: "src/b", pkg: { devDependencies: { typescript: "^5.8.2" } } },
    { dir: "src/c", pkg: { devDependencies: { typescript: "^5.8.2" } } },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /`typescript` is declared with 2 different ranges/);
  assert.match(problems[0], /\^5\.6\.2: src\/a \(devDependencies\)/);
  assert.match(
    problems[0],
    /\^5\.8\.2: src\/b \(devDependencies\), src\/c \(devDependencies\)/,
  );
});

test("lockstep: the root counts, and so does every dependency section", () => {
  // A root pin that disagrees with a workspace is the same drift, and moving a
  // range to `dependencies` does not hide it.
  const problems = lockstepProblems([
    { dir: ".", pkg: { devDependencies: { prettier: "3.8.4" } } },
    { dir: "src/a", pkg: { dependencies: { prettier: "^2.8.8" } } },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/a \(dependencies\)/);
  assert.match(
    lockstepProblems([
      { dir: "a", pkg: { optionalDependencies: { vitest: "^4.1.8" } } },
      { dir: "b", pkg: { devDependencies: { vitest: "^4.0.0" } } },
    ])[0],
    /`vitest`/,
  );
});

test("lockstep: peer ranges and packages outside the shared set are not compared", () => {
  assert.deepEqual(
    lockstepProblems([
      { dir: "a", pkg: { peerDependencies: { typescript: ">=4" } } },
      { dir: "b", pkg: { devDependencies: { typescript: "^5.8.2" } } },
      { dir: "a", pkg: { devDependencies: { zod: "^3" } } },
      { dir: "b", pkg: { devDependencies: { zod: "^4" } } },
    ]),
    [],
  );
});

test("lockstep: the shared set is the one §2.3 names", () => {
  assert.deepEqual(
    [...SHARED_DEV_DEPENDENCIES].sort(),
    [
      "@types/node",
      "@vitest/coverage-v8",
      "prettier",
      "typescript",
      "vitest",
    ].sort(),
  );
});

/** Run the real guard in a throwaway repo; `files` maps paths to JSON. */
function runGuard(rootPkg, files = {}) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "dep-lockstep-")));
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify(rootPkg));
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), JSON.stringify(content));
    }
    mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
    for (const rel of [
      "verify-dep-lockstep.mjs",
      path.join("lib", "npm-scripts.mjs"),
      path.join("lib", "workspaces.mjs"),
    ])
      cpSync(path.join(scriptsDir, rel), path.join(dir, "scripts", rel));
    const r = spawnSync(
      process.execPath,
      [path.join(dir, "scripts", "verify-dep-lockstep.mjs")],
      { cwd: dir, encoding: "utf8" },
    );
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const WIRED = {
  validate: "npm run verify:format-coverage && npm run verify:dep-lockstep",
  "verify:format-coverage": "node scripts/verify-format-coverage.mjs",
  "verify:dep-lockstep": "node scripts/verify-dep-lockstep.mjs",
};

test("guard: reads every workspace manifest and fails on drift", () => {
  const { status, out } = runGuard(
    { workspaces: ["src/*"], scripts: WIRED },
    {
      "src/a/package.json": { devDependencies: { typescript: "^5.6.2" } },
      "src/b/package.json": { devDependencies: { typescript: "^5.8.2" } },
    },
  );
  assert.equal(status, 1, out);
  assert.match(out, /1 shared toolchain package\(s\) are not in lockstep/);
});

test("guard: passes when aligned", () => {
  const { status, out } = runGuard(
    { workspaces: ["src/*"], scripts: WIRED },
    {
      "src/a/package.json": { devDependencies: { typescript: "^5.8.2" } },
      "src/b/package.json": { devDependencies: { typescript: "^5.8.2" } },
    },
  );
  assert.equal(status, 0, out);
  assert.match(out, /OK: 5 shared toolchain packages are in lockstep across 3/);
});

test("guard: vouches for verify:format-coverage", () => {
  const { status, out } = runGuard({
    workspaces: ["src/*"],
    scripts: { ...WIRED, validate: "npm run verify:dep-lockstep" },
  });
  assert.equal(status, 1, out);
  assert.match(out, /no longer runs `verify:format-coverage`/);
});

test("guard: a root manifest with no workspaces fails loudly", () => {
  const { status, out } = runGuard({ scripts: WIRED });
  assert.equal(status, 1, out);
  assert.match(out, /declares no `workspaces`/);
});
