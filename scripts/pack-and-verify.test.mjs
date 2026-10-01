// Tests for the pure parts of pack-and-verify (#4873): the command line, the
// tarball check and where an installed command lives. The rest of the script
// is `npm pack`, `npm install`, `uv build` and a real server boot, which need
// the network and are exercised by running `npm run pack:verify` itself.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  installedCommand,
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

test("installedCommand finds the bin where each installer puts it", () => {
  const c = path.join("tmp", "consumer");
  assert.equal(
    installedCommand("ts", c, "mcp-server-memory", "linux"),
    path.join(c, "node_modules", ".bin", "mcp-server-memory"),
  );
  assert.equal(
    installedCommand("ts", c, "mcp-server-memory", "win32"),
    path.join(c, "node_modules", ".bin", "mcp-server-memory.cmd"),
  );
  assert.equal(
    installedCommand("py", c, "mcp-server-time", "darwin"),
    path.join(c, ".venv", "bin", "mcp-server-time"),
  );
  assert.equal(
    installedCommand("py", c, "mcp-server-time", "win32"),
    path.join(c, ".venv", "Scripts", "mcp-server-time.exe"),
  );
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
