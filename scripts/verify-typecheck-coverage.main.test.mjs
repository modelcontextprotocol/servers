// End-to-end tests for `verify-typecheck-coverage` (#4864), run against
// throwaway repos. Ported from the MCP Inspector, where the first case pins
// inspector#1939's "doubly silent" failure: when the tsc entry cannot be
// resolved (a missing install), the guard must hard-fail with an actionable
// "cannot measure" error — NOT echo "(no diagnostic captured)" per project and
// then report every tracked file as getting no tsc pass. The rest pin this
// repo's workspace layout: the root `validate --workspaces` link, a workspace
// with no `typecheck`, and a test file the build config leaves out.
//
// Fixtures that need a real tsc run from a temp dir INSIDE this repo, so
// `typescript` resolves by walking up to the repo's own install exactly as it
// does for a real workspace. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");

const ROOT_SCRIPTS = {
  validate:
    "npm run verify:format-coverage && npm run verify:typecheck-coverage && npm run test:scripts && npm run validate --workspaces",
  "verify:format-coverage": "node scripts/verify-format-coverage.mjs",
  "verify:typecheck-coverage": "node scripts/verify-typecheck-coverage.mjs",
  "test:scripts": 'node --test "scripts/**/*.test.mjs"',
};

const WORKSPACE = {
  name: "fixture-server",
  scripts: {
    validate: "npm run typecheck",
    typecheck: "tsc -p tsconfig.test.json",
  },
};

/**
 * Build a fixture repo under `parent`, run the guard in it, and return
 * `{ status, out }`. `files` maps repo-relative paths to contents.
 * realpath'd because the guard only executes when `import.meta.url` matches
 * `process.argv[1]`, and macOS `tmpdir()` is a symlink.
 */
