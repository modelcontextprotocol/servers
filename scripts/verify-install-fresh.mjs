#!/usr/bin/env node
// Guard: the root install's `node_modules` matches `package-lock.json` (#4871),
// adapted from the MCP Inspector's `verify:install-fresh` (inspector#2494).
//
// Every other dependency guard here reads MANIFESTS (`verify:dep-lockstep`
// compares declared ranges), so none of them can see a checkout whose
// `node_modules` is older than the lockfile it sits beside. That is the
// ordinary state of a long-lived checkout after `git pull` brings in a
// dependency bump and nobody re-runs `npm install`, and it fails far from its
// cause: a test pinning the new dependency's behavior goes red and reports the
// OLD behavior as a product defect. (The Inspector hit exactly that when its
// SDK moved a minor version.)
//
// `npm run local:gate` never runs `npm ci`, so without this it would test
// dependencies CI does not use. It is therefore the gate's FIRST stage: a stale
// install fails in under a second, naming `npm install`, rather than minutes
// later on a test.
//
// The Inspector's version walks five separate installs. This repo is one npm
// workspace with one lockfile, so there is one install to check; the lockfile
// can still place a copy under a workspace (`src/<server>/node_modules/…`) when
// two workspaces need different versions, so every entry that lives in a
// `node_modules` directory is compared, wherever it sits.
//
// It compares each package entry in `package-lock.json` against the `version`
// in the installed copy's own `package.json`: ground truth, rather than npm's
// hidden lockfile (`node_modules/.package-lock.json`), which records what npm
// last wrote, not what is on disk now.
//
// CI installs from scratch on every run, so this never fires there. The Python
// servers need no counterpart: `validate:py` starts each one with
// `uv sync --locked`, which brings the environment to its lockfile.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** A lockfile key names an installed copy when it sits in a `node_modules`. */
function isInstalledCopy(entryPath) {
  return (
    entryPath.startsWith("node_modules/") ||
    entryPath.includes("/node_modules/")
  );
}

/**
 * Compare a parsed lockfile against the install's `node_modules`.
 *
 * `readInstalledVersion(entryPath)` returns the installed copy's version, or
 * `undefined` when no copy is present. Returns `{ stale, missing }`:
 *
 *  - `stale`: present, but at a different version than the lockfile records.
 *  - `missing`: absent although the lockfile requires it. An `optional` or
 *    `devOptional` entry is exempt: npm skips those legitimately (a platform
 *    binary for another OS/CPU), so absence is not evidence of staleness.
 *
 * `link` entries carry no version (they point at a workspace) and are skipped,
 * as are the workspace entries themselves (`src/<server>`), which are source,
 * not an installed copy.
 */
export function compareInstall(lock, readInstalledVersion) {
  const stale = [];
  const missing = [];
  for (const [entryPath, entry] of Object.entries(lock?.packages ?? {})) {
    if (!isInstalledCopy(entryPath)) continue;
    if (entry?.link || typeof entry?.version !== "string") continue;
    const installed = readInstalledVersion(entryPath);
    if (installed === undefined) {
      if (!entry.optional && !entry.devOptional)
        missing.push({ entryPath, expected: entry.version });
    } else if (installed !== entry.version) {
      stale.push({ entryPath, expected: entry.version, installed });
    }
  }
  return { stale, missing };
}

/** The installed version at `<dir>/<entryPath>/package.json`, or `undefined`. */
function installedVersionReader(dir) {
  return (entryPath) => {
    const manifest = path.join(dir, entryPath, "package.json");
    if (!existsSync(manifest)) return undefined;
    const version = JSON.parse(readFileSync(manifest, "utf8")).version;
    return typeof version === "string" ? version : undefined;
  };
}

export function main(root = repoRoot) {
  const lockPath = path.join(root, "package-lock.json");
  if (!existsSync(lockPath)) {
    console.error(
      "verify:install-fresh — no package-lock.json at the repo root, so there is nothing to compare the install against.",
    );
    return 1;
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const { stale, missing } = compareInstall(lock, installedVersionReader(root));
  const problems = [];
  // A never-installed tree would list every package; one line says it better.
  if (missing.length > 0 && !existsSync(path.join(root, "node_modules"))) {
    problems.push("  no node_modules at all");
  } else {
    for (const s of stale)
      problems.push(
        `  ${s.entryPath}: installed ${s.installed}, lockfile ${s.expected}`,
      );
    for (const m of missing)
      problems.push(`  ${m.entryPath}: not installed, lockfile ${m.expected}`);
  }
  if (problems.length > 0) {
    console.error(
      `verify:install-fresh — the install disagrees with package-lock.json (${problems.length}):\n` +
        problems.join("\n") +
        "\n\nnode_modules is older than the lockfile beside it — usually a `git pull` that" +
        "\nbrought in a dependency bump. Run `npm install` at the repo root (one install" +
        "\ncovers every workspace). Tests run against a stale install report the OLD" +
        "\ndependency's behavior as a product failure.",
    );
    return 1;
  }
  console.log(
    `verify:install-fresh — OK (${Object.keys(lock.packages ?? {}).length} lockfile entries match node_modules)`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main());
