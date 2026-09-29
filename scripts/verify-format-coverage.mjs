#!/usr/bin/env node
// Durable guard for the "every first-party source file is format-gated"
// invariant (#4864, ported from the MCP Inspector, where it is inspector#1789).
// A prettier `format:check` glob that stops covering a file fails silently —
// the file is simply skipped, not reported — so a new directory or a new
// extension can re-open the gap unnoticed. This enumerates every tracked
// JS/TS source file and asserts each is matched by at least one
// `prettier --check` glob declared in a `package.json` whose `validate` the
// root chain actually runs. Exits non-zero, listing the offenders, on any miss.
//
// Source of truth is the `format:check*` scripts themselves — this parser
// reads the globs out of them, so widening/narrowing a glob is reflected here
// with no second list to keep in sync. The manifests are the root plus every
// npm workspace (`scripts/lib/workspaces.mjs`), read from disk, so a new
// server is gated without editing this file.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  reachableScripts,
  rootReachesScript,
  tokenize,
} from "./lib/npm-scripts.mjs";
import {
  readWorkspaces,
  rootRunsWorkspaceValidate,
} from "./lib/workspaces.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// File extensions prettier formats as first-party source here. Kept in sync with
// the union of the format globs; a file with one of these extensions that no
// glob matches is the failure this guard exists to catch.
const SOURCE_EXTENSIONS = [
  "ts",
  "tsx",
  "mts",
  "cts",
  "js",
  "jsx",
  "mjs",
  "cjs",
];

// The `package.json`s whose `format:check*` scripts define the gate: the root
// (its `format:check:root`, for the root tooling) and each workspace (its own
// `format:check`). Paths are relative to the repo root; each glob resolves
// relative to its manifest's directory (prettier's cwd for that script). A
// matched workspace directory with no manifest is not a workspace to npm, so it
// has no script to harvest — any tracked source in it simply shows up below as
// ungated, which is the right report.
const WORKSPACES = (() => {
  try {
    return readWorkspaces(repoRoot)
      .filter((w) => w.hasManifest)
      .map((w) => w.dir);
  } catch (err) {
    console.error(`verify:format-coverage — ${err.message}`);
    process.exit(1);
  }
})();
const MANIFESTS = [".", ...WORKSPACES];

// prettier flags whose VALUE is the next token — a path or a name, never a glob
// of files to check. `--ignore-path ../../.prettierignore` must not be read as
// a file argument.
const VALUE_TAKING_FLAGS = new Set([
  "--ignore-path",
  "--config",
  "--plugin",
  "--parser",
  "--log-level",
  "--cache-location",
  "--cache-strategy",
  "--stdin-filepath",
]);

/**
 * Extract the path/glob args from every `prettier --check …` in a manifest's
 * scripts that is reachable from `validate`. Restricting to reachable scripts is
 * what makes the guard assert "this file is checked by CI", not merely "some
 * glob covers it".
 */
function prettierCheckArgs(scripts) {
  const reachable = reachableScripts(scripts);
  const args = [];
  for (const [name, value] of Object.entries(scripts ?? {})) {
    if (!reachable.has(name)) continue;
    if (typeof value !== "string" || !value.includes("prettier --check"))
      continue;
    // A manifest may chain `prettier --check …` inside a larger script; take the
    // segment starting at each occurrence up to the next `&&`/`||`/`;`.
    for (const segment of value.split(/&&|\|\||;/)) {
      const trimmed = segment.trim();
      if (!trimmed.startsWith("prettier --check")) continue;
      const tokens = tokenize(trimmed).slice(2); // drop `prettier` `--check`
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (VALUE_TAKING_FLAGS.has(t)) {
          i++; // skip the flag's value too
          continue;
        }
        if (t.startsWith("-")) continue; // a flag, not a path
        // A negated pattern removes files; it never adds coverage. Ignoring it
        // here errs toward reporting a file as gated that prettier skips, so
        // no first-party path is negated in any `format:check` today.
        if (t.startsWith("!")) continue;
        args.push(t);
      }
    }
  }
  return args;
}

