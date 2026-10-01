// Tests for the pure parts of pack-and-verify (#4873): the command line, the
// tarball check and where an installed command lives. The rest of the script
// is `npm pack`, `npm install`, `uv build` and a real server boot, which need
// the network and are exercised by running `npm run pack:verify` itself.
// Run via `npm run test:scripts`.

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
import {
  artifactDirProblem,
  consumerEnv,
  installedLaunch,
  isDistribution,
  main,
  parseArgs,
  tarballProblems,
} from "./pack-and-verify.mjs";

test("parseArgs separates server names from --out", () => {
  assert.deepEqual(parseArgs([]), { names: [], out: undefined });
  assert.deepEqual(parseArgs(["memory", "--out", "dist-out", "time"]), {
    names: ["memory", "time"],
    out: "dist-out",
  });
});

test("parseArgs rejects --out with no directory, and unknown options", () => {
  assert.throws(() => parseArgs(["--out"]), /needs a directory/);
  assert.throws(() => parseArgs(["--out", "--keep"]), /needs a directory/);
  assert.throws(() => parseArgs(["--keep"]), /unknown option: --keep/);
});

test("a tarball that holds its bin target has no problems", () => {
  const manifest = { name: "@scope/pkg", bin: { cmd: "dist/index.js" } };
  assert.deepEqual(
    tarballProblems(manifest, ["package.json", "README.md", "dist/index.js"]),
    [],
  );
  // `./dist/index.js` and `dist/index.js` are the same file.
  assert.deepEqual(
    tarballProblems({ ...manifest, bin: { cmd: "./dist/index.js" } }, [
      "dist/index.js",
    ]),
    [],
  );
});

test("a bin target missing from the tarball is named", () => {
  const manifest = { name: "@scope/pkg", bin: { cmd: "dist/index.js" } };
  assert.deepEqual(tarballProblems(manifest, ["package.json", "README.md"]), [
    "bin `cmd` points at dist/index.js, which is not in the tarball",
  ]);
});

test("the string form of bin is read, and a missing bin is a problem", () => {
  assert.deepEqual(
    tarballProblems({ name: "@scope/pkg", bin: "cli.js" }, ["package.json"]),
    ["bin `pkg` points at cli.js, which is not in the tarball"],
  );
  assert.deepEqual(tarballProblems({ name: "x" }, ["package.json"]), [
    "package.json declares no `bin`",
  ]);
});

test("installedLaunch runs what each installer put in place", () => {
  const c = path.join("tmp", "consumer");
  const bin = {
    command: "mcp-server-memory",
    packageName: "@modelcontextprotocol/server-memory",
    target: "dist/index.js",
  };
  assert.deepEqual(installedLaunch("ts", c, bin, "linux"), {
    command: path.join(c, "node_modules", ".bin", "mcp-server-memory"),
    args: [],
  });
  assert.deepEqual(
    installedLaunch("py", c, { command: "mcp-server-time" }, "darwin"),
    { command: path.join(c, ".venv", "bin", "mcp-server-time"), args: [] },
  );
  assert.deepEqual(
    installedLaunch("py", c, { command: "mcp-server-time" }, "win32"),
    {
      command: path.join(c, ".venv", "Scripts", "mcp-server-time.exe"),
      args: [],
    },
  );
});

test("installedLaunch hands node the bin file on Windows, not the .cmd shim", () => {
  const c = path.join("tmp", "consumer");
  // A `.cmd` cannot be spawned without a shell, and the HTTP transports are
  // launched without one.
  assert.deepEqual(
    installedLaunch(
      "ts",
      c,
      {
        command: "mcp-server-everything",
        packageName: "@modelcontextprotocol/server-everything",
        target: "dist/index.js",
      },
      "win32",
      "node.exe",
    ),
    {
      command: "node.exe",
      args: [
        path.join(
          c,
          "node_modules",
          "@modelcontextprotocol",
          "server-everything",
          "dist/index.js",
        ),
      ],
    },
  );
});

test("an artifact directory must be absent or empty; nothing is deleted", () => {
  const root = mkdtempSync(path.join(tmpdir(), "pack-out-"));
  try {
    assert.equal(artifactDirProblem(path.join(root, "absent")), null);
    const empty = path.join(root, "empty");
    mkdirSync(empty);
    assert.equal(artifactDirProblem(empty), null);
    const full = path.join(root, "full");
    mkdirSync(full);
    writeFileSync(path.join(full, "index.ts"), "source");
    assert.match(artifactDirProblem(full), /already exists and is not empty/);
    assert.match(
      artifactDirProblem(path.join(full, "index.ts")),
      /is not a directory/,
    );
    // The refusal is the whole behavior: the file is still there.
    assert.equal(existsSync(path.join(full, "index.ts")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("consumerEnv drops what would lend the server code from outside its install", () => {
  const env = consumerEnv({
    PATH: "/usr/bin",
    HOME: "/home/u",
    PYTHONPATH: "/checkout/src",
    VIRTUAL_ENV: "/checkout/.venv",
    NODE_PATH: "/checkout/node_modules",
    NODE_OPTIONS: "--require ./hook.js",
    Pythonpath: "windows-spelling",
    HTTPS_PROXY: "http://proxy",
  });
  assert.deepEqual(env, {
    PATH: "/usr/bin",
    HOME: "/home/u",
    HTTPS_PROXY: "http://proxy",
  });
});

test("only wheels and sdists are distributions", () => {
  assert.equal(
    isDistribution("mcp_server_time-2026.8.1-py3-none-any.whl"),
    true,
  );
  assert.equal(isDistribution("mcp_server_time-2026.8.1.tar.gz"), true);
  assert.equal(isDistribution(".gitignore"), false);
});

test("main rejects an unknown server or option before doing any work", async (t) => {
  const err = t.mock.method(console, "error", () => {});
  assert.equal(await main(["no-such-server"]), 2);
  assert.equal(await main(["--bogus"]), 2);
  assert.match(err.mock.calls[0].arguments[0], /unknown server/);
});
