#!/usr/bin/env node
// Guard: a pull request into `main` brings nothing that is not already on
// `v2/main` (#5119).
//
// `main` is the release line. The one PR that may target it is a milestone's
// merge PR, a pure merge of `v2/main` (AGENTS.md, "Contributing"). GitHub
// rulesets can require a PR and its approvals, but cannot say where a PR comes
// from, so before this guard a PR from any branch could merge into `main`.
//
// The rule is on the COMMIT, not the branch name: the PR's head must be an
// ancestor of the source (`origin/v2/main`), or the source itself. The
// `release` skill opens the merge PR from `v2/chore/<N>-release-<milestone>`,
// a branch pushed from `origin/v2/main`, so a check on the head's name would
// refuse the one PR the rule exists to allow. An ancestor rather than only an
// equal commit, because `v2/main` keeps moving while the merge PR is open, and
// the PR is still a pure merge of what it was opened with.
//
// CI runs it from `main-source.yml` on `pull_request_target`, which runs
// `main`'s copy of the workflow and of this script, so a PR cannot edit the
// guard into passing. The PR's head is only fetched as git objects; none of
// its code runs. It is not a `local:gate` stage: every local push targets a
// v2 branch, where the rule does not apply.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The branch every commit on `main` must already be on. */
export const DEFAULT_SOURCE = "origin/v2/main";

/** How many of the offending commits the report lists. */
export const MAX_LISTED = 20;

/**
 * Pure: `--head <rev>` (required) and `--source <rev>`.
 *
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const opts = { source: DEFAULT_SOURCE, head: "" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== "--source" && flag !== "--head")
      throw new Error(`unknown argument: ${flag}`);
    const value = argv[++i];
    if (!value) throw new Error(`${flag} needs a revision`);
    opts[flag.slice(2)] = value;
  }
  if (!opts.head) throw new Error("--head is required");
  return opts;
}

/**
 * Pure: the report for a head that carries commits the source does not.
 *
 * @param {{ source: string, head: string, commits: string[] }} args
 *   `commits` is `git log --oneline <source>..<head>`, one per entry
 */
export function formatReport({ source, head, commits }) {
  const n = commits.length;
  const listed = commits.slice(0, MAX_LISTED).map((c) => `  ${c}`);
  if (n > MAX_LISTED) listed.push(`  … and ${n - MAX_LISTED} more`);
  return [
    `verify:main-source: ${head} carries ${n} commit${n === 1 ? "" : "s"} that ${source} does not:`,
    ...listed,
    "",
    "A pull request into `main` must be a pure merge of `v2/main`: its head",
    "is a commit already on `v2/main`. Land the change on `v2/main` through",
    "its own PR, and it reaches `main` with the next milestone merge (the",
    "`release` skill).",
  ].join("\n");
}

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.error) throw r.error;
  return r;
}

/**
 * Check that `head` is `source` or an ancestor of it, in the repository at
 * `cwd`.
 *
 * @returns {{ code: number, output: string }}
 */
export function verifyMainSource({ source, head, cwd }) {
  for (const rev of [source, head]) {
    if (
      git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], cwd).status
    )
      return {
        code: 1,
        output:
          `verify:main-source: cannot resolve ${rev}.` +
          (rev === DEFAULT_SOURCE
            ? " Fetch it (`git fetch origin v2/main`), or name another source with --source."
            : ""),
      };
  }
  const anc = git(["merge-base", "--is-ancestor", head, source], cwd);
  if (anc.status === 0)
    return {
      code: 0,
      output: `verify:main-source: ${head} is on ${source}; nothing else comes with it.`,
    };
  if (anc.status !== 1)
    return {
      code: 1,
      output: `verify:main-source: git merge-base failed:\n${anc.stderr}`,
    };
  const log = git(
    ["log", "--oneline", "--no-decorate", `${source}..${head}`],
    cwd,
  );
  if (log.status)
    return {
      code: 1,
      output: `verify:main-source: git log failed:\n${log.stderr}`,
    };
  const commits = log.stdout.split("\n").filter((l) => l.trim() !== "");
  return { code: 1, output: formatReport({ source, head, commits }) };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`verify:main-source: ${e.message}`);
    process.exit(2);
  }
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const { code, output } = verifyMainSource({ ...opts, cwd: repoRoot });
  (code === 0 ? console.log : console.error)(output);
  process.exit(code);
}
