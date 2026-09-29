/**
 * Unit tests for scripts/validate-py.mjs (#4865). Run with
 * `node --test scripts/validate-py.test.mjs` — no dependencies, and no `uv`
 * needed: the chain's runner is injected, and `runCommand` is exercised
 * against `node` itself.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  STEPS,
  discoverServers,
  runCommand,
  selectServers,
  summarize,
  validateServers,
} from "./validate-py.mjs";

const scratch = mkdtempSync(path.join(tmpdir(), "validate-py-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe("STEPS", () => {
  it("runs every gate the issue names, through uv, in order", () => {
    assert.deepEqual(
      STEPS.map((s) => s.name),
      [
        "sync",
        "ruff check",
        "ruff format --check",
        "pyright",
        "pytest",
        "build",
      ],
    );
    for (const step of STEPS) assert.equal(step.argv[0], "uv");
  });

  it("syncs --locked and runs every tool --frozen", () => {
    assert.ok(STEPS[0].argv.includes("--locked"));
    for (const step of STEPS.filter((s) => s.argv[1] === "run")) {
      assert.equal(step.argv[2], "--frozen", step.name);
    }
  });
});

describe("discoverServers", () => {
  it("finds only directories holding a pyproject.toml, sorted", () => {
    const src = path.join(scratch, "src");
    for (const name of ["time", "fetch", "everything", "git"]) {
      mkdirSync(path.join(src, name), { recursive: true });
    }
    for (const name of ["time", "fetch", "git"]) {
      writeFileSync(path.join(src, name, "pyproject.toml"), "");
    }
    writeFileSync(path.join(src, "everything", "package.json"), "{}");
    writeFileSync(path.join(src, "pyproject.toml"), ""); // a file, not a server
    assert.deepEqual(discoverServers(src), ["fetch", "git", "time"]);
  });
});

describe("selectServers", () => {
  const available = ["fetch", "git", "time"];

  it("defaults to every server", () => {
    assert.deepEqual(selectServers([], available), { servers: available });
  });

  it("keeps the named servers", () => {
    assert.deepEqual(selectServers(["git"], available), { servers: ["git"] });
  });

  it("rejects a name that is not a Python server", () => {
    const result = selectServers(["git", "memory"], available);
    assert.ok("error" in result);
    assert.match(result.error, /not a Python server: memory/);
  });

  it("fails when there is nothing to validate", () => {
    assert.ok("error" in selectServers([], []));
  });
});

describe("validateServers", () => {
  const steps = [
    { name: "a", argv: ["uv", "a"] },
    { name: "b", argv: ["uv", "b"] },
    { name: "c", argv: ["uv", "c"] },
  ];

  it("stops a server at its first failure and moves on to the next", () => {
    const calls = [];
    const run = (argv, cwd) => {
      calls.push(`${path.basename(cwd)}:${argv[1]}`);
      return path.basename(cwd) === "git" && argv[1] === "b"
        ? { ok: false, detail: "exit 1" }
        : { ok: true };
    };
    const results = validateServers({
      servers: ["git", "time"],
      srcDir: "/repo/src",
      steps,
      run,
      log: () => {},
    });
    assert.deepEqual(calls, ["git:a", "git:b", "time:a", "time:b", "time:c"]);
    assert.deepEqual(results, [
      { server: "git", failedStep: "b", detail: "exit 1" },
      { server: "time" },
    ]);
  });

  it("runs each step in the server's own directory", () => {
    const cwds = new Set();
    validateServers({
      servers: ["fetch"],
      srcDir: "/repo/src",
      steps,
      run: (_argv, cwd) => {
        cwds.add(cwd);
        return { ok: true };
      },
      log: () => {},
    });
    assert.deepEqual([...cwds], [path.join("/repo/src", "fetch")]);
  });

  it("logs each step with its server", () => {
    const lines = [];
    validateServers({
      servers: ["fetch"],
      srcDir: "/repo/src",
      steps: steps.slice(0, 1),
      run: () => ({ ok: true }),
      log: (line) => lines.push(line),
    });
    assert.deepEqual(lines, ["\n[validate:py] fetch: a"]);
  });
});

describe("summarize", () => {
  it("passes when every server passed", () => {
    assert.deepEqual(summarize([{ server: "git" }]), {
      lines: ["  PASS  git"],
      exitCode: 0,
    });
  });

  it("fails when any server failed, naming the step", () => {
    const { lines, exitCode } = summarize([
      { server: "fetch" },
      { server: "git", failedStep: "pyright", detail: "exit 1" },
      { server: "time", failedStep: "sync" },
    ]);
    assert.equal(exitCode, 1);
    assert.deepEqual(lines, [
      "  PASS  fetch",
      "  FAIL  git — pyright (exit 1)",
      "  FAIL  time — sync",
    ]);
  });
});

describe("runCommand", () => {
  it("succeeds on exit 0", () => {
    assert.deepEqual(runCommand([process.execPath, "-e", ""], scratch), {
      ok: true,
    });
  });

  it("reports a non-zero exit", () => {
    assert.deepEqual(
      runCommand([process.execPath, "-e", "process.exit(3)"], scratch),
      { ok: false, detail: "exit 3" },
    );
  });

  it("reports a signal", () => {
    const result = runCommand(
      [process.execPath, "-e", "process.kill(process.pid, 'SIGTERM')"],
      scratch,
    );
    assert.deepEqual(result, { ok: false, detail: "killed by SIGTERM" });
  });

  it("explains a missing executable", () => {
    const result = runCommand(["validate-py-no-such-binary"], scratch);
    assert.equal(result.ok, false);
    assert.match(result.detail, /not found on PATH/);
  });

  it("reports any other spawn error verbatim", () => {
    const notExecutable = path.join(scratch, "not-executable");
    writeFileSync(notExecutable, "", { mode: 0o644 });
    const result = runCommand([notExecutable], scratch);
    assert.equal(result.ok, false);
    assert.match(result.detail, /EACCES/);
  });
});
