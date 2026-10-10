#!/usr/bin/env node
// Stamp today's CalVer date onto each Python server that changed since its
// last version bump (#4472).
//
// The Python servers stay on CalVer (`2026.8.1`) while the TypeScript ones move
// to semver under changesets: pip and uv have no dist-tags and always install
// the numerically highest version, so the `2026.x` line on PyPI has to keep
// climbing. What changes is WHEN the version is written. The old pipeline
// (`scripts/release.py`) stamped it inside the release run and pushed the
// result as a tag only, so `v2/main` never held the version that shipped. Now
// the version in `pyproject.toml` is the source of truth, it changes only in a
// reviewed PR, and `release.yml` publishes whatever version it finds that the
// registry does not have yet. This script is what writes that PR's content;
// `.github/workflows/prepare-python-release.yml` runs it and opens the PR.
//
// For each `src/*/pyproject.toml`:
//
//   1. Find the last commit that changed its `version` line.
//   2. If a file that ships in the package changed since then, set the version
//      to today's date and refresh `uv.lock`, which records the project's own
//      version and is installed `--locked` in CI.
//
// "Ships in the package" is read off the path: Python sources, the `py.typed`
// marker, Markdown (the README is the sdist's long description), a license
// file, and `pyproject.toml` itself (a dependency change). A test-only change does not
// count: nothing a user installs is different. Over-stamping would be harmless
// anyway, since the registry guard in `release.yml` decides what publishes;
// under-stamping is the failure that matters, because a changed package whose
// version did not move is silently not released.
//
// It is JavaScript rather than the Python it replaces so that it sits under the
// same format, lint and `node --test` checks as every other script here, with
// no second toolchain for the gate to cover. Only `uv lock` needs `uv`.
//
// stdout carries one `name: old -> new` line per stamped package, which the
// workflow uses as the PR body; everything else goes to stderr.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * The CalVer version for a date: `YEAR.MONTH.DAY`, no zero padding, in UTC so
 * the result does not depend on the runner's timezone.
 *
 * @param {Date} date
 * @returns {string}
 */
export function calver(date) {
  return `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`;
}

/**
 * Does a change to this path change what the package ships?
 *
 * @param {string} file a path relative to the package directory, POSIX-style
 * @returns {boolean}
 */
export function shipsInPackage(file) {
  const parts = file.split("/");
  if (parts.some((p) => p === "tests" || p === "test")) return false;
  const name = parts.at(-1) ?? "";
  return (
    name === "pyproject.toml" ||
    /\.(?:py|md|typed)$/.test(name) ||
    // Hatchling puts a license file in both distributions.
    /^(?:LICEN[CS]E|COPYING|NOTICE)(?:\.|$)/i.test(name)
  );
}

/**
 * The `[project]` table's `name` and `version`, read without a TOML parser:
 * both are plain one-line strings in every server here, and a manifest where
 * they are not fails loudly rather than being guessed at.
 *
 * @param {string} toml the text of a pyproject.toml
 * @returns {{ name: string, version: string }}
 */
export function readProject(toml) {
  const table = projectTable(toml);
  const field = (key) => {
    const m = new RegExp(`^${key}\\s*=\\s*"([^"]*)"\\s*(?:#.*)?$`, "m").exec(
      table.text,
    );
    if (!m)
      throw new Error(`pyproject.toml: no \`${key} = "…"\` line in [project]`);
    return m[1];
  };
  return { name: field("name"), version: field("version") };
}

/**
 * `toml` with the `[project]` version replaced, everything else byte-identical.
 *
 * @param {string} toml the text of a pyproject.toml
 * @param {string} version
 * @returns {string}
 */
export function stampVersion(toml, version) {
  const table = projectTable(toml);
  const line = /^version\s*=\s*"[^"]*"/m;
  if (!line.test(table.text))
    throw new Error('pyproject.toml: no `version = "…"` line in [project]');
  return (
    toml.slice(0, table.start) +
    table.text.replace(line, `version = "${version}"`) +
    toml.slice(table.end)
  );
}

/** The span of the `[project]` table: from its header to the next table. */
function projectTable(toml) {
  const header = /^\[project\]\s*$/m.exec(toml);
  if (!header) throw new Error("pyproject.toml: no [project] table");
  const start = header.index + header[0].length;
  const next = /^\[/m.exec(toml.slice(start));
  const end = next ? start + next.index : toml.length;
  return { start, end, text: toml.slice(start, end) };
}

function run(command, args, cwd) {
  const res = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (res.error) throw res.error;
  if (res.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} exited ${res.status} in ${cwd}: ${res.stderr.trim()}`,
    );
  return res.stdout.trim();
}

/** The real git and uv; `main` takes a replacement as a test seam. */
export const TOOLS = {
  /** The last commit that changed the version line, or "" when there is none. */
  lastVersionBump: (dir) =>
    run(
      "git",
      [
        "log",
        "-1",
        "--format=%H",
        "-G",
        "^version[[:space:]]*=",
        "--",
        "pyproject.toml",
      ],
      dir,
    ),
  /** Paths under `dir` that differ from `commit`, relative to `dir`. */
  changedSince: (dir, commit) =>
    run("git", ["diff", "--name-only", "--relative", commit, "--", "."], dir)
      .split("\n")
      .filter(Boolean),
  /** Bring `uv.lock` in line with the stamped pyproject.toml. */
  lock: (dir) => {
    run("uv", ["lock"], dir);
  },
};

/**
 * @param {object} [options]
 * @param {string} [options.root] the repository root
 * @param {Date} [options.today]
 * @param {typeof TOOLS} [options.tools]
 * @returns {number} the exit code
 */
export function main({
  root = repoRoot,
  today = new Date(),
  tools = TOOLS,
} = {}) {
  const src = path.join(root, "src");
  const packages = readdirSync(src, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(src, e.name))
    .filter((dir) => existsSync(path.join(dir, "pyproject.toml")))
    .sort();
  // A moved `src/` would otherwise read as "nothing to stamp" and the release
  // would ship no Python package without anyone being told.
  if (packages.length === 0) {
    console.error(`prepare-python-release: no pyproject.toml under ${src}`);
    return 1;
  }

  const version = calver(today);
  for (const dir of packages) {
    const manifest = path.join(dir, "pyproject.toml");
    const toml = readFileSync(manifest, "utf8");
    const { name, version: current } = readProject(toml);

    if (current === version) {
      console.error(`${name}: already at ${version}, skipping`);
      continue;
    }
    // No bump commit at all means the history is shallow or the package is
    // new. Stamp it: the registry guard makes a needless stamp harmless.
    const since = tools.lastVersionBump(dir);
    if (since && !tools.changedSince(dir, since).some(shipsInPackage)) {
      console.error(`${name}: no shipped change since ${current}, skipping`);
      continue;
    }

    writeFileSync(manifest, stampVersion(toml, version));
    tools.lock(dir);
    console.error(`${name}: ${current} -> ${version}`);
    console.log(`${name}: ${current} -> ${version}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main());