const GLOB_CHARS = /[*?{}[\]]/;

/** Convert a prettier glob to an anchored RegExp over repo-relative POSIX paths. */
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**` (optionally `**/`) crosses path separators.
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*"; // `*` stays within a segment
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      re += "(?:";
    } else if (c === "}") {
      re += ")";
    } else if (c === ",") {
      re += "|";
    } else if (".+^$()|\\/".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

/**
 * Assert the root `validate` chain actually invokes each workspace's
 * `validate` (normally via `npm run validate --workspaces`). Without this, a
 * workspace's globs would still be harvested from its own `validate` and count
 * as coverage even if the root chain stopped running it — the same "gate
 * silently stops gating" failure as the reachable-script check, one level up.
 * Returns the workspace dirs the root chain does NOT reach.
 */
function workspacesUnreachedFromRoot() {
  const rootPkg = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  return WORKSPACES.filter(
    (dir) => !rootRunsWorkspaceValidate(rootPkg.scripts, dir),
  );
}

/** Build the set of coverage predicates from all manifests' format globs. */
function buildMatchers() {
  const matchers = [];
  for (const manifestDir of MANIFESTS) {
    const manifestPath = path.join(repoRoot, manifestDir, "package.json");
    const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const arg of prettierCheckArgs(pkg.scripts)) {
      const rel = manifestDir === "." ? arg : path.posix.join(manifestDir, arg);
      if (GLOB_CHARS.test(arg)) {
        const re = globToRegExp(rel);
        matchers.push((f) => re.test(f));
      } else {
        // A bare path: a directory prettier recurses into, or an exact file.
        matchers.push((f) => f === rel || f.startsWith(rel + "/"));
      }
    }
  }
  return matchers;
}

function trackedSourceFiles() {
  const out = execFileSync(
    "git",
    ["ls-files", ...SOURCE_EXTENSIONS.map((e) => `*.${e}`)],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

// Vouch for the sibling guards: a guard can't detect being unrun itself, so they
// form a cycle instead. This one checks the others; each of them checks only
// this one. So dropping `verify:typecheck-coverage`, `verify:dep-lockstep` or
// `verify:skills` is caught here, and dropping *this* guard is caught by any of
// them. Only removing all of them at once slips through.
const rootScripts = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
).scripts;
for (const sibling of [
  "verify:typecheck-coverage",
  "verify:dep-lockstep",
  "verify:skills",
]) {
  if (rootReachesScript(rootScripts, sibling)) continue;
  console.error(
    `verify:format-coverage — the root \`validate\` no longer runs \`${sibling}\` (its sibling guard). Restore it.`,
  );
  process.exit(1);
}

const unreachedWorkspaces = workspacesUnreachedFromRoot();
if (unreachedWorkspaces.length > 0) {
  console.error(
    `verify:format-coverage — the root \`validate\` chain does not invoke ${unreachedWorkspaces.length} workspace validation(s):\n`,
  );
  for (const dir of unreachedWorkspaces)
    console.error(
      `  ${dir} (expected \`npm run validate --workspaces\` in the root \`validate\`)`,
    );
  console.error(
    "\nA workspace whose `validate` the root chain never runs is not format-gated by it,",
  );
  console.error(
    "even though its globs exist. Restore `npm run validate --workspaces` in the root `validate`.",
  );
  process.exit(1);
}

const matchers = buildMatchers();
const files = trackedSourceFiles();
const ungated = files.filter((f) => !matchers.some((m) => m(f)));

if (ungated.length > 0) {
  console.error(
    `verify:format-coverage — ${ungated.length} tracked source file(s) are not covered by any prettier format glob:\n`,
  );
  for (const f of ungated) console.error("  " + f);
  console.error(
    "\nAdd the file's directory (or a matching glob) to the relevant `format`/`format:check` script,",
  );
  console.error(
    "or widen the extension set. Root tooling belongs under `format:check:root`; a server's source under its own `format:check`.",
  );
  process.exit(1);
}

console.log(
  `verify:format-coverage — OK: all ${files.length} tracked source files are format-gated.`,
);
