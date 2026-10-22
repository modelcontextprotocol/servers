#!/usr/bin/env node
// SessionStart hook: warns an agent session whose instructions are stale, or
// which started in the primary checkout (#5167).
//
// Claude Code loads `AGENTS.md` and `.claude/skills/` from the directory a
// session starts in, once, at session start. A worktree created later does not
// change what was loaded, so a session started in a stale checkout follows
// stale rules for its whole run, however fresh the branches it cuts are. The
// v2.0.0 release session did exactly that (#5159): it started in a primary
// checkout 447 commits behind `origin/v2/main` and ran three steps on a
// superseded `release` skill.
//
// So `.claude/settings.json` runs this at session start. It fetches
// `origin/v2/main` and asks whether `v2/main` has changed the instructions
// since this checkout's HEAD branched from it:
//
//   git diff --quiet HEAD...origin/v2/main -- ':/AGENTS.md' ':/.claude/'
//
// The three dots matter. They diff the merge base against `origin/v2/main`,
// so a branch that edits the instructions itself (a PR like the one that
// added this file) is not reported stale for its own edits, while a checkout
// that lacks any instruction change `v2/main` has made is.
//
// The hook never blocks the session and never fails it: whatever it prints is
// added to the session's context, and the rule in `AGENTS.md` (Issue-driven
// work style) says what the session does about it. A failed fetch (offline, a
// lock held by another session's fetch) is reported, and the check runs
// against the `origin/v2/main` already on disk rather than not at all.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The branch whose instructions a session must be running. */
export const BASE = "origin/v2/main";

/**
 * The paths Claude Code loads its instructions from at session start, as
 * pathspecs anchored at the repository root (`:/`), so the same check means
 * the same thing run from `src/git` as from the root.
 */
export const INSTRUCTION_PATHS = [":/AGENTS.md", ":/.claude/"];

/**
 * Pure: the command that re-checks, later in the session, the instructions
 * loaded at `startSha`. It names the session-start revision rather than
 * `HEAD`: once the session moves into a newer worktree, that worktree's
 * `HEAD` can match `origin/v2/main` while the rules the session holds are
 * still the ones it started with.
 *
 * @param {string} startSha
 */
export function recheckCommand(startSha) {
  const paths = INSTRUCTION_PATHS.map((p) => `'${p}'`).join(" ");
  return `git fetch origin v2/main && git diff --quiet ${startSha}...${BASE} -- ${paths} || echo STALE`;
}

/** How long the fetch may take before the check falls back to the local ref. */
export const FETCH_TIMEOUT_MS = 15_000;

/** How many changed paths a STALE report names before summarizing the rest. */
export const MAX_NAMED = 5;

/**
 * Pure: the lines to print, from what the checks found.
 *
 * @param {{
 *   fetched: boolean,
 *   baseSha: string | null,
 *   startSha: string | null,
 *   stale: boolean,
 *   changed: string[],
 *   primary: boolean,
 * }} state
 * @returns {string[]}
 */
export function report({
  fetched,
  baseSha,
  startSha,
  stale,
  changed,
  primary,
}) {
  const lines = [];
  if (!fetched)
    lines.push(
      `session-instructions-check: could not fetch ${BASE}; checking against the copy already on disk.`,
    );
  if (baseSha === null) {
    lines.push(
      `session-instructions-check: cannot resolve ${BASE}, so whether this session's AGENTS.md and skills are current is UNKNOWN. Run \`git fetch origin v2/main\` and re-check before doing anything.`,
    );
  } else if (stale) {
    const named =
      changed.length > MAX_NAMED
        ? `${changed.slice(0, MAX_NAMED).join(", ")} and ${changed.length - MAX_NAMED} more`
        : changed.join(", ");
    lines.push(
      `STALE: this session's instructions differ from ${BASE} (${baseSha.slice(0, 8)}). ` +
        `${BASE} has changed ${named} since this checkout's HEAD branched from it, ` +
        "and Claude Code loaded AGENTS.md and the skills from this checkout at session start. " +
        "Stop, and ask for a session started in a worktree freshly cut from origin/v2/main " +
        "(AGENTS.md, Issue-driven work style), rather than continuing on rules that cannot be trusted.",
    );
  } else {
    lines.push(
      `session-instructions-check: AGENTS.md and .claude/ match ${BASE} (${baseSha.slice(0, 8)}).`,
    );
  }
  if (!stale && startSha !== null)
    lines.push(
      `session-instructions-check: this session loaded its instructions at ${startSha}. ` +
        "Re-check from that revision, not from HEAD, after v2/main moves or the session changes " +
        `checkout: ${recheckCommand(startSha)}`,
    );
  if (primary)
    lines.push(
      "session-instructions-check: this session started in the primary checkout, which concurrent " +
        "sessions share. Do the work in a git worktree freshly cut from origin/v2/main, never here " +
        "(AGENTS.md, Issue-driven work style).",
    );
  return lines;
}

function git(args, cwd, opts = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", ...opts });
  return { status: r.error ? -1 : r.status, stdout: r.stdout ?? "" };
}

/**
 * Run the checks in the repository at `cwd`.
 *
 * @param {{ cwd: string, fetch?: boolean }} opts
 * @returns {string[]} the lines to print
 */
export function checkSession({ cwd, fetch = true }) {
  const fetched =
    !fetch ||
    git(["fetch", "--quiet", "origin", "v2/main"], cwd, {
      timeout: FETCH_TIMEOUT_MS,
    }).status === 0;
  const resolved = git(
    ["rev-parse", "--verify", "--quiet", `${BASE}^{commit}`],
    cwd,
  );
  const baseSha = resolved.status === 0 ? resolved.stdout.trim() : null;
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD"], cwd);
  const startSha = head.status === 0 ? head.stdout.trim() : null;

  let changed = [];
  if (baseSha !== null) {
    const diff = git(
      ["diff", "--name-only", `HEAD...${BASE}`, "--", ...INSTRUCTION_PATHS],
      cwd,
    );
    // No merge base (an unrelated history) also lands here, as a failed
    // diff: the instructions cannot be shown current, so they count as stale.
    changed =
      diff.status === 0
        ? diff.stdout.split("\n").filter(Boolean)
        : ["(no common history with HEAD)"];
  }

  // In a linked worktree the git dir is `.git/worktrees/<name>`, apart from
  // the common dir; in the primary checkout the two are the same.
  const dirs = git(
    ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
    cwd,
  ).stdout.split("\n");
  const primary = dirs.length >= 2 && dirs[0] !== "" && dirs[0] === dirs[1];

  return report({
    fetched,
    baseSha,
    startSha,
    stale: changed.length > 0,
    changed,
    primary,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  console.log(checkSession({ cwd: repoRoot }).join("\n"));
}
