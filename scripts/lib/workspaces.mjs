// The npm workspaces the root gate aggregates, and whether the root `validate`
// actually runs each one's `validate` (#4864).
//
// The Inspector's coverage guards were written for clients that each keep
// their own install and are validated with `cd clients/x && npm run validate`.
// This repo is one npm workspace instead: the root `validate` runs `npm run
// validate --workspaces`. Both guards ask the same two questions of that
// layout — which workspaces are there, and does the root chain still run each
// one — so the answers live here, once, and the two cannot disagree.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The directories the root manifest's `workspaces` patterns name, as
 * repo-relative POSIX paths, sorted. Returned whether or not each holds a
 * `package.json` (`hasManifest` says which): npm itself only treats a match
 * with a manifest as a workspace, so a caller that must notice TypeScript
 * sitting in a matched directory with no manifest — source npm would silently
 * skip — needs the ones without too.
 *
 * Supports the two pattern shapes this repo uses or would plausibly adopt: a
 * plain directory (`src/everything`) and a single trailing `*` segment
 * (`src/*`). Anything richer throws rather than guessing, so a new pattern
 * fails the guard loudly instead of quietly matching nothing.
 *
 * @param {string} repoRoot
 * @param {unknown} patterns The root manifest's `workspaces` value.
 * @returns {{ dir: string, hasManifest: boolean }[]}
 */
export function workspaceDirs(repoRoot, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0)
    throw new Error(
      "the root package.json declares no `workspaces` array — there is nothing to gate.",
    );
  const dirs = new Set();
  for (const pattern of patterns) {
    if (typeof pattern !== "string")
      throw new Error(
        `unsupported workspaces entry: ${JSON.stringify(pattern)}`,
      );
    const clean = pattern.replace(/^\.\//, "").replace(/\/$/, "");
    if (/[*?{}[\]!]/.test(clean.replace(/\/\*$/, "")))
      throw new Error(
        `unsupported workspaces pattern \`${pattern}\`: only a plain directory or a trailing \`/*\` is understood. Extend scripts/lib/workspaces.mjs.`,
      );
    if (clean.endsWith("/*")) {
      const parent = clean.slice(0, -2);
      let entries;
      try {
        entries = readdirSync(path.join(repoRoot, parent), {
          withFileTypes: true,
        });
      } catch {
        continue; // a pattern whose parent is missing matches nothing, as in npm
      }
      for (const e of entries)
        if (e.isDirectory() && e.name !== "node_modules")
          dirs.add(path.posix.join(parent, e.name));
    } else if (existsSync(path.join(repoRoot, clean))) {
      dirs.add(clean);
    }
  }
  return [...dirs].sort().map((dir) => ({
    dir,
    hasManifest: existsSync(path.join(repoRoot, dir, "package.json")),
  }));
}

/** Read the root manifest and return its workspaces (see {@link workspaceDirs}). */
export function readWorkspaces(repoRoot) {
  const pkg = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  return workspaceDirs(repoRoot, pkg.workspaces);
}

// npm's spellings of `run` (`run-script` is canonical; the rest are aliases).
const RUN = new Set(["run", "run-script", "rum", "urn"]);

/**
 * Every command segment that actually executes when `npm run <entry>` runs:
 * scripts reached through a real `npm run <name>` invocation, plus npm's
 * implicit `pre`/`post` hooks. Splitting is on `\n`, `;` and `&&` only — never
 * on `|` or `||`, so `npm run X || true` (which swallows X's failure) and
 * `true || npm run X` (which never runs it) stay whole and match nothing. The
 * same rule `scriptChainRuns` in `npm-scripts.mjs` applies to a vouch.
 */
function executedSegments(scripts, entry) {
  const seen = new Set();
  const queue = [entry];
  /** @type {string[][][]} one entry per script body, each a list of segments */
  const bodies = [];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    for (const hook of [`pre${name}`, `post${name}`])
      if (typeof scripts?.[hook] === "string") queue.push(hook);
    const body = scripts?.[name];
    if (typeof body !== "string") continue;
    const segments = [];
    bodies.push(segments);
    for (const part of body.split(/\n|;|&&/)) {
      const tokens = part.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      segments.push(tokens);
      // Follow a plain `npm run <other>` (no workspace flags) into the same
      // manifest; a workspace-scoped run executes in the workspace instead.
      if (
        tokens[0] === "npm" &&
        RUN.has(tokens[1]) &&
        tokens[2] &&
        tokens.length === 3
      )
        queue.push(tokens[2]);
    }
  }
  return bodies;
}

/**
 * Whether the root `validate` chain runs `dir`'s own `validate`, in one of the
 * forms npm offers for it:
 *
 *   - `npm run validate --workspaces` (or `-ws`) — every workspace, the form
 *     the root uses;
 *   - `npm run validate --workspace <dir>` / `--workspace=<dir>` / `-w <dir>`;
 *   - `cd <dir> && npm run validate` / `npm --prefix <dir> run validate`.
 *
 * Anything else on the command disqualifies it. In particular
 * `--if-present` is refused: it makes npm skip a workspace that has no
 * `validate` and still exit 0, which is exactly the "gate silently stops
 * gating" failure this check exists for. A `validate:fast` or any other script
 * name does not count as `validate`.
 *
 * @param {Record<string, string>} rootScripts
 * @param {string} dir Repo-relative workspace directory.
 */
export function rootRunsWorkspaceValidate(rootScripts, dir) {
  const target = path.posix.normalize(dir).replace(/\/$/, "");
  const norm = (d) =>
    path.posix.normalize(d.replace(/["']/g, "")).replace(/\/$/, "");
  for (const segments of executedSegments(rootScripts, "validate")) {
    // A `cd` holds for the rest of its own script body (npm starts every
    // script from the package root), so track it per body.
    let cwd = ".";
    for (const tokens of segments) {
      if (tokens[0] === "cd" && tokens.length === 2) {
        cwd = norm(path.posix.join(cwd, tokens[1]));
        continue;
      }
      if (tokens[0] !== "npm") continue;
      let rest = tokens.slice(1);
      let prefix = null;
      if (rest[0] === "--prefix" && rest[1]) {
        prefix = norm(path.posix.join(cwd, rest[1]));
        rest = rest.slice(2);
      }
      if (!RUN.has(rest[0]) || rest[1] !== "validate") continue;
      const flags = rest.slice(2);
      if (flags.length === 0) {
        if ((prefix ?? cwd) === target) return true;
        continue;
      }
      // Workspace flags are resolved by npm against the workspace root, not
      // the current directory, so they only count from the root itself.
      if (prefix !== null || cwd !== ".") continue;
      if (
        flags.length === 1 &&
        (flags[0] === "--workspaces" || flags[0] === "-ws")
      )
        return true;
      if (
        flags.length === 1 &&
        flags[0].startsWith("--workspace=") &&
        norm(flags[0].slice("--workspace=".length)) === target
      )
        return true;
      if (
        flags.length === 2 &&
        (flags[0] === "--workspace" || flags[0] === "-w") &&
        norm(flags[1]) === target
      )
        return true;
    }
  }
  return false;
}
