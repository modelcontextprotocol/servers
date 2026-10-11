// Ported from the MCP Inspector for #4864; `#N` in these comments are that
// repo's issues.
//
// Tests for `resolve-node-bin.mjs` (#1939) — the shared resolver that replaces
// shelling through `npx`, which is a `.cmd` shim on Windows that a shell-free
// `execFileSync`/`spawnSync` cannot start (ENOENT). Resolution is exercised
// against the packages the callers actually spawn (typescript, eslint, prettier),
// installed by the repo's own `npm install`, so the contract is pinned against
// the real `bin`/`exports` shapes rather than fixtures that can drift.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localSearchDirs, resolveNodeBin } from "./resolve-node-bin.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

test("resolves typescript's tsc (object-form bin) to an existing JS entry", () => {
  const entry = resolveNodeBin("typescript", "tsc", repoRoot);
  assert.ok(path.isAbsolute(entry), entry);
  assert.ok(existsSync(entry), `resolved entry does not exist: ${entry}`);
  assert.match(entry.split(path.sep).join("/"), /\/typescript\/.*tsc/);
});

test("resolves from a workspace dir, walking node_modules up like `npx --no-install`", () => {
  const entry = resolveNodeBin(
    "typescript",
    "tsc",
    path.join(repoRoot, "src", "memory"),
  );
  assert.ok(existsSync(entry), `resolved entry does not exist: ${entry}`);
});

test("resolves eslint's bin despite its exports map (no deep bin export)", () => {
  // eslint's `exports` map does not export `./bin/eslint.js`, so a
  // `require.resolve` of the bin path throws ERR_PACKAGE_PATH_NOT_EXPORTED —
  // the reason the helper goes through `<pkg>/package.json`.
  const entry = resolveNodeBin(
    "eslint",
    "eslint",
    path.join(repoRoot, "src", "memory"),
  );
  assert.ok(existsSync(entry), `resolved entry does not exist: ${entry}`);
  assert.match(entry.split(path.sep).join("/"), /\/eslint\/.*eslint\.js$/);
});

test("resolves a string-form bin (prettier) under the package's own name", () => {
  const entry = resolveNodeBin("prettier", "prettier", repoRoot);
  assert.ok(existsSync(entry), `resolved entry does not exist: ${entry}`);
  assert.match(entry.split(path.sep).join("/"), /\/prettier\//);
});

test("rejects a mismatched binName against a string-form bin", () => {
  // npm's string shorthand declares ONE command, named after the package — so
  // a typo must fail rather than silently resolving prettier's executable.
  assert.throws(
    () => resolveNodeBin("prettier", "prettierd", repoRoot),
    /prettier declares no "prettierd" bin/,
  );
});

test("throws when the package is not installed from fromDir", () => {
  assert.throws(
    () => resolveNodeBin("definitely-not-installed-anywhere", "x", repoRoot),
    /definitely-not-installed-anywhere/,
  );
});

test("throws when the package declares no such bin", () => {
  // typescript's bin map has `tsc`/`tsserver`, not `vite`.
  assert.throws(
    () => resolveNodeBin("typescript", "vite", repoRoot),
    /typescript declares no "vite" bin/,
  );
});

// The remaining cases need a manifest shape the real installs don't have, so
// they run against a throwaway node_modules tree rather than a real package.
function fixtureDir(manifest, { createBinFile = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "resolve-node-bin-"));
  const pkgDir = path.join(dir, "node_modules", manifest.name);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify(manifest),
    "utf8",
  );
  if (createBinFile) {
    const rel =
      typeof manifest.bin === "string"
        ? manifest.bin
        : Object.values(manifest.bin)[0];
    const target = path.join(pkgDir, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "", "utf8");
  }
  // The consumer `package.json` `createRequire` is based at.
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "consumer" }),
    "utf8",
  );
  return dir;
}

test("throws when a declared bin's file is missing (partial install)", () => {
  // The silent case this helper exists to kill: `process.execPath <missing>`
  // spawns fine and exits 1 with empty stdout, which downstream reads as "no
  // diagnostic captured" and reports every tracked file as uncovered.
  const dir = fixtureDir({ name: "ghostpkg", bin: { ghost: "bin/ghost.js" } });
  try {
    assert.throws(
      () => resolveNodeBin("ghostpkg", "ghost", dir),
      /ghostpkg's "ghost" bin points at a missing file/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolves a package whose `exports` hides ./package.json", () => {
  // `require.resolve("<pkg>/package.json")` throws ERR_PACKAGE_PATH_NOT_EXPORTED
  // for this shape — Node has no special case keeping `./package.json`
  // exported — which would be a false "not installed" for a package whose bin
  // is right there on disk. The manifest lookup walks node_modules instead.
  const dir = fixtureDir(
    {
      name: "walledpkg",
      exports: { ".": "./index.js" },
      bin: { walled: "bin/walled.js" },
    },
    { createBinFile: true },
  );
  try {
    const entry = resolveNodeBin("walledpkg", "walled", dir);
    assert.ok(existsSync(entry), `resolved entry does not exist: ${entry}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("localSearchDirs keeps only node_modules on fromDir's ancestor chain", () => {
  // `require.resolve.paths()` appends Node's GLOBAL FOLDERS and any NODE_PATH
  // entries. Honouring those would break the guarantee this module exists for
  // — that the spawned tsc/vite is the REPO-PINNED one — by letting a globally
  // installed TypeScript stand in for a missing repo install, measuring the
  // programs with the wrong compiler instead of failing actionably.
  const from = path.join(path.sep, "repo", "src", "memory");
  const kept = [
    path.join(from, "node_modules"),
    path.join(path.sep, "repo", "src", "node_modules"),
    path.join(path.sep, "repo", "node_modules"),
    path.join(path.sep, "node_modules"),
  ];
  const dropped = [
    path.join(path.sep, "home", "dev", ".node_modules"),
    path.join(path.sep, "home", "dev", ".node_libraries"),
    path.join(path.sep, "usr", "local", "lib", "node"),
    // A NODE_PATH entry off the chain — a real node_modules, just not ours.
    path.join(path.sep, "opt", "shared", "node_modules"),
  ];
  assert.deepEqual(localSearchDirs([...kept, ...dropped], from), kept);
});

test("a package visible only outside the ancestor chain is not resolved", () => {
  // The end-to-end form of the above: `ghostpkg` exists on disk, but under a
  // sibling tree rather than an ancestor of `fromDir`.
  const outside = fixtureDir(
    { name: "elsewherepkg", bin: { elsewhere: "bin/e.js" } },
    { createBinFile: true },
  );
  const consumer = mkdtempSync(path.join(tmpdir(), "resolve-node-bin-from-"));
  try {
    writeFileSync(
      path.join(consumer, "package.json"),
      JSON.stringify({ name: "consumer" }),
      "utf8",
    );
    assert.throws(
      () => resolveNodeBin("elsewherepkg", "elsewhere", consumer),
      /cannot find elsewherepkg/,
    );
  } finally {
    rmSync(outside, { recursive: true, force: true });
    rmSync(consumer, { recursive: true, force: true });
  }
});

test("accepts a scoped package's string-form bin under its unscoped name", () => {
  const dir = fixtureDir(
    { name: "@scope/tool", bin: "bin/tool.js" },
    { createBinFile: true },
  );
  try {
    const entry = resolveNodeBin("@scope/tool", "tool", dir);
    assert.ok(existsSync(entry), `resolved entry does not exist: ${entry}`);
    assert.throws(
      () => resolveNodeBin("@scope/tool", "scope-tool", dir),
      /declares no "scope-tool" bin/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
