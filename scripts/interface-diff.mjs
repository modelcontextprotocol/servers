#!/usr/bin/env node
// The `everything` server's MCP interface diff (#4860), adapted from
// @SamMorrowDrums's workflow in #3260.
//
// It snapshots the public interface of two builds of `everything` (the server
// capabilities from the handshake, and its tools, prompts, resources and
// resource templates) with `mcp-server-diff`, and reports what changed between
// them: the build in this checkout (the head) against the same server built
// from a base commit. The spec refactor (#4857) leans on it: an SDK migration
// that is meant to be transparent proves it with an empty diff, and each new
// 2026-07-28 feature shows up as a reviewable one.
//
// Why a script, and not the `mcp-server-diff` GitHub Action #3260 used:
//
//   - `local:gate` must run every check CI runs, and
//     `scripts/lib/workflow-gate.test.mjs` derives that from the npm scripts a
//     workflow invokes. A check behind an action is invisible to it; a check
//     behind `npm run interface-diff` is enforced by it. CI
//     (`everything-mcp-diff.yml`) and the gate run this same file.
//   - The tool comes in as an exact-pinned root devDependency, so it is held
//     by `package-lock.json`'s integrity hash, the way every other npm
//     dependency here is, and no third-party action runs in CI at all.
//   - The action picks the base itself, as the merge-base with `origin/main`.
//     PRs here target `v2/main`, so that base is wrong; the caller names it.
//
// The base is built from a plain export of the base commit's tree (no git
// worktree is registered) under `node_modules/.cache/`, which git, Prettier and
// ESLint all ignore, and removed afterwards. It sits inside the checkout rather
// than under the system temp directory because `mcp-server-diff` splits a
// server's start command on whitespace, and a relative path from the checkout
// cannot contain any, where a temp directory under a Windows profile can.
//
// The head is NOT built here: inside `local:gate` the `validate` stage has
// already built it, and CI's root `npm ci` builds it. A missing build is an
// error, as it is for the boot smoke.
//
// Outcome:
//   - unchanged / changed: exit 0. A changed interface is information for the
//     reviewer, not a failure (#3260 ran with `fail_on_diff: false` too).
//   - error: exit 1. A server that cannot be probed, or a base that does not
//     build, is a broken check, so it fails the gate and the CI job.
//
// Usage:
//   npm run interface-diff                         # base: merge-base with origin/v2/main
//   npm run interface-diff -- --base <ref>         # any commit, tag or branch
//   npm run interface-diff -- --report-dir <dir>   # also write report.md and result.json

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { winShellArgs } from "./lib/win-shell-args.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** The server this diff covers. Start with `everything` only (#4860). */
export const SERVER_DIR = "src/everything";

/** The entry point a client launches, relative to a checkout's root. */
const ENTRY = `${SERVER_DIR}/dist/index.js`;

/** The base when none is named: where this branch left the develop line. */
export const DEFAULT_BASE_BRANCH = "origin/v2/main";

/**
 * Parse the command line.
 *
 * @param {string[]} argv
 * @returns {{ base: string | null, reportDir: string | null }}
 */
export function parseArgs(argv) {
  const opts = { base: null, reportDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith("--") ? arg.split(/=(.*)/s) : [arg];
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || v === "") throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === "--base") opts.base = value();
    else if (flag === "--report-dir") opts.reportDir = value();
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

/**
 * Turn `mcp-server-diff`'s JSON output into this diff's verdict.
 *
 * The CLI exits 1 both when the interfaces differ and when a probe fails, so
 * its exit code cannot tell a change from a broken check; the JSON can.
 *
 * @param {string} stdout what `mcp-server-diff -o json -q` printed
 * @param {string} [stderr] what it printed to stderr: a fatal error before the
 *   report goes there, so it is the reason when no report came out
 * @returns {{ status: "unchanged" | "changed" | "error", error?: string,
 *   diffs: { endpoint: string, diff: string }[],
 *   baseCounts?: object, headCounts?: object }}
 */
