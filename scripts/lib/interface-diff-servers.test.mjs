// Tests for the interface diff's server selection (#5428): which servers a
// change touches, and the lockfile walk that decides whether a root
// `package-lock.json` edit reaches a server. The bug this selection fixes was
// a lockfile edit selecting every server, so most cases here are lockfile
// edits that must NOT select one. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVERS,
  TOOLING_PATHS,
  lockfileClosure,
  resolveLocation,
  selectServers,
} from "./interface-diff-servers.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const pkg = (version, extra = {}) => ({
  version,
  resolved: `https://registry.example/${version}.tgz`,
  integrity: `sha512-${version}`,
  ...extra,
});

/**
 * A small workspace lockfile: `a` uses express, which uses qs; `b` uses zod
 * and nests its own minimatch; the root holds the diff tool.
 */
function lockfile({
  qs = "6.0.0",
  zod = "4.0.0",
  nested = "11.0.0",
  hoisted = "9.0.0",
  tool = "1.0.0",
  vitest = "4.0.0",
} = {}) {
  return {
    lockfileVersion: 3,
    packages: {
      "": { devDependencies: { "mcp-server-diff": tool } },
      "node_modules/@modelcontextprotocol/server-a": {
        resolved: "src/a",
        link: true,
      },
      "src/a": {
        version: "1.0.0",
        dependencies: { express: "^5" },
        devDependencies: { vitest: "^4" },
      },
      "src/b": {
        version: "1.0.0",
        dependencies: { zod: "^4", minimatch: "^11" },
      },
      "src/b/node_modules/minimatch": pkg(nested),
      "node_modules/minimatch": pkg(hoisted),
      "node_modules/express": pkg("5.0.0", { dependencies: { qs: "^6" } }),
      "node_modules/qs": pkg(qs),
      "node_modules/zod": pkg(zod),
      "node_modules/vitest": pkg(vitest, { devDependencies: { qs: "^6" } }),
      "node_modules/mcp-server-diff": pkg(tool, { dependencies: { qs: "^6" } }),
    },
  };
}

const servers = [
  { name: "a", language: "ts" },
  { name: "b", language: "ts" },
  { name: "p", language: "py" },
];
const select = (changedFiles, baseLock, headLock) =>
  selectServers({ changedFiles, baseLock, headLock, servers }).map(
    (s) => s.server,
  );

test("resolveLocation finds the nearest node_modules going up", () => {
  const { packages } = lockfile();
  assert.equal(
    resolveLocation(packages, "src/b", "minimatch"),
    "src/b/node_modules/minimatch",
  );
  assert.equal(resolveLocation(packages, "src/b", "zod"), "node_modules/zod");
  assert.equal(
    resolveLocation(packages, "node_modules/express", "qs"),
    "node_modules/qs",
  );
  assert.equal(
    resolveLocation(packages, "src/b/node_modules/minimatch", "zod"),
    "node_modules/zod",
  );
  assert.equal(resolveLocation(packages, "src/a", "nothing"), null);
});

test("lockfileClosure walks dependencies, and only the start's devDependencies", () => {
  const closure = lockfileClosure(lockfile(), "src/a");
  assert.deepEqual([...closure.keys()].sort(), [
    "node_modules/express",
    "node_modules/qs",
    "node_modules/vitest",
    "src/a",
  ]);
  // A workspace link is followed to its target.
  assert.ok(
    lockfileClosure(
      lockfile(),
      "node_modules/@modelcontextprotocol/server-a",
    ).has("node_modules/express"),
  );
  assert.equal(lockfileClosure(null, "src/a").size, 0);
  assert.equal(lockfileClosure(lockfile(), null).size, 0);
});

test("a server's own files select it, and only it", () => {
  assert.deepEqual(select(["src/b/index.ts"], null, null), ["b"]);
  assert.deepEqual(select(["src/p/uv.lock", "src/a/x.ts"], null, null), [
    "a",
    "p",
  ]);
  // A prefix is a directory, not a name: `src/ab` is not `src/a`.
  assert.deepEqual(
    select(["src/ab/x.ts", "README.md", ".changeset/x.md"], null, null),
    [],
  );
});

test("a lockfile edit selects only the servers whose resolved tree it changes", () => {
  const base = lockfile();
  // qs is reached by `a` through express; `b` never loads it.
  assert.deepEqual(
    select(["package-lock.json"], base, lockfile({ qs: "6.1.0" })),
    ["a"],
  );
  // The nested minimatch is `b`'s; the hoisted one nobody loads.
  assert.deepEqual(
    select(["package-lock.json"], base, lockfile({ nested: "11.1.0" })),
    ["b"],
  );
  assert.deepEqual(
    select(["package-lock.json"], base, lockfile({ hoisted: "9.1.0" })),
    [],
  );
  // The start's devDependencies build it, so they count.
  assert.deepEqual(
    select(["package-lock.json"], base, lockfile({ vitest: "4.1.0" })),
    ["a"],
  );
  // A rewrite that changes no locked package selects nothing.
  assert.deepEqual(
    select(["package-lock.json", "package.json"], base, lockfile()),
    [],
  );
});

test("an unchanged lockfile is not read, even if the two copies differ", () => {
  assert.deepEqual(
    select(["src/b/x.ts"], lockfile(), lockfile({ qs: "7.0.0" })),
    ["b"],
  );
});

test("the tooling, the diff tool's version or the root tsconfig select more", () => {
  for (const tooling of TOOLING_PATHS)
    assert.deepEqual(select([tooling], null, null), ["a", "b", "p"], tooling);
  assert.deepEqual(
    select(["package-lock.json"], lockfile(), lockfile({ tool: "1.1.0" })),
    ["a", "b", "p"],
  );
  // The root tsconfig is every TypeScript server's, and no Python server's.
  assert.deepEqual(select(["tsconfig.json"], null, null), ["a", "b"]);
});

test("each selection carries its reason", () => {
  const [one] = selectServers({
    changedFiles: ["src/a/x.ts"],
    baseLock: null,
    headLock: null,
    servers,
  });
  assert.deepEqual(one, {
    server: "a",
    language: "ts",
    reason: "`src/a/x.ts` changed",
  });
  const [lock] = selectServers({
    changedFiles: ["package-lock.json"],
    baseLock: lockfile(),
    headLock: lockfile({ qs: "6.1.0" }),
    servers,
  });
  assert.match(lock.reason, /changes a package it resolves/);
});

test("SERVERS lists every server directory, with its language", () => {
  const src = path.join(repoRoot, "src");
  const dirs = readdirSync(src, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter(
      (name) =>
        existsSync(path.join(src, name, "package.json")) ||
        existsSync(path.join(src, name, "pyproject.toml")),
    )
    .sort();
  assert.deepEqual(SERVERS.map((s) => s.name).sort(), dirs);
  for (const s of SERVERS) {
    const manifest = s.language === "ts" ? "package.json" : "pyproject.toml";
    assert.ok(
      existsSync(path.join(src, s.name, manifest)),
      `${s.name}: ${manifest}`,
    );
  }
});

test("the workflow is one of the tooling paths, under its real name", () => {
  for (const p of TOOLING_PATHS)
    assert.ok(existsSync(path.join(repoRoot, p)), `${p} exists`);
});
