// Tests for the `uv.lock` reader (#4874): locked packages, the root project's
// name, and the specifiers it declares, from the shape uv writes. Run via
// `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseUvLock } from "./uv-lock.mjs";

const LOCK = `version = 1
requires-python = ">=3.10"

[[package]]
name = "mcp"
version = "1.29.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "mcp-server-time"
version = "0.6.2"
source = { editable = "." }
dependencies = [
    { name = "mcp" },
    { name = "tzdata" },
]

[package.dev-dependencies]
dev = [
    { name = "pytest" },
]

[package.metadata]
requires-dist = [
    { name = "mcp", specifier = ">=1.29.0,<2" },
    { name = "httpx", extras = ["socks"], specifier = ">=0.27" },
    { name = "tzdata" },
]

[package.metadata.requires-dev]
dev = [{ name = "PyTest", specifier = ">=8.3.3" }]

[[package]]
name = "PyJWT"
version = "2.13.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "pyjwt"
version = "2.12.0"
source = { registry = "https://pypi.org/simple" }
`;

test("parseUvLock reads packages, the project and its declared specifiers", () => {
  const lock = parseUvLock(LOCK);
  assert.equal(lock.project, "mcp-server-time");
  assert.deepEqual(lock.packages, [
    { name: "mcp", version: "1.29.0" },
    { name: "PyJWT", version: "2.13.0" },
    { name: "pyjwt", version: "2.12.0" },
  ]);
  assert.equal(lock.declared.get("mcp"), ">=1.29.0,<2");
  assert.equal(lock.declared.get("httpx"), ">=0.27");
  assert.equal(lock.declared.get("tzdata"), "");
  assert.equal(lock.declared.get("pytest"), ">=8.3.3");
  assert.equal(lock.declared.has("pyjwt"), false);
});

test("parseUvLock reads every real lockfile in the repo", () => {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  for (const server of ["fetch", "git", "time"]) {
    const lock = parseUvLock(
      readFileSync(path.join(root, "src", server, "uv.lock"), "utf8"),
    );
    assert.equal(lock.project, `mcp-server-${server}`);
    assert.ok(lock.declared.has("mcp"), `${server} declares mcp`);
    assert.ok(
      lock.packages.some((p) => p.name === "mcp"),
      `${server} locks mcp`,
    );
  }
});

test("parseUvLock tolerates a lock with no project", () => {
  const lock = parseUvLock('[[package]]\nname = "x"\nversion = "1"\n');
  assert.equal(lock.project, null);
  assert.equal(lock.declared.size, 0);
});
