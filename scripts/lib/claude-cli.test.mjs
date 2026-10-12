// Tests for the one place that decides how `claude` is spawned (inspector#2163, Copilot).
//
// The behavior under test only differs ON Windows, and these run on whatever
// the contributor has — so the platform is injected rather than sniffed. A
// win32-only bug that no CI runner here executes is precisely the kind that
// ships.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claudeSpawnArgs,
  cliSpawnArgs,
  probeClaudeVersion,
  probeCliVersion,
} from "./claude-cli.mjs";

test("spawns without a shell off Windows", () => {
  const { command, args, options } = claudeSpawnArgs(
    ["plugin", "validate", ".claude/skills"],
    { cwd: "/repo" },
    "linux",
  );
  assert.equal(command, "claude");
  assert.deepEqual(args, ["plugin", "validate", ".claude/skills"]);
  assert.equal(options.shell, false);
  assert.equal(options.cwd, "/repo");
});

test("uses a shell on Windows, where the CLI is a .cmd shim", () => {
  // Node has refused shell-free `.cmd` spawns since CVE-2024-27980, so without
  // this the CLI reads as absent even when it is installed.
  const { options } = claudeSpawnArgs(["--version"], {}, "win32");
  assert.equal(options.shell, true);
});

test("quotes arguments that cmd.exe would otherwise re-parse", () => {
  const { args } = claudeSpawnArgs(["-p", "does it? (yes & no)"], {}, "win32");
  assert.deepEqual(args, ["-p", '"does it? (yes & no)"']);
  // The same arguments are untouched off Windows.
  assert.deepEqual(
    claudeSpawnArgs(["-p", "does it? (yes & no)"], {}, "linux").args,
    ["-p", "does it? (yes & no)"],
  );
});

test("probeClaudeVersion returns the parsed version on success", () => {
  const version = probeClaudeVersion(
    (t) => (t.trim() === "2.1.250" ? [2, 1, 250] : null),
    {
      spawn: () => ({ status: 0, stdout: "2.1.250" }),
      platform: "linux",
    },
  );
  assert.deepEqual(version, [2, 1, 250]);
});

test("probeClaudeVersion returns null for every unusable outcome", () => {
  for (const res of [
    { error: new Error("ENOENT") },
    { status: 1, stdout: "" },
    { status: 0, stdout: "something else" },
  ]) {
    assert.equal(
      probeClaudeVersion(() => null, { spawn: () => res, platform: "linux" }),
      null,
    );
  }
});

test("probeClaudeVersion asks for the shell on Windows", () => {
  let seen;
  probeClaudeVersion(() => [2, 1, 250], {
    spawn: (_c, _a, options) => {
      seen = options;
      return { status: 0, stdout: "2.1.250" };
    },
    platform: "win32",
  });
  assert.equal(seen.shell, true);
  assert.equal(seen.encoding, "utf8");
});

test("the generic helpers name the command they were given (inspector#2397)", () => {
  // `copilot` is an npm `.cmd` shim on Windows as well, so it takes the same
  // shell-and-quoting decision rather than a second copy of it.
  const { command, options, args } = cliSpawnArgs(
    "copilot",
    ["--prompt", "a & b"],
    {},
    "win32",
  );
  assert.equal(command, "copilot");
  assert.equal(options.shell, true);
  assert.deepEqual(args, ["--prompt", '"a & b"']);

  let spawned;
  const version = probeCliVersion("copilot", (t) => t.trim(), {
    spawn: (c) => {
      spawned = c;
      return { status: 0, stdout: "GitHub Copilot CLI 1.0.85.\n" };
    },
    platform: "linux",
  });
  assert.equal(spawned, "copilot");
  assert.equal(version, "GitHub Copilot CLI 1.0.85.");
});