export function classify(stdout, stderr = "") {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      status: "error",
      error: `mcp-server-diff printed no JSON report:\n${[stderr, stdout]
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n")
        .slice(0, 2000)}`,
      diffs: [],
    };
  }
  const result = parsed?.results?.[0];
  if (!result || typeof result !== "object")
    return {
      status: "error",
      error: "mcp-server-diff reported no comparison",
      diffs: [],
    };
  const diffs = Array.isArray(result.diffs) ? result.diffs : [];
  if (result.error) {
    // `error` is the bare exception; the entry in `diffs` says which build
    // failed ("Base server probe failed: …" / "Target probe failed: …").
    const context = diffs.find((d) => d.endpoint === "error")?.diff;
    return { status: "error", error: String(context ?? result.error), diffs };
  }
  // A report without a verdict is not a pass.
  if (typeof result.hasDifferences !== "boolean")
    return {
      status: "error",
      error: "mcp-server-diff's report has no hasDifferences verdict",
      diffs,
    };
  return {
    status: result.hasDifferences ? "changed" : "unchanged",
    diffs,
    baseCounts: result.baseCounts,
    headCounts: result.targetCounts,
  };
}

/** A Markdown code fence longer than any run of backticks in `text`. */
export function fenceFor(text) {
  const longest = Math.max(
    0,
    ...[...text.matchAll(/`+/g)].map((m) => m[0].length),
  );
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * The human-readable report: the verdict first, then the counts, then each
 * part of the interface that changed as a diff.
 *
 * @param {ReturnType<typeof classify>} verdict
 * @param {{ base: string, head: string }} labels
 */
export function renderReport(verdict, { base, head }) {
  const lines = ["## `everything`: MCP interface diff", ""];
  lines.push(`Base: ${base}  `, `Head: ${head}`, "");
  if (verdict.status === "unchanged")
    lines.push("✅ **No interface changes detected.**");
  else if (verdict.status === "changed")
    lines.push(
      `⚠️ **Interface changes detected** in ${verdict.diffs.length} part(s) of the interface. Review them below to confirm they are intended.`,
    );
  else lines.push("❌ **The interface diff could not run.**");
  lines.push("");

  if (verdict.status === "error") {
    const fence = fenceFor(verdict.error ?? "");
    lines.push(fence, verdict.error ?? "", fence, "");
    return lines.join("\n");
  }

  const row = (name, c = {}) =>
    `| ${name} | ${c.tools ?? "?"} | ${c.prompts ?? "?"} | ${c.resources ?? "?"} | ${c.resourceTemplates ?? "?"} |`;
  lines.push(
    "| | Tools | Prompts | Resources | Resource templates |",
    "| --- | --- | --- | --- | --- |",
    row("Base", verdict.baseCounts),
    row("Head", verdict.headCounts),
    "",
  );

  for (const { endpoint, diff } of verdict.diffs) {
    const fence = fenceFor(diff);
    lines.push(`### ${endpoint}`, "", `${fence}diff`, diff, fence, "");
  }
  return lines.join("\n");
}

/** The last lines of a stream, for an error message; empty stays empty. */
const tail = (text) => {
  const lines = (text ?? "").trim();
  return lines ? `${lines.split("\n").slice(-25).join("\n")}\n` : "";
};

/**
 * Run a command to completion; throw with its output when it fails. Only
 * `npm` needs a shell, and only on Windows (it is a `.cmd` shim there); its
 * arguments are then quoted for `cmd.exe`. `git` is spawned without one.
 */
function run(command, args, cwd, env) {
  const shell = process.platform === "win32" && command === "npm";
  const res = spawnSync(command, shell ? winShellArgs(args) : args, {
    cwd,
    env: env ?? process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell,
  });
  if (res.error) throw res.error;
  if (res.status !== 0)
    throw new Error(
      `\`${command} ${args.join(" ")}\` exited ${res.status}:\n${tail(res.stdout)}${tail(res.stderr)}`,
    );
  return res.stdout;
}

const git = (...args) => run("git", args, repoRoot).trim();

/** The commit to compare against, as a full SHA. */
function resolveBase(base) {
  if (base) return git("rev-parse", "--verify", `${base}^{commit}`);
  try {
    git("rev-parse", "--verify", DEFAULT_BASE_BRANCH);
  } catch {
    throw new Error(
      `${DEFAULT_BASE_BRANCH} is not available to compare against. Run \`git fetch origin v2/main\`, or name a base with --base <ref>.`,
    );
  }
  return git("merge-base", "HEAD", DEFAULT_BASE_BRANCH);
}

/**
 * Build `everything` as it was at `sha` into `dir`: export the commit's tree
 * through a throwaway index (no worktree registered, the real index
 * untouched), install that workspace's locked dependencies, build it.
 */
function buildBase(sha, dir) {
  const index = `${dir}.index`;
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    run("git", ["read-tree", sha], repoRoot, env);
    run(
      "git",
      ["checkout-index", "--all", `--prefix=${dir}${path.sep}`],
      repoRoot,
      env,
    );
  } finally {
    rmSync(index, { force: true });
  }
  if (!existsSync(path.join(dir, SERVER_DIR, "package.json")))
    throw new Error(`${SERVER_DIR} does not exist at the base ${sha}`);
  run(
    "npm",
    [
      "ci",
      "--workspace",
      SERVER_DIR,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefer-offline",
    ],
    dir,
  );
  run("npm", ["run", "build", "--workspace", SERVER_DIR], dir);
}

/** Where the pinned `mcp-server-diff` CLI lives. */
function cliPath() {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve("mcp-server-diff/package.json");
  const { bin } = require("mcp-server-diff/package.json");
  const rel = typeof bin === "string" ? bin : bin["mcp-server-diff"];
  return path.join(path.dirname(manifest), rel);
}

/** A short, readable label for a commit. */
function describe(sha) {
  const subject = git("log", "-1", "--format=%s", sha);
  return `\`${sha.slice(0, 12)}\` (${subject.replaceAll("`", "'")})`;
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`interface-diff: ${err.message}`);
    return 2;
  }

  let verdict;
  let labels = { base: "(unresolved)", head: "(unresolved)" };
  const cacheRoot = path.join(repoRoot, "node_modules", ".cache");
  let work;
  try {
    if (!existsSync(path.join(repoRoot, ENTRY)))
      throw new Error(
        `${ENTRY} does not exist — build first (npm run build -w ${SERVER_DIR}).`,
      );
    const sha = resolveBase(opts.base);
    const headSha = git("rev-parse", "HEAD");
    labels = {
      base: describe(sha),
      head: `the build in this checkout, at ${describe(headSha)}`,
    };
    console.error(`interface-diff: building the base ${sha.slice(0, 12)} …`);

    mkdirSync(cacheRoot, { recursive: true });
    work = mkdtempSync(path.join(cacheRoot, "servers-interface-diff-"));
    buildBase(sha, work);

    // Both start commands are relative to the checkout, so they hold no
    // whitespace for mcp-server-diff to split on (see the header).
    const baseEntry = path
      .relative(repoRoot, path.join(work, ENTRY))
      .split(path.sep)
      .join("/");
    console.error("interface-diff: probing the base and the head …");
    const res = spawnSync(
      process.execPath,
      [
        cliPath(),
        "--base",
        `node ${baseEntry} stdio`,
        "--target",
        `node ${ENTRY} stdio`,
        "--output",
        "json",
        "--quiet",
      ],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (res.error) throw res.error;
    verdict = classify(res.stdout, res.stderr);
  } catch (err) {
    verdict = { status: "error", error: err.message, diffs: [] };
  } finally {
    if (work) rmSync(work, { recursive: true, force: true });
  }

  const report = renderReport(verdict, labels);
  console.log(report);
  if (opts.reportDir) {
    mkdirSync(opts.reportDir, { recursive: true });
    writeFileSync(path.join(opts.reportDir, "report.md"), `${report}\n`);
    writeFileSync(
      path.join(opts.reportDir, "result.json"),
      `${JSON.stringify({ status: verdict.status, diffCount: verdict.diffs.length }, null, 2)}\n`,
    );
  }
  return verdict.status === "error" ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
