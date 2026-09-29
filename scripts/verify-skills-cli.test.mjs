// Tests for the guaranteed authoritative-validator step (inspector#2163, Copilot).
//
// Two things are covered, and neither is reachable from an ordinary run on a
// machine that has a working, pinned CLI:
//
//   1. Which validator gets run. A local CLI is used only when it matches the
//      pin EXACTLY — accepting anything newer would mean a maintainer validates
//      against a different schema than CI, so the same `local:gate` could
//      disagree across machines, which is the failure a pin exists to prevent.
//   2. The orchestration around it. A regression in the probe, the spawn-error
//      branch, or the propagation of a rejected validator would otherwise leave
//      `test:scripts` green while this gate stopped gating.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validatorCommand, runValidator } from "./verify-skills-cli.mjs";
import {
  PINNED_CLI_VERSION,
  parseClaudeVersion,
} from "./lib/skill-manifest.mjs";

const pinned = parseClaudeVersion(PINNED_CLI_VERSION);
const at = (text) => parseClaudeVersion(text);
const npxArgs = [
  "-y",
  `@anthropic-ai/claude-code@${PINNED_CLI_VERSION}`,
  "plugin",
  "validate",
  ".claude/skills",
];

test("uses a local CLI only when it matches the pin exactly", () => {
  const cmd = validatorCommand({ version: pinned });
  assert.equal(cmd.command, "claude");
  assert.deepEqual(cmd.args, ["plugin", "validate", ".claude/skills"]);
  assert.match(cmd.via, /matches the pin/);
});

test("falls back to the pinned package for any other local version", () => {
  // Newer as well as older: a newer CLI is a DIFFERENT schema from CI's, which
  // is exactly the cross-machine disagreement the pin exists to prevent.
  const [maj, min, patch] = pinned.parts;
  for (const banner of [
    `${maj}.${min}.${patch + 1}`,
    `${maj}.${min}.${patch - 1}`,
    `${maj + 1}.0.0`,
    "2.1.232",
    // A prerelease of the pinned triple is a DIFFERENT validator schema, and
    // dropping the suffix made it compare equal (Copilot).
    `${maj}.${min}.${patch}-beta.1`,
  ]) {
    const cmd = validatorCommand({ version: at(banner) });
    assert.equal(cmd.command, "npx", `expected npx for ${banner}`);
    assert.deepEqual(cmd.args, npxArgs);
    assert.match(cmd.via, /not the pinned/);
  }
});

test("falls back to the pinned package when no CLI is present", () => {
  const cmd = validatorCommand({ version: null });
  assert.equal(cmd.command, "npx");
  assert.deepEqual(cmd.args, npxArgs);
  assert.match(cmd.via, /no local CLI/);
});

/** Collects what `runValidator` was asked to spawn. */
function harness({ probe, spawnResult }) {
  const spawned = [];
  const logs = [];
  const errors = [];
  const code = runValidator({
    probe: () => probe,
    spawn: (command, args, opts) => {
      spawned.push({ command, args, opts });
      return spawnResult;
    },
    log: (m) => logs.push(m),
    error: (m) => errors.push(m),
  });
  return { code, spawned, logs, errors };
}

const okProbe = parseClaudeVersion(PINNED_CLI_VERSION);

test("runs the local CLI and succeeds when the validator accepts", () => {
  const r = harness({ probe: okProbe, spawnResult: { status: 0 } });
  assert.equal(r.code, 0);
  assert.equal(r.spawned[0].command, "claude");
  assert.equal(r.errors.length, 0);
  assert.match(r.logs.join(), /validating \.claude\/skills via local claude/);
});

test("treats an unusable probe as no CLI at all", () => {
  // `probeClaudeVersion` already collapses ENOENT, a nonzero `--version`, and
  // unparseable output into null — this asserts what runValidator does with it.
  const r = harness({ probe: null, spawnResult: { status: 0 } });
  assert.equal(r.code, 0);
  assert.equal(r.spawned[0].command, "npx");
});

test("fails when the validator rejects the skills", () => {
  const r = harness({ probe: okProbe, spawnResult: { status: 1 } });
  assert.equal(r.code, 1);
  assert.match(r.errors.join(), /rejected the skills/);
});

test("fails when the validator cannot be spawned at all", () => {
  const r = harness({
    probe: okProbe,
    spawnResult: { error: new Error("spawn npx ENOENT") },
  });
  assert.equal(r.code, 1);
  assert.match(r.errors.join(), /could not run `claude`: spawn npx ENOENT/);
});
