// Table-driven tests for the `tsc` program helpers `verify:typecheck-coverage`
// reads a workspace's programs through. Ported from the MCP Inspector for
// #4864: one case per rule, and the comment names the rule, so relaxing one
// shows up as a deleted assertion rather than a quiet behavior shift. The
// `(rN)` tags are the Inspector review rounds (inspector#1799) that found them.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDisablingFlag,
  isTsc,
  parseTsconfigReferences,
  projectConfigFile,
  refToProject,
  typecheckProjects,
} from "./tsc-program.mjs";

test("isTsc: matches by basename incl. path-invoked (r18 regression)", () => {
  for (const t of [
    "tsc",
    "node_modules/.bin/tsc",
    "./node_modules/.bin/tsc.cmd",
  ])
    assert.ok(isTsc(t), t);
  for (const t of ["vitest", "prettier", "tscx", "atsc"])
    assert.ok(!isTsc(t), t);
});

test("isDisablingFlag: case-insensitive (r18)", () => {
  for (const t of [
    "--noCheck",
    "--nocheck",
    "--listFilesOnly",
    "--LISTFILESONLY",
  ])
    assert.ok(isDisablingFlag(t), t);
  for (const t of ["--noEmit", "-p", "--project", "noCheck"])
    assert.ok(!isDisablingFlag(t), t);
});

test("typecheckProjects: harvests -p / --project / -b, implicit tsconfig.json (r13)", () => {
  const { projects, neutered } = typecheckProjects({
    typecheck:
      "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json",
  });
  assert.deepEqual(projects, ["tsconfig.json", "tsconfig.test.json"]);
  assert.equal(neutered.length, 0);

  // A bare `tsc` (no project flag) resolves the implicit ./tsconfig.json.
  assert.deepEqual(typecheckProjects({ typecheck: "tsc --noEmit" }).projects, [
    "tsconfig.json",
  ]);

  // Path-invoked binary still counts (r18).
  assert.deepEqual(
    typecheckProjects({ typecheck: "node_modules/.bin/tsc -p tsconfig.json" })
      .projects,
    ["tsconfig.json"],
  );

  // A quoted project path (r17).
  assert.deepEqual(
    typecheckProjects({ typecheck: `tsc -p "tsconfig.test.json"` }).projects,
    ["tsconfig.test.json"],
  );

  // `--project` long form, and `-b`/`--build` project paths (r13).
  const proj = (cmd) => typecheckProjects({ typecheck: cmd }).projects;
  assert.deepEqual(proj("tsc --noEmit --project tsconfig.json"), [
    "tsconfig.json",
  ]);
  assert.deepEqual(proj("tsc -b tsconfig.json"), ["tsconfig.json"]);
  assert.deepEqual(proj("tsc --build tsconfig.json"), ["tsconfig.json"]);
  assert.deepEqual(proj("tsc -b"), ["tsconfig.json"]); // implicit fallback
});

test("typecheckProjects: neutered by --noCheck / --listFilesOnly (r10)", () => {
  const { projects, neutered } = typecheckProjects({
    typecheck:
      "tsc --noEmit -p tsconfig.json --noCheck && tsc --noEmit -p tsconfig.test.json",
  });
  assert.deepEqual(projects, ["tsconfig.test.json"]);
  assert.deepEqual(neutered, [{ project: "tsconfig.json", flag: "--noCheck" }]);
});

test("typecheckProjects: delegating typecheck, ignores non-tsc segments (r15)", () => {
  const { projects } = typecheckProjects({
    typecheck: "npm run typecheck:src && npm run typecheck:test",
    "typecheck:src": "tsc --noEmit -p tsconfig.json",
    "typecheck:test": "tsc --noEmit --project tsconfig.test.json",
  });
  assert.deepEqual(projects.sort(), ["tsconfig.json", "tsconfig.test.json"]);
});

test("parseTsconfigReferences: JSONC tolerance (r17-nit2 block comments)", () => {
  const refs = (raw) => parseTsconfigReferences(raw);
  assert.deepEqual(refs('{ "references": [{ "path": "./a" }] }'), ["./a"]);
  assert.deepEqual(
    refs('/* solution */\n{ "references": [{ "path": "./a" }] }'),
    ["./a"],
  );
  assert.deepEqual(refs('{ "references": [{ "path": "./a" }] } // trailing'), [
    "./a",
  ]);
  assert.deepEqual(refs('{ "references": [{ "path": "./a" },] }'), ["./a"]); // trailing comma
  assert.deepEqual(refs('{ "files": [] }'), []); // no references
  assert.deepEqual(refs("{ not json"), []); // malformed
  assert.deepEqual(refs('{ "references": [{ "prepend": true }] }'), []); // no path
});

test("projectConfigFile: directory-form entry means <dir>/tsconfig.json (r26)", () => {
  assert.equal(
    projectConfigFile("src/memory", "tsconfig.test.json"),
    "src/memory/tsconfig.test.json",
  );
  assert.equal(
    projectConfigFile("src/memory", "packages/a"),
    "src/memory/packages/a/tsconfig.json",
  );
  assert.equal(
    projectConfigFile("src/memory", "."),
    "src/memory/tsconfig.json",
  );
});

test("refToProject: refs resolve against the REFERRING config's dir (r26)", () => {
  // A ref is relative to the tsconfig that declares it, not to clientDir.
  assert.equal(
    refToProject(
      "src/everything",
      "src/everything/tsconfig.json",
      "./tsconfig.app.json",
    ),
    "tsconfig.app.json",
  );
  assert.equal(
    refToProject(
      "src/everything",
      "src/everything/sub/tsconfig.json",
      "../other.json",
    ),
    "other.json",
  );
  assert.equal(
    refToProject(
      "src/everything",
      "src/everything/sub/tsconfig.json",
      "./deep",
    ),
    "sub/deep",
  );
});
