// Tests for the boot smoke's table and selection logic (#4871). The smoke
// itself is the integration test (`npm run smoke` boots every server); what is
// pinned here is what a green smoke could otherwise hide: a server missing
// from the table, a transport dropped from it, a typo'd name passing as
// "nothing to do", and the launch command drifting from what a client runs.
// Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVERS,
  findUnlistedServers,
  launchSpec,
  selectTargets,
} from "./smoke-servers.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ctx = { dir: "/tmp/x", pageUrl: "http://127.0.0.1:1/" };
const byName = (name) => SERVERS.find((s) => s.name === name);

test("every server directory in the repo has a smoke entry", () => {
  assert.deepEqual(findUnlistedServers(path.join(repoRoot, "src")), []);
});

test("findUnlistedServers names a server the table lacks, either language", (t) => {
  const src = mkdtempSync(path.join(tmpdir(), "smoke-src-"));
  t.after(() => rmSync(src, { recursive: true, force: true }));
  for (const [dir, manifest] of [
    ["time", "pyproject.toml"],
    ["newpy", "pyproject.toml"],
    ["newts", "package.json"],
    ["notaserver", "README.md"],
  ]) {
    mkdirSync(path.join(src, dir));
    writeFileSync(path.join(src, dir, manifest), "");
  }
  assert.deepEqual(findUnlistedServers(src), ["newpy", "newts"]);
});

test("stdio for all seven; SSE and Streamable HTTP for everything only", () => {
  assert.equal(SERVERS.length, 7);
  for (const server of SERVERS) {
    assert.ok(server.transports.includes("stdio"), server.name);
    if (server.name !== "everything")
      assert.deepEqual(server.transports, ["stdio"], server.name);
  }
  assert.deepEqual(byName("everything").transports, [
    "stdio",
    "sse",
    "streamableHttp",
  ]);
});

test("selectTargets: no names means every server and transport", () => {
  assert.equal(selectTargets([]).length, 9);
});

test("selectTargets: named servers only, in the table's order", () => {
  assert.deepEqual(
    selectTargets(["time", "everything"]).map(
      (t) => `${t.server.name}/${t.transport}`,
    ),
    [
      "everything/stdio",
      "everything/sse",
      "everything/streamableHttp",
      "time/stdio",
    ],
  );
});

test("selectTargets: an unknown name throws rather than selecting nothing", () => {
  assert.throws(() => selectTargets(["tiem"]), /unknown server\(s\): tiem/);
});

test("launchSpec: a TypeScript server runs its built bin, with the transport where it takes one", () => {
  const everything = launchSpec(byName("everything"), "sse", ctx, "/repo");
  assert.equal(everything.command, process.execPath);
  assert.deepEqual(everything.args, [
    path.join("/repo", "src", "everything", "dist", "index.js"),
    "sse",
  ]);
  const filesystem = launchSpec(byName("filesystem"), "stdio", ctx, "/repo");
  assert.deepEqual(filesystem.args, [
    path.join("/repo", "src", "filesystem", "dist", "index.js"),
    "/tmp/x",
  ]);
});

test("launchSpec: a Python server runs its console script through uv, frozen", () => {
  const git = launchSpec(byName("git"), "stdio", ctx, "/repo");
  assert.equal(git.command, "uv");
  assert.deepEqual(git.args, [
    "run",
    "--frozen",
    "mcp-server-git",
    "--repository",
    "/tmp/x",
  ]);
  assert.equal(git.cwd, path.join("/repo", "src", "git"));
});

test("each bin the smoke launches is the one its package publishes", async () => {
  const { readFileSync } = await import("node:fs");
  for (const server of SERVERS.filter((s) => s.language === "ts")) {
    const pkg = JSON.parse(
      readFileSync(
        path.join(repoRoot, "src", server.name, "package.json"),
        "utf8",
      ),
    );
    assert.deepEqual(Object.values(pkg.bin), ["dist/index.js"], server.name);
  }
  for (const server of SERVERS.filter((s) => s.language === "py")) {
    const toml = readFileSync(
      path.join(repoRoot, "src", server.name, "pyproject.toml"),
      "utf8",
    );
    assert.match(
      toml,
      new RegExp(`^mcp-server-${server.name} = `, "m"),
      server.name,
    );
  }
});
