#!/usr/bin/env node
// The MCP interface diff (#4860, extended to every server in #5428), adapted
// from @SamMorrowDrums's workflow in #3260.
//
// For each server a change touches, it snapshots the public interface of two
// builds (the server capabilities from the handshake, and its tools, prompts,
// resources and resource templates) with `mcp-server-diff`, and reports what
// changed between them: the build in this checkout (the head) against the same
// server built from a base commit. The spec refactor (#4857) leans on it: an
// SDK migration that is meant to be transparent proves it with an empty diff,
// and each new 2026-07-28 feature shows up as a reviewable one.
//
// Which servers it diffs is decided by `scripts/lib/interface-diff-servers.mjs`
// from the files changed since the base: a server's own directory, a change to
// the packages it resolves in the root lockfile, or a change to this tooling.
// CI's `changes` job asks this script for that list (`--list`) and fans out one
// matrix leg per server (`--server`); the gate runs it bare and diffs each
// selected server in turn. Both go through the same selection, so the gate
// diffs what CI diffs.
//
// Why a script, and not the `mcp-server-diff` GitHub Action #3260 used:
//
//   - `local:gate` must run every check CI runs, and
//     `scripts/lib/workflow-gate.test.mjs` derives that from the npm scripts a
//     workflow invokes. A check behind an action is invisible to it; a check
//     behind `npm run interface-diff` is enforced by it. CI
//     (`mcp-interface-diff.yml`) and the gate run this same file.
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
// cannot contain any, where a temp directory under a Windows profile can. The
// same goes for the throwaway directory a server is given as an argument.
//
// The head is NOT built here: inside `local:gate` the `validate` stage has
// already built the TypeScript servers and `validate:py` has synced each Python
// server's `.venv`; in CI the root `npm ci` builds them and a `uv sync` step
// syncs the Python one. A missing build is an error, as it is for the boot
// smoke. A Python head runs with `--no-sync` for the same reason the smoke's
// does: this check reads an environment, it does not build one.
//
// Outcome:
//   - unchanged / changed: exit 0. A changed interface is information for the
//     reviewer, not a failure (#3260 ran with `fail_on_diff: false` too). So is
//     a change that touches no server: there is nothing to diff.
//   - error: exit 1. A server that cannot be probed, or a base that does not
//     build, is a broken check, so it fails the gate and the CI job.
//
// Usage:
//   npm run interface-diff                         # base: merge-base with origin/v2/main
//   npm run interface-diff -- --base <ref>         # any commit, tag or branch
//   npm run interface-diff -- --server <name>      # this server, changed or not (repeatable)
//   npm run interface-diff -- --all                # every server, changed or not
//   npm run interface-diff -- --list               # print the selected servers as JSON; diff nothing
//   npm run interface-diff -- --report-dir <dir>   # also write <dir>/<server>/report.md and result.json

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SERVERS, selectServers } from "./lib/interface-diff-servers.mjs";
import { winShellArgs } from "./lib/win-shell-args.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** The base when none is named: where this branch left the develop line. */
export const DEFAULT_BASE_BRANCH = "origin/v2/main";

/**
 * Parse the command line.
 *
 * @param {string[]} argv
 * @returns {{ base: string | null, reportDir: string | null,
 *   servers: string[], all: boolean, list: boolean }}
 */
export function parseArgs(argv) {
  const opts = {
    base: null,
    reportDir: null,
    servers: [],
    all: false,
    list: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith("--") ? arg.split(/=(.*)/s) : [arg];
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || v === "") throw new Error(`${flag} needs a value`);
      return v;
    };
    const bare = () => {
      if (inline !== undefined) throw new Error(`${flag} takes no value`);
      return true;
    };
    if (flag === "--base") opts.base = value();
    else if (flag === "--report-dir") opts.reportDir = value();
    else if (flag === "--server") opts.servers.push(value());
    else if (flag === "--all") opts.all = bare();
    else if (flag === "--list") opts.list = bare();
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (opts.all && opts.servers.length > 0)
    throw new Error("--all and --server cannot be combined");
  const known = new Set(SERVERS.map((s) => s.name));
  const unknown = opts.servers.filter((s) => !known.has(s));
  // A typo must not read as "nothing to diff, so it passed".
  if (unknown.length > 0)
    throw new Error(
      `unknown server(s): ${unknown.join(", ")}. Known: ${[...known].join(", ")}.`,
    );
  return opts;
}

