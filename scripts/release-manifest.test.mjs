// Tests for the released-package identities `release.yml` checks artifacts
// against (#4873), over a throwaway tree and over this repository.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  distributionStem,
  expectedPackages,
  main,
} from "./release-manifest.mjs";

function withTree(files, fn) {
  const root = mkdtempSync(path.join(tmpdir(), "release-manifest-"));
  try {
    mkdirSync(path.join(root, "src"));
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const tree = {
  "src/memory/package.json": JSON.stringify({
    name: "@scope/server-memory",
    version: "1.2.0",
  }),
  "src/time/pyproject.toml":
    '[project]\nname = "mcp-server-time"\nversion = "2026.8.1"\n',
  "src/notes/README.md": "not a package",
  "src/stray.txt": "not a directory",
};

test("expectedPackages reads each manifest, keyed by directory", () => {
  withTree(tree, (root) => {
    assert.deepEqual(expectedPackages(root), {
      npm: { memory: { name: "@scope/server-memory", version: "1.2.0" } },
      pypi: { time: { name: "mcp-server-time", version: "2026.8.1" } },
    });
  });
});

test("a manifest with no name or no version fails loudly", () => {
  withTree({ "src/bad/package.json": JSON.stringify({ name: "x" }) }, (root) =>
    assert.throws(() => expectedPackages(root), /has no version/),
  );
  withTree(
    { "src/bad/package.json": JSON.stringify({ version: "1.0.0" }) },
    (root) =>
      assert.throws(() => expectedPackages(root), /has no package name/),
  );
});

test("distributionStem is the normalized name PyPI file names carry", () => {
  assert.equal(
    distributionStem("mcp-server-time", "2026.8.1"),
    "mcp_server_time-2026.8.1",
  );
  assert.equal(distributionStem("Some.Odd__Name", "1.0"), "some_odd_name-1.0");
});

test("main writes both step outputs as single-line JSON", (t) => {
  t.mock.method(console, "log", () => {});
  withTree(tree, (root) => {
    const out = path.join(root, "output");
    assert.equal(main({ root, env: { GITHUB_OUTPUT: out } }), 0);
    const lines = readFileSync(out, "utf8").trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0].replace(/^npm_expected=/, "")), {
      memory: { name: "@scope/server-memory", version: "1.2.0" },
    });
    assert.deepEqual(JSON.parse(lines[1].replace(/^pypi_expected=/, "")), {
      time: {
        name: "mcp-server-time",
        version: "2026.8.1",
        stem: "mcp_server_time-2026.8.1",
      },
    });
  });
});

test("this repository's seven packages are all found", () => {
  const { npm, pypi } = expectedPackages();
  assert.deepEqual(Object.keys(npm).sort(), [
    "everything",
    "filesystem",
    "memory",
    "sequentialthinking",
  ]);
  assert.deepEqual(Object.keys(pypi).sort(), ["fetch", "git", "time"]);
});
