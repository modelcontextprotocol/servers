#!/usr/bin/env node
// Runs `claude plugin validate` — the AUTHORITATIVE skill schema — as a
// guaranteed step, resolving the CLI rather than hoping it is installed
// (inspector#2163).
//
// Ported from the MCP Inspector (#4863); `inspector#N` references are that
// repo's issues and PRs, a bare `#N` is this repo's.
//
// `verify:skills` (inside `validate` once #4864 builds it) reimplements the parse and treats a
// missing CLI as a skip, deliberately: `npm run validate` is the fast inner
// loop, it must work offline, and a Node contributor should not need Claude Code
// installed to run it. But "skips when absent" plus "usually absent" adds up to
// "never runs", which made the acceptance criterion aspirational (Copilot).
//
// So the authoritative check gets its own step — in CI's `root-guards` job
// today, and in `local:gate` once #4871 builds it — and it does NOT skip: an already-installed CLI is used only when it matches the
// pin EXACTLY, and otherwise the pinned package is fetched with `npx -y`.
// Pinned rather than @latest because a validator that moves on its own can start
// failing a PR that changed nothing, which is how a gate loses its credibility —
// and exact rather than a floor because a newer local CLI is a DIFFERENT schema
// from CI's, which would let the same `local:gate` disagree across machines.
//
// It needs no authentication — verified against a scrubbed environment and a
// clean HOME.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeClaudeVersion } from "./lib/claude-cli.mjs";
import { winShellArgs } from "./lib/win-shell-args.mjs";
import {
  formatClaudeVersion,
  isPinnedVersion,
  parseClaudeVersion,
  PINNED_CLI_VERSION,
} from "./lib/skill-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = ".claude/skills";

/**
 * The argv that runs the pinned validator.
 *
 * A local CLI is used only when it matches `PINNED_CLI_VERSION` **exactly** —
 * same release triple and no prerelease. Accepting anything at or above a floor
 * would defeat the pin: a maintainer on a different CLI would validate against a
 * different schema than CI's, so the same `local:gate` could disagree across
 * machines, which is the failure a pin exists to prevent (Copilot). Everyone
 * else runs the pinned package.
 *
 * @param {{ version: { parts: number[], prerelease: string | null } | null }} local
 * @returns {{ command: string, args: string[], via: string }}
 */
export function validatorCommand({ version }) {
  if (isPinnedVersion(version, PINNED_CLI_VERSION)) {
    return {
      command: "claude",
      args: ["plugin", "validate", SKILLS_DIR],
      via: `local claude ${formatClaudeVersion(version)} (matches the pin)`,
    };
  }
  const why =
    version === null
      ? "no local CLI"
      : `local CLI is ${formatClaudeVersion(version)}, not the pinned ${PINNED_CLI_VERSION}`;
  return {
    command: "npx",
    args: [
      "-y",
      `@anthropic-ai/claude-code@${PINNED_CLI_VERSION}`,
      "plugin",
      "validate",
      SKILLS_DIR,
    ],
    via: `npx @anthropic-ai/claude-code@${PINNED_CLI_VERSION} (${why})`,
  };
}

/**
 * Run the authoritative validator.
 *
 * The probe and the spawn are injected so the orchestration itself is tested:
 * on a machine with a working CLI, an actual run only ever walks the happy
 * path, so a regression in the probe, the spawn-error branch, or the
 * propagation of a rejected validator would leave `test:scripts` green while
 * this gate quietly stopped gating (Copilot).
 *
 * @param {{ probe?: () => { parts: number[], prerelease: string | null } | null,
 *           spawn?: (cmd: string, args: string[], opts: object) => {error?: Error, status?: number|null},
 *           log?: (msg: string) => void, error?: (msg: string) => void,
 *           platform?: string }} [io]
 * @returns {number} Process exit code.
 */
export function runValidator(io = {}) {
  const {
    probe = () => probeClaudeVersion(parseClaudeVersion),
    spawn = (cmd, args, opts) => spawnSync(cmd, args, opts),
    log = console.log,
    error = console.error,
    platform = process.platform,
  } = io;

  const version = probe();

  const { command, args, via } = validatorCommand({ version });
  log(`verify:skills:cli — validating ${SKILLS_DIR} via ${via}…`);

  const res = spawn(command, winShellArgs(args, platform), {
    cwd: ROOT,
    stdio: "inherit",
    shell: platform === "win32",
  });
  if (res.error) {
    error(
      `\nverify:skills:cli — could not run \`${command}\`: ${res.error.message}`,
    );
    return 1;
  }
  if (res.status !== 0) {
    error(
      "\nverify:skills:cli — `claude plugin validate` rejected the skills.",
    );
    return 1;
  }
  return 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(runValidator());
}