/**
 * The servers a run covers, each with the reason: every one (`--all`), the
 * named ones (`--server`), or else the ones the change touches.
 *
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {() => Parameters<typeof selectServers>[0]} changes read lazily, so
 *   naming the servers needs no git history
 * @returns {{ server: string, language: string, reason: string }[]}
 */
export function chooseServers(opts, changes) {
  const named = (reason, keep) =>
    SERVERS.filter(keep).map(({ name, language }) => ({
      server: name,
      language,
      reason,
    }));
  if (opts.all)
    return named("every server was asked for (`--all`)", () => true);
  if (opts.servers.length > 0)
    return named("it was named (`--server`)", (s) =>
      opts.servers.includes(s.name),
    );
  return selectServers(changes());
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
 * The human-readable report for one server: the verdict first, then the
 * counts, then each part of the interface that changed as a diff.
 *
 * @param {ReturnType<typeof classify>} verdict
 * @param {{ server: string, base: string, head: string, reason?: string }} labels
 */
export function renderReport(verdict, { server, base, head, reason }) {
  const lines = [`## \`${server}\`: MCP interface diff`, ""];
  lines.push(`Base: ${base}  `, `Head: ${head}`);
  if (reason) lines.push("", `Diffed because ${reason}.`);
  lines.push("");
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

/**
 * The command `mcp-server-diff` starts a server with, as one string it will
 * split on whitespace. `root` is the checkout the server is started from,
 * relative to the repository root ("" for the head), and `dir` the throwaway
 * directory, likewise relative; neither holds whitespace (see the header).
 *
 * @param {(typeof SERVERS)[number]} server
 * @param {string} root
 * @param {string} dir
 * @returns {string}
 */
export function startCommand(server, root, dir) {
  const at = (rel) => (root ? `${root}/${rel}` : rel);
  const args = server.args?.({ dir }) ?? [];
  const launch =
    server.language === "ts"
      ? ["node", at(`src/${server.name}/dist/index.js`)]
      : [
          "uv",
          "run",
          "--frozen",
          "--no-sync",
          "--project",
          at(`src/${server.name}`),
          `mcp-server-${server.name}`,
        ];
  return [...launch, ...args].join(" ");
}

/** The last lines of a stream, for an error message; empty stays empty. */
const tail = (text) => {
  const lines = (text ?? "").trim();
  return lines ? `${lines.split("\n").slice(-25).join("\n")}\n` : "";
};

/**
 * Run a command to completion; throw with its output when it fails. Only
 * `npm` needs a shell, and only on Windows (it is a `.cmd` shim there); its
 * arguments are then quoted for `cmd.exe`. `git` and `uv` are spawned without
 * one.
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
 * What changed between `sha` and this checkout as it stands: the files
 * (committed, staged, unstaged and untracked alike, since the head probed is
 * the working tree's build, both sides of a rename included) and the root
 * lockfile on each side (`null` where there is none).
 */
function changesSince(sha) {
  const lines = (text) => text.split("\n").filter(Boolean);
  let baseLock = null;
  try {
    baseLock = JSON.parse(git("show", `${sha}:package-lock.json`));
  } catch {
    // No lockfile at the base: every locked package reads as changed.
  }
  const headFile = path.join(repoRoot, "package-lock.json");
  return {
    changedFiles: [
      ...lines(git("diff", "--name-only", "--no-renames", sha)),
      ...lines(git("ls-files", "--others", "--exclude-standard")),
    ],
    baseLock,
    headLock: existsSync(headFile)
      ? JSON.parse(readFileSync(headFile, "utf8"))
      : null,
  };
}

/**
 * Export the tree of `sha` into `dir` through a throwaway index (no worktree
 * registered, the real index untouched).
 */
function exportTree(sha, dir) {
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
}

/** Why the head build of `server` cannot be probed, or null. */
function missingHead(server) {
  const dir = path.join(repoRoot, "src", server.name);
  if (server.language === "ts")
    return existsSync(path.join(dir, "dist", "index.js"))
      ? null
      : `src/${server.name}/dist/index.js does not exist — build first (npm run build -w src/${server.name}).`;
  return existsSync(path.join(dir, ".venv"))
    ? null
    : `src/${server.name}/.venv does not exist — sync first (cd src/${server.name} && uv sync --frozen --all-extras --dev).`;
}

/**
 * Build the servers as they were at the base exported into `dir`. The
 * TypeScript ones share one `npm ci` (it empties `node_modules` every time it
 * runs) and then build one by one; each Python one syncs its own `.venv`. A
 * server that fails is recorded rather than stopping the others.
 *
 * @returns {Map<string, string>} server name → why its base did not build
 */
function buildBases(servers, dir, sha) {
  const failures = new Map();
  const present = servers.filter((s) => {
    const manifest = s.language === "ts" ? "package.json" : "pyproject.toml";
    if (existsSync(path.join(dir, "src", s.name, manifest))) return true;
    failures.set(s.name, `src/${s.name} does not exist at the base ${sha}`);
    return false;
  });
  const ts = present.filter((s) => s.language === "ts");
  if (ts.length > 0) {
    try {
      run(
        "npm",
        [
          "ci",
          ...ts.flatMap((s) => ["--workspace", `src/${s.name}`]),
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--prefer-offline",
        ],
        dir,
      );
      for (const s of ts) {
        try {
          run("npm", ["run", "build", "--workspace", `src/${s.name}`], dir);
        } catch (err) {
          failures.set(s.name, err.message);
        }
      }
    } catch (err) {
      for (const s of ts) failures.set(s.name, err.message);
    }
  }
  for (const s of present.filter((p) => p.language === "py")) {
    try {
      run(
        "uv",
        ["sync", "--frozen", "--no-dev"],
        path.join(dir, "src", s.name),
      );
    } catch (err) {
      failures.set(s.name, err.message);
    }
  }
  return failures;
}

/** Where the pinned `mcp-server-diff` CLI lives. */
function cliPath() {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve("mcp-server-diff/package.json");
  const { bin } = require("mcp-server-diff/package.json");
  const rel = typeof bin === "string" ? bin : bin["mcp-server-diff"];
  return path.join(path.dirname(manifest), rel);
}

/**
 * Probe one server's base build (under `baseRoot`) and head build; the
 * verdict. `scratch` is the server's throwaway directory, shared by both
 * builds so that anything echoing it back (an allowed directory) matches.
 * Both are relative to the repository root.
 */
function probe(server, baseRoot, scratch) {
  const absScratch = path.join(repoRoot, scratch);
  mkdirSync(absScratch, { recursive: true });
  if (server.prepareGitRepo)
    run("git", ["init", "--quiet", absScratch], repoRoot);
  const env = { ...process.env, ...(server.env?.({ dir: scratch }) ?? {}) };
  const res = spawnSync(
    process.execPath,
    [
      cliPath(),
      "--base",
      startCommand(server, baseRoot, scratch),
      "--target",
      startCommand(server, "", scratch),
      "--output",
      "json",
      "--quiet",
    ],
    { cwd: repoRoot, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.error) throw res.error;
  return classify(res.stdout, res.stderr);
}

/** A short, readable label for a commit. */
function describe(sha) {
  const subject = git("log", "-1", "--format=%s", sha);
  return `\`${sha.slice(0, 12)}\` (${subject.replaceAll("`", "'")})`;
}

/** A path relative to the repository root, `/`-separated, for a start command. */
const fromRoot = (to) => path.relative(repoRoot, to).split(path.sep).join("/");

/** Write one server's report.md and result.json under `<dir>/<server>/`. */
function writeReport(dir, server, report, verdict) {
  const out = path.join(dir, server);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "report.md"), `${report}\n`);
  writeFileSync(
    path.join(out, "result.json"),
    `${JSON.stringify({ status: verdict.status, diffCount: verdict.diffs.length }, null, 2)}\n`,
  );
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`interface-diff: ${err.message}`);
    return 2;
  }

  let sha;
  let selected;
  try {
    sha = resolveBase(opts.base);
    selected = chooseServers(opts, () => changesSince(sha));
  } catch (err) {
    // Nothing is known about which servers to diff, so there is no report to
    // write: the job log carries the reason.
    console.error(`interface-diff: ${err.message}`);
    return 1;
  }
  for (const s of selected)
    console.error(`interface-diff: ${s.server}: diffed because ${s.reason}`);

  if (opts.list) {
    console.log(
      JSON.stringify(
        selected.map(({ server, language }) => ({ server, language })),
      ),
    );
    return 0;
  }
  if (selected.length === 0) {
    console.log(
      `interface-diff: no server changed since ${sha.slice(0, 12)}; nothing to diff.`,
    );
    return 0;
  }

  /** @type {Map<string, ReturnType<typeof classify>>} */
  const verdicts = new Map();
  const fail = (name, error) =>
    verdicts.set(name, { status: "error", error, diffs: [] });
  const servers = selected.map((s) => SERVERS.find((x) => x.name === s.server));
  let labels = { base: `\`${sha.slice(0, 12)}\``, head: "(unresolved)" };
  let work;
  try {
    labels = {
      base: describe(sha),
      head: `the build in this checkout, at ${describe(git("rev-parse", "HEAD"))}`,
    };
    for (const server of servers) {
      const missing = missingHead(server);
      if (missing) fail(server.name, missing);
    }
    const toBuild = servers.filter((s) => !verdicts.has(s.name));
    if (toBuild.length > 0) {
      console.error(
        `interface-diff: building ${toBuild.map((s) => s.name).join(", ")} at the base ${sha.slice(0, 12)} …`,
      );
      const cacheRoot = path.join(repoRoot, "node_modules", ".cache");
      mkdirSync(cacheRoot, { recursive: true });
      work = mkdtempSync(path.join(cacheRoot, "servers-interface-diff-"));
      const baseDir = path.join(work, "base");
      exportTree(sha, baseDir);
      const failures = buildBases(toBuild, baseDir, sha);
      for (const server of toBuild) {
        if (failures.has(server.name)) {
          fail(
            server.name,
            `The base did not build:\n${failures.get(server.name)}`,
          );
          continue;
        }
        console.error(`interface-diff: probing ${server.name} …`);
        try {
          verdicts.set(
            server.name,
            probe(
              server,
              fromRoot(baseDir),
              fromRoot(path.join(work, "scratch", server.name)),
            ),
          );
        } catch (err) {
          fail(server.name, err.message);
        }
      }
    }
  } catch (err) {
    // A failure shared by every server still unprobed (the export, say).
    for (const { name } of servers)
      if (!verdicts.has(name)) fail(name, err.message);
  } finally {
    if (work) rmSync(work, { recursive: true, force: true });
  }

  for (const { server, reason } of selected) {
    const verdict = verdicts.get(server);
    const report = renderReport(verdict, { server, reason, ...labels });
    console.log(report);
    if (opts.reportDir) writeReport(opts.reportDir, server, report, verdict);
  }
  return [...verdicts.values()].some((v) => v.status === "error") ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
