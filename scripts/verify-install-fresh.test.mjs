// Tests for the install-freshness guard (#4871). `compareInstall` is exercised
// with an in-memory reader; `main` against a throwaway tree on disk, so the
// lockfile read and the exit status are covered too.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  compareInstall,
  compareManifests,
  main,
} from "./verify-install-fresh.mjs";

const lockOf = (packages) => ({
  lockfileVersion: 3,
  packages: { "": { name: "x" }, ...packages },
});
const reader = (installed) => (entryPath) => installed[entryPath];

test("an install matching its lockfile reports nothing", () => {
  const lock = lockOf({
    "node_modules/a": { version: "1.0.0" },
    "node_modules/a/node_modules/b": { version: "2.0.0" },
  });
  assert.deepEqual(
    compareInstall(
      lock,
      reader({
        "node_modules/a": "1.0.0",
        "node_modules/a/node_modules/b": "2.0.0",
      }),
    ),
    { stale: [], missing: [] },
  );
});

test("a copy at another version is stale, nested copies included", () => {
  const lock = lockOf({
    "node_modules/sdk": { version: "2.1.0" },
    "node_modules/a/node_modules/b": { version: "2.0.0" },
  });
  const { stale } = compareInstall(
    lock,
    reader({
      "node_modules/sdk": "2.0.0",
      "node_modules/a/node_modules/b": "1.9.0",
    }),
  );
  assert.deepEqual(stale, [
    { entryPath: "node_modules/sdk", expected: "2.1.0", installed: "2.0.0" },
    {
      entryPath: "node_modules/a/node_modules/b",
      expected: "2.0.0",
      installed: "1.9.0",
    },
  ]);
});

test("a required package that is absent is missing; optional ones are exempt", () => {
  const lock = lockOf({
    "node_modules/new-dep": { version: "1.0.0", dev: true },
    "node_modules/fsevents": { version: "2.3.3", optional: true },
    "node_modules/other-os": { version: "1.0.0", devOptional: true },
  });
  assert.deepEqual(compareInstall(lock, reader({})), {
    stale: [],
    missing: [{ entryPath: "node_modules/new-dep", expected: "1.0.0" }],
  });
});

test("workspace links and the workspaces themselves are skipped", () => {
  const lock = lockOf({
    "node_modules/@scope/server": { resolved: "src/server", link: true },
    "src/server": { version: "0.0.0" },
  });
  assert.deepEqual(compareInstall(lock, reader({})), {
    stale: [],
    missing: [],
  });
});

test("a copy nested under a workspace is compared too", () => {
  const lock = lockOf({
    "src/server/node_modules/dep": { version: "3.0.0" },
  });
  assert.deepEqual(
    compareInstall(lock, reader({ "src/server/node_modules/dep": "2.0.0" })),
    {
      stale: [
        {
          entryPath: "src/server/node_modules/dep",
          expected: "3.0.0",
          installed: "2.0.0",
        },
      ],
      missing: [],
    },
  );
});

test("compareManifests: a manifest the lockfile mirrors exactly reports nothing", () => {
  const lock = {
    packages: {
      "": { devDependencies: { yaml: "^2.9.0" } },
      "src/server": { dependencies: { zod: "^3.0.0" } },
      "node_modules/zod": { version: "3.1.0", dependencies: { x: "1" } },
      "node_modules/@scope/server": { resolved: "src/server", link: true },
    },
  };
  const manifests = {
    "": { devDependencies: { yaml: "^2.9.0" } },
    "src/server": { dependencies: { zod: "^3.0.0" } },
  };
  assert.deepEqual(
    compareManifests(lock, (dir) => manifests[dir]),
    [],
  );
});

test("compareManifests: an added, removed or re-ranged dependency is drift", () => {
  const lock = {
    packages: {
      "": { devDependencies: { yaml: "^2.9.0", gone: "^1.0.0" } },
      "src/server": { dependencies: { zod: "^3.0.0" } },
    },
  };
  const manifests = {
    "": { devDependencies: { yaml: "^2.9.0", added: "^1.0.0" } },
    "src/server": { dependencies: { zod: "^4.0.0" } },
  };
  assert.deepEqual(
    compareManifests(lock, (dir) => manifests[dir]),
    [
      {
        dir: "",
        section: "devDependencies",
        name: "added",
        manifest: "^1.0.0",
        lock: undefined,
      },
      {
        dir: "",
        section: "devDependencies",
        name: "gone",
        manifest: undefined,
        lock: "^1.0.0",
      },
      {
        dir: "src/server",
        section: "dependencies",
        name: "zod",
        manifest: "^4.0.0",
        lock: "^3.0.0",
      },
    ],
  );
});

test("main fails when a manifest declares what the lockfile does not", (t) => {
  const { root, write } = fixture(t);
  t.mock.method(console, "log", () => {});
  const error = t.mock.method(console, "error", () => {});
  write("node_modules/sdk/package.json", { version: "2.1.0" });
  write("package.json", { name: "root", dependencies: { added: "^1.0.0" } });
  assert.equal(main(root), 1);
  assert.match(
    error.mock.calls[0].arguments[0],
    /package\.json dependencies\.added: manifest \^1\.0\.0, lockfile \(absent\)/,
  );
});

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "install-fresh-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (rel, json) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), JSON.stringify(json));
  };
  write("package.json", { name: "root" });
  write(
    "package-lock.json",
    lockOf({ "node_modules/sdk": { version: "2.1.0" } }),
  );
  return { root, write };
}

test("main passes a fresh tree and fails a stale one", (t) => {
  const { root, write } = fixture(t);
  const log = t.mock.method(console, "log", () => {});
  const error = t.mock.method(console, "error", () => {});

  write("node_modules/sdk/package.json", { version: "2.1.0" });
  assert.equal(main(root), 0);
  assert.match(log.mock.calls[0].arguments[0], /OK/);

  write("node_modules/sdk/package.json", { version: "2.0.0" });
  assert.equal(main(root), 1);
  const message = error.mock.calls[0].arguments[0];
  assert.match(
    message,
    /node_modules\/sdk: installed 2\.0\.0, lockfile 2\.1\.0/,
  );
  assert.match(message, /npm install/);
});

test("main names an install that was never installed in one line", (t) => {
  const { root } = fixture(t);
  const error = t.mock.method(console, "error", () => {});
  assert.equal(main(root), 1);
  assert.match(error.mock.calls[0].arguments[0], /no node_modules at all/);
});

test("main fails when there is no lockfile to compare against", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "install-fresh-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const error = t.mock.method(console, "error", () => {});
  assert.equal(main(root), 1);
  assert.match(error.mock.calls[0].arguments[0], /no package-lock\.json/);
});