function runFixture(parent, rootScripts, files) {
  const dir = realpathSync(mkdtempSync(path.join(parent, "typecheck-cov-")));
  try {
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "fixture",
        workspaces: ["src/*"],
        scripts: rootScripts,
      }),
    );
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), content);
    }
    mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
    for (const rel of [
      "verify-typecheck-coverage.mjs",
      path.join("lib", "npm-scripts.mjs"),
      path.join("lib", "resolve-node-bin.mjs"),
      path.join("lib", "tsc-program.mjs"),
      path.join("lib", "workspaces.mjs"),
    ])
      cpSync(path.join(scriptsDir, rel), path.join(dir, "scripts", rel));
    // A guard-script test file, so `test:scripts`' own axes are satisfied.
    writeFileSync(
      path.join(dir, "scripts", "x.test.mjs"),
      'import { test } from "node:test";\ntest("x", () => {});\n',
    );
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["add", "-A"], { cwd: dir });
    const r = spawnSync(
      process.execPath,
      [path.join(dir, "scripts", "verify-typecheck-coverage.mjs")],
      { cwd: dir, encoding: "utf8" },
    );
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A scratch parent inside the repo, so `typescript` resolves by walk-up. */
function inRepo(fn) {
  const parent = mkdtempSync(path.join(repoRoot, ".typecheck-cov-fixture-"));
  try {
    return fn(parent);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

/** A workspace whose build config leaves its tests out, as three servers do. */
const SERVER_FILES = {
  "src/server/package.json": JSON.stringify(WORKSPACE),
  "src/server/tsconfig.json": JSON.stringify({
    compilerOptions: { strict: true, noEmit: true },
    include: ["./**/*.ts"],
    exclude: ["__tests__", "node_modules"],
  }),
  "src/server/tsconfig.test.json": JSON.stringify({
    extends: "./tsconfig.json",
    include: ["./**/*.ts"],
    exclude: ["node_modules"],
  }),
  "src/server/index.ts": "export const x = 1;\n",
  "src/server/__tests__/index.test.ts": "export const y = 2;\n",
};

test("unresolvable tsc is a hard 'cannot measure' error, not an empty file set", () => {
  // Outside the repo: no node_modules anywhere up the temp tree.
  const { status, out } = runFixture(tmpdir(), ROOT_SCRIPTS, SERVER_FILES);
  assert.equal(status, 1, out);
  assert.match(out, /cannot resolve `typescript` from src\/server/, out);
  assert.match(out, /npm install/, out);
  // The pre-inspector#1939 failure shape.
  assert.doesNotMatch(out, /get no `tsc` pass/, out);
  assert.doesNotMatch(out, /no diagnostic captured/, out);
});

test("a wired workspace whose typecheck program covers its tests passes", () => {
  const { status, out } = inRepo((p) =>
    runFixture(p, ROOT_SCRIPTS, SERVER_FILES),
  );
  assert.equal(status, 0, out);
  assert.match(out, /OK: all 2 tracked source files \(1 workspaces/);
});

test("a typecheck that runs only the build config leaves the tests uncovered", () => {
  // The hole this guard exists for in this repo: the build tsconfig excludes
  // `__tests__`, so typechecking it alone never looks at the tests.
  const files = {
    ...SERVER_FILES,
    "src/server/package.json": JSON.stringify({
      ...WORKSPACE,
      scripts: { ...WORKSPACE.scripts, typecheck: "tsc -p tsconfig.json" },
    }),
  };
  const { status, out } = inRepo((p) => runFixture(p, ROOT_SCRIPTS, files));
  assert.equal(status, 1, out);
  assert.match(
    out,
    /src\/server\/__tests__\/index\.test\.ts — in no tsconfig project/,
  );
});

test("the root validate must still run the workspaces' validate", () => {
  const root = {
    ...ROOT_SCRIPTS,
    validate: ROOT_SCRIPTS.validate.replace(
      " && npm run validate --workspaces",
      "",
    ),
  };
  const { status, out } = runFixture(tmpdir(), root, SERVER_FILES);
  assert.equal(status, 1, out);
  assert.match(
    out,
    /src\/server: the root `validate` chain no longer runs its `validate`/,
  );
});

test("a workspace with no typecheck script is not enrolled, and fails", () => {
  const files = {
    ...SERVER_FILES,
    "src/server/package.json": JSON.stringify({
      name: "fixture-server",
      scripts: { validate: "npm run build", build: "tsc" },
    }),
  };
  const { status, out } = runFixture(tmpdir(), ROOT_SCRIPTS, files);
  assert.equal(status, 1, out);
  assert.match(out, /src\/server: declares no `typecheck` script/);
});

test("typecheck not reachable from the workspace's own validate fails", () => {
  const files = {
    ...SERVER_FILES,
    "src/server/package.json": JSON.stringify({
      ...WORKSPACE,
      scripts: {
        ...WORKSPACE.scripts,
        validate: "npm run build",
        build: "tsc",
      },
    }),
  };
  const { status, out } = runFixture(tmpdir(), ROOT_SCRIPTS, files);
  assert.equal(status, 1, out);
  assert.match(out, /`typecheck` is not reachable from its `validate`/);
});

test("a matched src/* dir with TypeScript but no manifest fails", () => {
  const { status, out } = inRepo((p) =>
    runFixture(p, ROOT_SCRIPTS, {
      ...SERVER_FILES,
      "src/orphan/index.ts": "export {};\n",
    }),
  );
  assert.equal(status, 1, out);
  assert.match(
    out,
    /src\/orphan: holds tracked TypeScript but has no readable/,
  );
});

test("a Python server sharing src/* (no manifest, no TypeScript) is ignored", () => {
  const { status, out } = inRepo((p) =>
    runFixture(p, ROOT_SCRIPTS, {
      ...SERVER_FILES,
      "src/py/pyproject.toml": "[project]\nname = 'py'\n",
      "src/py/src/py/__init__.py": "",
    }),
  );
  assert.equal(status, 0, out);
});
