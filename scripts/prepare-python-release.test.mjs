// Tests for the Python CalVer stamping script (#4472). The pure helpers are
// driven with inline manifests; `main` runs against a throwaway tree with git
// and uv replaced by a seam, so the decision (stamp or skip) is covered without
// either tool, and once against a real git repository so the two git queries
// the decision rests on are exercised as written.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  TOOLS,
  calver,
  main,
  readProject,
  shipsInPackage,
  stampVersion,
} from "./prepare-python-release.mjs";

const manifest = (name, version) =>
  [
    "[project]",
    `name = "${name}"`,
    `version = "${version}"`,
    'description = "x"',
    "",
    "[tool.hatch.version]",
    'version = "not-this-one"',
    "",
  ].join("\n");

test("calver is the UTC date without zero padding", () => {
  assert.equal(calver(new Date("2026-08-01T12:00:00Z")), "2026.8.1");
  assert.equal(calver(new Date("2026-12-31T23:59:59Z")), "2026.12.31");
  // 23:30 on the 1st in UTC-5 is already the 2nd in UTC.
  assert.equal(calver(new Date("2026-08-01T23:30:00-05:00")), "2026.8.2");
});

test("shipsInPackage counts what a user installs, not the tests", () => {
  for (const file of [
    "src/mcp_server_git/server.py",
    "src/mcp_server_git/py.typed",
    "README.md",
    "pyproject.toml",
    "LICENSE",
    "LICENSE.txt",
    "licence",
  ])
    assert.equal(shipsInPackage(file), true, file);
  for (const file of [
    "tests/test_server.py",
    "test/time_server_test.py",
    "uv.lock",
    "Dockerfile",
    "src/mcp_server_git/licenses.json",
    ".python-version",
  ])
    assert.equal(shipsInPackage(file), false, file);
});

test("readProject reads the [project] table's name and version", () => {
  assert.deepEqual(readProject(manifest("mcp-server-time", "0.6.2")), {
    name: "mcp-server-time",
    version: "0.6.2",
  });
});

test("readProject fails loudly on a manifest it cannot read", () => {
  assert.throws(
    () => readProject('[tool.x]\nversion = "1"\n'),
    /no \[project\]/,
  );
  assert.throws(
    () => readProject('[project]\nname = "x"\ndynamic = ["version"]\n'),
    /no `version = "…"` line/,
  );
});

test("stampVersion changes only the [project] version line", () => {
  const before = manifest("mcp-server-time", "0.6.2");
  const after = stampVersion(before, "2026.8.1");
  assert.equal(after, before.replace('"0.6.2"', '"2026.8.1"'));
  assert.match(after, /version = "not-this-one"/);
});

test("stampVersion does not reach into a later table for a version", () => {
  assert.throws(
    () =>
      stampVersion('[project]\nname = "x"\n\n[tool.y]\nversion = "1"\n', "2"),
    /no `version = "…"` line/,
  );
});

function withTree(packages, fn) {
  const root = mkdtempSync(path.join(tmpdir(), "prepare-py-"));
  try {
    for (const [dir, text] of Object.entries(packages)) {
      mkdirSync(path.join(root, "src", dir), { recursive: true });
      writeFileSync(path.join(root, "src", dir, "pyproject.toml"), text);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const versionOf = (root, dir) =>
  readProject(
    readFileSync(path.join(root, "src", dir, "pyproject.toml"), "utf8"),
  ).version;

/** Runs `main` with console output captured rather than printed. */
function runMain(t, options) {
  const out = t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  const code = main(options);
  return { code, stdout: out.mock.calls.map((c) => c.arguments[0]) };
}

const today = new Date("2026-08-01T00:00:00Z");

test("main stamps a package with a shipped change and locks it", (t) => {
  withTree(
    {
      changed: manifest("mcp-server-changed", "2026.7.4"),
      "tests-only": manifest("mcp-server-tests-only", "2026.7.4"),
      current: manifest("mcp-server-current", "2026.8.1"),
      "not-python": "",
    },
    (root) => {
      rmSync(path.join(root, "src", "not-python", "pyproject.toml"));
      const locked = [];
      const tools = {
        lastVersionBump: () => "abc123",
        changedSince: (dir) =>
          path.basename(dir) === "changed"
            ? ["src/mcp_server_changed/server.py"]
            : ["tests/test_server.py", "uv.lock"],
        lock: (dir) => locked.push(path.basename(dir)),
      };
      const { code, stdout } = runMain(t, { root, today, tools });
      assert.equal(code, 0);
      assert.deepEqual(stdout, ["mcp-server-changed: 2026.7.4 -> 2026.8.1"]);
      assert.deepEqual(locked, ["changed"]);
      assert.equal(versionOf(root, "changed"), "2026.8.1");
      assert.equal(versionOf(root, "tests-only"), "2026.7.4");
      assert.equal(versionOf(root, "current"), "2026.8.1");
    },
  );
});

test("main stamps a package whose version was never bumped in history", (t) => {
  withTree({ fresh: manifest("mcp-server-fresh", "0.1.0") }, (root) => {
    const tools = {
      lastVersionBump: () => "",
      changedSince: () => assert.fail("nothing to diff against"),
      lock: () => {},
    };
    const { stdout } = runMain(t, { root, today, tools });
    assert.deepEqual(stdout, ["mcp-server-fresh: 0.1.0 -> 2026.8.1"]);
  });
});

test("main fails when it finds no Python package at all", (t) => {
  withTree({}, (root) => {
    mkdirSync(path.join(root, "src"), { recursive: true });
    assert.equal(runMain(t, { root, today }).code, 1);
  });
});

test("the git queries find the last bump and what changed since", () => {
  withTree({ pkg: manifest("mcp-server-pkg", "2026.7.4") }, (root) => {
    const dir = path.join(root, "src", "pkg");
    const git = (...args) => {
      const res = spawnSync(
        "git",
        [
          "-c",
          "user.name=t",
          "-c",
          "user.email=t@example.com",
          "-c",
          "commit.gpgsign=false",
          ...args,
        ],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(res.status, 0, res.stderr);
      return res.stdout.trim();
    };
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "bump");
    const bump = git("rev-parse", "HEAD");
    assert.equal(TOOLS.lastVersionBump(dir), bump);
    assert.deepEqual(TOOLS.changedSince(dir, bump), []);

    writeFileSync(path.join(dir, "server.py"), "x = 1\n");
    // A file outside the package must not be attributed to it.
    writeFileSync(path.join(root, "src", "other.py"), "y = 1\n");
    git("add", "-A");
    git("commit", "-q", "-m", "change");
    // The later commit did not touch the version line, so the bump is unmoved.
    assert.equal(TOOLS.lastVersionBump(dir), bump);
    assert.deepEqual(TOOLS.changedSince(dir, bump), ["server.py"]);
  });
});
