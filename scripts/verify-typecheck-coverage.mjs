#!/usr/bin/env node
// Durable guard for the "every tracked TypeScript file gets a `tsc` pass"
// invariant (#4864, ported from the MCP Inspector, where it is inspector#1791;
// `rN` tags below are that repo's review rounds). A tsconfig project only
// typechecks the files its `include`/`files` name plus whatever those
// transitively import — so a new test, helper or config file can silently fall
// outside every project and get no type-checking. Three of this repo's four
// servers exclude their tests from the build `tsconfig.json`, which is exactly
// that hole; each workspace's `typecheck` runs `tsconfig.test.json` to close it,
// and this guard keeps it closed.
//
// For each npm workspace (read from the root `workspaces` patterns on disk, so
// a new server is required automatically) it runs every project the
// workspace's `typecheck` script names with `tsc --listFilesOnly` (the accurate
// measure — it includes import-reached files), unions the result, and asserts
// every tracked first-party `.ts`/`.tsx`/`.mts`/`.cts` under the workspace is
// in that union. Tracked TypeScript OUTSIDE every workspace (a new top-level
// location) is covered deny-by-default: it must land in the global union.
// Exits non-zero, listing the offenders, on any miss.
//
// Like its sibling it also asserts the gate is actually WIRED: each
// workspace's `typecheck` must be reachable from that workspace's `validate`,
// and the root `validate` chain must invoke each workspace's `validate` —
// otherwise the guard could measure a `typecheck` script nothing runs and stay
// green while nothing is typechecked ("gate silently stops gating").
//
// Source of truth is the `typecheck` scripts themselves — the parser reads the
// `-p`/`--project`/`-b`/`--build` args (and the implicit `./tsconfig.json` a
// bare `tsc` resolves) out of every script reachable from `typecheck`, so
// adding/removing a project is reflected here with no second list to keep in
// sync. ("Client" in the helper names below is the Inspector's word for what
// is a workspace here.)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  reachableScripts,
  rootReachesScript,
  tokenize,
} from "./lib/npm-scripts.mjs";
import {
  readWorkspaces,
  rootRunsWorkspaceValidate,
} from "./lib/workspaces.mjs";
// The `tsc --listFilesOnly` machinery lives in `lib/tsc-program.mjs`.
// `tscEntry` (the inspector#1939 Windows-safe tsc resolver) comes from the same
// module so the `--showConfig` pass below spawns tsc the same way the listings
// do.
import {
  clientTsconfigReferences,
  isDisablingFlag,
  isTsc,
  projectSourceFiles,
  resolveLeafProjects,
  tscEntry,
  typecheckProjects,
} from "./lib/tsc-program.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// Workspaces this guard deliberately does NOT gate, with the reason. The escape
// hatch for a genuinely-ungateable workspace. Empty, and meant to stay so: an
// exemption is wider than any gate it defers to.
const EXEMPT = new Map();

// TypeScript source extensions this guard requires a tsc pass for. Matches its
// sibling's TS set (`verify-format-coverage.mjs`), so a workspace `.mts`/`.cts`
// is gated too. Ambient declaration files are excluded: an unreferenced
// `*.d.{ts,mts,cts}` shim is type-only and not a real gap. There are no
// `.mts`/`.cts` files today; this pre-empts one.
export const isRequiredSource = (rel) =>
  /\.(ts|tsx|mts|cts)$/.test(rel) && !/\.d\.(ts|mts|cts)$/.test(rel);

/**
 * Whether a tracked test file is matched by one of the `test:scripts` command's
 * globs. Delegates to node's own `path.matchesGlob` (22.5.0+; the repo floor is
 * `>=22.19.0`) rather than hand-translating the glob to a RegExp — `node --test`
 * is the thing whose matching we're modeling, so measuring with node's matcher
 * is exact for every form it accepts (`**` incl. zero depth, `*`, `?` as exactly
 * one non-separator char, brace alternation, character classes) instead of
 * false-failing on whichever form the translator hadn't covered yet.
 */
export const matchesTestGlob = (file, glob) => path.matchesGlob(file, glob);

// `node --test` flags that make it execute only PART of the suite its globs
// match, while still exiting 0. This is `--noCheck` for the test runner: the
// gate runs, but gates less than it appears to.
const NARROWING_TEST_FLAGS = new Set([
  "--test-shard",
  "--test-only",
  "--test-name-pattern",
  "--test-skip-pattern",
]);

// `node --test` flags whose VALUE is a separate token — never a positional glob.
const VALUE_TAKING_TEST_FLAGS = new Set([
  "--test-coverage-include",
  "--test-coverage-exclude",
  "--test-reporter",
  "--test-reporter-destination",
  "--test-name-pattern",
  "--test-skip-pattern",
  "--test-shard",
  // Threshold flags: numeric values, so harvesting one is inert rather than a
  // suppression (a number can't be a BROADER glob) — listed for completeness.
  "--test-coverage-lines",
  "--test-coverage-branches",
  "--test-coverage-functions",
]);

/**
 * The path/glob arguments `test:scripts` hands `node --test`, harvested across
 * every script reachable FROM it — not just its own literal string. A delegating
 * `test:scripts` ("npm run test:scripts:lib && npm run test:scripts:guard", the
 * way other scripts here split) genuinely runs every test, and reading the one
 * string would instead harvest `npm`/`run`/`test:scripts:lib` and report each
 * test file as unmatched with unfollowable advice. Reachability also picks up a
 * `pretest:scripts` hook for free.
 *
 * Scoped per COMMAND SEGMENT to the ones that actually invoke `node --test`,
 * exactly as `typecheckProjects` gates on `tokens.some(isTsc)` before harvesting
 * `-p` args. Without that scoping a glob belonging to a *neighbouring* command
 * is attributed to the test runner — and since `.some()` only needs ONE glob to
 * match, a broader one silently suppresses a real miss rather than adding an
 * inert pattern. A `pretest:scripts` of `prettier --check "scripts/**\/*.mjs"`
 * is enough to do it: that glob matches a renamed `*.spec.mjs`, so the rename
 * `node --test` skips would pass the check. Reachability widened what's read;
 * this keeps what's *harvested* to the runner's own arguments.
 *
 * Within a kept segment only the POSITIONAL args count. `--test-coverage-include
 * "scripts/**\/*.mjs"` is the same suppression one level in — a glob-valued flag
 * broader than the test glob, which would vouch for the very file the runner
 * skips (and it's the obvious next addition here, since `scripts/` sits outside
 * the ≥90 coverage gate). A leading `./` is normalized off because `git ls-files`
 * emits none, so `./scripts/…` — the common npm-script idiom, which `node --test`
 * accepts — would otherwise match nothing and blame every file for a rename that
 * never happened (`rootRunsClientValidate` normalizes it for the same reason).
 */
const testRunnerSegments = (scripts) =>
  [...reachableScripts(scripts, "test:scripts")]
    .map((n) => scripts?.[n])
    .filter((c) => typeof c === "string")
    .flatMap((c) => c.split(/&&|\|\||;/))
    .map((segment) => tokenize(segment))
    .filter((tokens) => tokens.includes("--test")); // only `node --test` names test files

export const testScriptGlobs = (scripts) =>
  testRunnerSegments(scripts)
    .flatMap((tokens) =>
      tokens.filter(
        (t, i) =>
          !t.startsWith("-") &&
          t !== "node" &&
          !VALUE_TAKING_TEST_FLAGS.has(tokens[i - 1]),
      ),
    )
    .map((g) => g.replace(/^\.\//, ""));

/**
 * Suite-narrowing flags the `test:scripts` runner is given. The other three axes
 * ask whether the tests are RUN, whether there are any, and whether the runner
 * is told about each — none asks what it then DOES with them. `--test-shard 1/2`
 * keeps every glob intact and executes half the suite, exiting 0; `--test-only`
 * and the name/skip patterns are the same shape. Three of these are already in
 * `VALUE_TAKING_TEST_FLAGS` — the guard knew them well enough to drop their
 * values, but not that they shrink the run.
 *
 * Known boundary: COMPLEMENTARY shards (`--test-shard 1/2` and `2/2` in two
 * reachable scripts) do run the whole suite, and this flags them anyway. Fail-
 * safe, and nobody shards a sub-100ms suite; reconstructing shard arithmetic to
 * allow it would cost more than the case is worth.
 */
export const testScriptNarrowingFlags = (scripts) =>
  testRunnerSegments(scripts)
    .flat()
    // `--flag=value` and `--flag value` both report as the bare flag name.
    .map((t) => t.split("=")[0])
    .filter((t) => NARROWING_TEST_FLAGS.has(t));

/**
 * Whether a tracked `scripts/` file is one of this guard's own test files, by
 * CONTENT rather than name: a JS file that registers tests with `node:test` is
 * a test whatever it's called.
 *
 * Deciding it by name would key the required set off the same pattern the
 * `test:scripts` glob uses, so a rename escaping BOTH is invisible to every axis
 * — a dot→hyphen slip (`npm-scripts.test.mjs` → `npm-scripts-test.mjs`) drops
 * the file from `testFiles` entirely, so nothing asks whether the runner is told
 * about it, and the surviving file satisfies the non-empty axis. Round 30 fixed
 * "renamed to a form the GLOB misses" by broadening the name pattern; a fifth
 * name pattern only moves that boundary again. `node --test` decides what a test
 * is by whether it registers tests, so read that instead of guessing.
 */
// The extension half, alone: `main()` needs it BEFORE reading a file, and the
// predicate needs it as part of its contract. One definition, two positions.
export const isJsFile = (file) => /\.(c|m)?js$/.test(file);

export const isScriptsTestFile = (file, source) =>
  isJsFile(file) &&
  // Node's actual criterion is REGISTERING tests, not mentioning the module: a
  // shared helper importing `node:test`'s `mock` registers none, and telling it
  // to rename itself to `*.test.mjs` would only make node run an empty file.
  /(?:\bfrom|\brequire\(\s*)\s*["']node:test["']/.test(source) &&
  /\b(?:test|it|describe|suite)\s*\(/.test(source);

/**
 * Gate-integrity problems with `test:scripts` — this guard's OWN parser tests —
 * given the root `scripts` and the tracked `scripts/**` test files. Vouched for
 * the same way the guard vouches for a `tsc` pass, on three axes: it must be run
 * from `validate`, its file set must be non-empty, and every one of those files
 * must be matched by a glob the runner is actually given — because `node --test`
 * SKIPS a file its glob misses and still exits 0, so a rename to `*.spec.mjs`
 * would shrink the suite with a green run.
 *
 * Pure, and separate from `main()`, so each branch below is reachable from the
 * test suite: every previous round put the newest branch inside `main()`, where
 * mutation testing found it untested three rounds running.
 */
export function testScriptProblems(scripts, testFiles) {
  if (!rootReachesScript(scripts, "test:scripts"))
    return [
      "the root `validate` no longer runs `test:scripts` — the guard's own parser tests run nowhere; restore it.",
    ];
  const problems = [];
  if (testFiles.length === 0)
    problems.push(
      "no `scripts/**/*.test.*` files are tracked — the guard's parser tests are gone.",
    );
  const globs = testScriptGlobs(scripts);
  if (globs.length === 0) {
    // A bare `node --test` (auto-discovery from the cwd) names no glob, and
    // `.some()` over an empty list would blame every file individually with
    // advice none of them can follow. Say the actual problem once instead.
    problems.push(
      '`test:scripts` names no path/glob — this guard can\'t tell which files `node --test` runs. Give it an explicit glob (e.g. `node --test "scripts/**/*.test.mjs"`).',
    );
    return problems;
  }
  for (const flag of testScriptNarrowingFlags(scripts))
    problems.push(
      `\`test:scripts\` passes \`${flag}\` — \`node --test\` then runs only part of the matched suite and still exits 0, so the parsers this guard gates are partly unrun. Drop it.`,
    );
  for (const f of testFiles)
    if (!globs.some((g) => matchesTestGlob(f, g)))
      problems.push(
        `${f}: not matched by the \`test:scripts\` glob — \`node --test\` won't run it (a rename to a form it skips). Rename it back to \`*.test.mjs\`.`,
      );
  return problems;
}

/**
 * How the client's `validate` runs `tsc -b` (the pass that typechecks a
 * reference client): `"ok"` (a real `tsc -b`), `"neutered"` (a `tsc -b` carrying
 * `--noCheck`/`--listFilesOnly` — lists files but checks nothing, the same hole
 * the `typecheck`-script path rejects), or `"none"` (no `tsc -b` at all).
 */
export function tscBuildStatus(scripts) {
  let status = "none";
  for (const name of reachableScripts(scripts, "validate")) {
    const cmd = scripts?.[name];
    if (typeof cmd !== "string") continue;
    for (const segment of cmd.split(/&&|\|\||;/)) {
      const tokens = tokenize(segment);
      if (!tokens.some(isTsc)) continue;
      if (!tokens.some((t) => t === "-b" || t === "--build")) continue;
      if (tokens.some(isDisablingFlag)) status = "neutered";
      else return "ok"; // a real, checking `tsc -b`
    }
  }
  return status;
}

/**
 * The workspaces this guard covers: every directory the root `workspaces`
 * patterns match (`scripts/lib/workspaces.mjs`) with a readable `package.json`
 * is required to be **enrolled** — either it declares a `typecheck` script
 * (measured through that script's projects) or its root `tsconfig.json` has
 * `references` (a `tsc -b` solution, measured through those) — **or** be in
 * {@link EXEMPT}. Anything else is a gate-integrity failure. Enumerated from
 * **disk** so it is fail-closed: a new server is auto-required, renaming the
 * `typecheck` script hard-fails rather than silently dropping the workspace,
 * and a matched directory holding tracked TypeScript but no manifest (which npm
 * would simply not treat as a workspace) hard-fails too. Returns
 * `{ clients, problems }`.
 */
function nodeClients() {
  const clients = [];
  const problems = [];
  let entries;
  try {
    entries = readWorkspaces(repoRoot);
  } catch (err) {
    problems.push(err.message);
    return { clients, problems };
  }
  for (const { dir, hasManifest } of entries) {
    if (EXEMPT.has(dir)) continue;
    let scripts;
    try {
      if (!hasManifest) throw new Error("no package.json");
      scripts = JSON.parse(
        readFileSync(path.join(repoRoot, dir, "package.json"), "utf8"),
      ).scripts;
    } catch {
      // No readable manifest. If the dir still holds tracked TS its source gets
      // no tsc pass — a gate hole; otherwise it just isn't a workspace (the
      // Python servers share `src/*` with the TypeScript ones).
      if (trackedSourceFiles(dir).length > 0)
        problems.push(
          `${dir}: holds tracked TypeScript but has no readable \`package.json\` — npm does not treat it as a workspace, so its source gets no tsc pass. Add a manifest with a \`typecheck\` (or exempt it).`,
        );
      continue;
    }
    if (
      typeof scripts?.typecheck === "string" ||
      clientTsconfigReferences(dir).length > 0
    )
      clients.push(dir);
    else
      problems.push(
        `${dir}: declares no \`typecheck\` script, has no \`tsconfig.json\` \`references\`, and isn't in the EXEMPT set — it gets no tsc pass. Add a \`typecheck\` (or exempt it with a reason).`,
      );
  }
  // A stale EXEMPT key would otherwise be asserted in the success line while
  // naming a dir that no longer exists — the exemption outliving its subject.
  const present = new Set(entries.map((e) => e.dir));
  for (const dir of EXEMPT.keys())
    if (!present.has(dir))
      problems.push(
        `${dir}: listed in EXEMPT but is not a workspace directory — remove the stale exemption.`,
      );
  return { clients, problems };
}

/**
 * Whether the tsconfig `project` sets `noCheck` (which disables type-checking as
 * thoroughly as the CLI flag, but can't be seen in the `typecheck` script
 * string). `tsc --showConfig` emits the merged compilerOptions, surfacing a
 * `noCheck` from the config or its `extends` chain. Best-effort: on any error
 * (e.g. an unreadable config, already reported elsewhere) it returns false.
 */
function projectDisablesChecking(clientDir, project) {
  try {
    const out = execFileSync(
      process.execPath,
      [tscEntry(clientDir), "-p", project, "--showConfig"],
      { cwd: path.join(repoRoot, clientDir), encoding: "utf8" },
    );
    return JSON.parse(out)?.compilerOptions?.noCheck === true;
  } catch {
    return false;
  }
}

/** Repo-relative files a project covers, following a solution config's references. */
function projectFiles(clientDir, project) {
  const covered = new Set();
  for (const leaf of resolveLeafProjects(clientDir, project))
    for (const f of projectSourceFiles(clientDir, leaf)) covered.add(f);
  return covered;
}

/**
 * The leaf projects (across `projects`, solutions expanded) that genuinely
 * type-check — i.e. minus any whose tsconfig sets `noCheck`, each of which is
 * pushed to `integrity`. Shared by both enrollment paths so a `noCheck` in a
 * referenced project is caught whether the solution was harvested from a
 * `typecheck` script or is the reference-path client's own `tsconfig.json`.
 */
function checkingLeaves(clientDir, projects, integrity) {
  const checking = [];
  // Dedup across all harvested projects (a leaf can be reached from two of them
  // — `resolveLeafProjects` only dedups within one) so a shared leaf isn't
  // reported twice, nor `--showConfig`-spawned twice.
  const seen = new Set();
  for (const project of projects)
    for (const leaf of resolveLeafProjects(clientDir, project)) {
      if (seen.has(leaf)) continue;
      seen.add(leaf);
      if (projectDisablesChecking(clientDir, leaf))
        integrity.push(
          `${clientDir}: \`${leaf}\` sets \`noCheck\` in its tsconfig — that project lists files without type-checking them, so it gates nothing.`,
        );
      else checking.push(leaf);
    }
  return checking;
}

/** Tracked first-party TS (`.ts`/`.tsx`/`.mts`/`.cts`) under a workspace (excludes build output). */
function trackedSourceFiles(clientDir) {
  const out = execFileSync(
    "git",
    ["ls-files", "*.ts", "*.tsx", "*.mts", "*.cts"],
    { cwd: path.join(repoRoot, clientDir), encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((f) => path.posix.join(clientDir, f))
    .filter(isRequiredSource)
    .filter((f) => !f.includes("/build/") && !f.includes("/dist/"));
}

/**
 * Tracked first-party TS that is not under any workspace dir (which the
 * per-workspace pass covers) — anything at a new top-level location, and any
 * root-level config written in TypeScript. Deny-by-default: such a file is
 * required without editing this guard, matching the repo-wide reach of the
 * sibling `verify-format-coverage`, and it must get a tsc pass from SOME
 * workspace project (checked against the GLOBAL union). The root tooling under
 * `scripts/` is `.mjs`, which is not in the required set.
 */
function trackedNonClientSource(workspaceDirs) {
  const out = execFileSync(
    "git",
    ["ls-files", "*.ts", "*.tsx", "*.mts", "*.cts"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter(isRequiredSource)
    .filter((f) => !f.includes("/build/") && !f.includes("/dist/"))
    .filter((f) => !workspaceDirs.some((d) => f.startsWith(`${d}/`)));
}

/**
 * The remediation footer for a set of gate-integrity problems, or `null` when
 * none of them is about the typecheck wiring. Not every phase-1 problem is: the
 * sibling-guard vouch (`verify:format-coverage`) and the `test:scripts` axes are
 * about OTHER gates, and appending `--noCheck`/`tsc -b` advice under one of them
 * sends the reader after the wrong thing. The criterion is "is this about the
 * typecheck pass at all", not "does it carry its own per-line advice" — several
 * typecheck problems do carry their own and still want the footer. Client
 * enrollment ("declares no `typecheck` script …") is therefore NOT excluded: the
 * footer's first clause is exactly its fix.
 *
 * Pure and outside `main()` on purpose — this is the third consecutive round in
 * which the newest branch in `main()` turned out to be the one mutation testing
 * couldn't reach, including the branch this function replaces.
 */
export function integrityAdvice(problems, nonTypecheckProblems) {
  const isTypecheck = (f) => !nonTypecheckProblems.includes(f);
  return problems.some(isTypecheck)
    ? "\nRestore the `typecheck` wiring (workspace `validate` → `typecheck`, root `validate` → `npm run validate --workspaces`), and drop any `--noCheck`/`--listFilesOnly`/`noCheck` from the typecheck pass."
    : null;
}

/**
 * Run the guard: enumerate clients, check gate integrity (phase 1), then file
 * coverage (phase 2). Prints its verdict and `process.exit(1)`s on any failure.
 * Called only when this file is executed directly — importing it (for tests)
 * gives access to the pure helpers above without running any of this.
 */
export function main() {
  const rootPkg = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const { clients: CLIENTS, problems: enrollmentProblems } = nodeClients();

  // -------------------------------------------------------------------------
  // Phase 1 — gate integrity: is each client's `typecheck` actually run, and
  // does it actually type-check? Reported (and exited) before the file-coverage
  // pass so a mis-wired / inert gate isn't buried under a flood of consequent
  // "in no tsconfig project" lines. Records, per client, the projects that
  // genuinely type-check, for phase 2. Boundary: does NOT detect shell-level
  // failure suppression (`… || true`, `; exit 0`).
  // -------------------------------------------------------------------------
  // A client that declares no `typecheck` and isn't exempt is a gate-integrity
  // failure (seeded so a renamed/removed `typecheck` is loud, not a silent
  // drop). If that leaves nothing enrolled AND surfaced no such problem, the
  // enumeration itself is broken (a moved `src/` dir) — fail, don't no-op.
  const integrity = [...enrollmentProblems];
  const checkingProjects = new Map();
  if (CLIENTS.length === 0 && integrity.length === 0) {
    console.error(
      "verify:typecheck-coverage — found no workspace to check. The guard would check nothing; fix the enumeration.",
    );
    process.exit(1);
  }

  // Vouch for the sibling guard — a guard can't detect being unrun itself, but the
  // two can each assert the other is still wired into `validate`, so dropping
  // either is caught here (only deleting both slips through).
  const siblingVouchIssues = [];
  if (!rootReachesScript(rootPkg.scripts, "verify:format-coverage")) {
    siblingVouchIssues.push(
      "the root `validate` no longer runs `verify:format-coverage` (its sibling guard) — restore it.",
    );
  }
  integrity.push(...siblingVouchIssues);

  const testScriptIssues = testScriptProblems(
    rootPkg.scripts,
    execFileSync("git", ["ls-files", "scripts"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean)
      // Extension first, and the read guarded: a file in the index but not the
      // worktree (`rm` without `git rm`, an ordinary mid-work state) would
      // otherwise abort phase 1 with a raw ENOENT stack, masking every real
      // finding — the round-6 precedent, where a failed `tsc` echoes its
      // diagnostic instead of dying.
      .filter(isJsFile)
      .filter((f) => {
        let src;
        try {
          src = readFileSync(path.join(repoRoot, f), "utf8");
        } catch (err) {
          console.warn(
            `verify:typecheck-coverage — skipping tracked-but-unreadable ${f}: ${err.message}`,
          );
          return false;
        }
        return isScriptsTestFile(f, src);
      }),
  );
  integrity.push(...testScriptIssues);

  for (const clientDir of CLIENTS) {
    checkingProjects.set(clientDir, []);
    if (!rootRunsWorkspaceValidate(rootPkg.scripts, clientDir)) {
      integrity.push(
        `${clientDir}: the root \`validate\` chain no longer runs its \`validate\` (expected \`npm run validate --workspaces\`) — its typecheck isn't invoked by the gate.`,
      );
      continue;
    }
    const scripts = JSON.parse(
      readFileSync(path.join(repoRoot, clientDir, "package.json"), "utf8"),
    ).scripts;

    // Reference (`tsc -b`) client — no `typecheck` script; measured through its
    // `tsconfig.json` `references`, and wired iff its `validate` runs a real
    // (checking) `tsc -b`.
    if (typeof scripts?.typecheck !== "string") {
      const status = tscBuildStatus(scripts);
      if (status !== "ok") {
        integrity.push(
          status === "neutered"
            ? `${clientDir}: its \`validate\`'s \`tsc -b\` carries \`--noCheck\`/\`--listFilesOnly\` — it lists files without type-checking them, so its references are gated by nothing.`
            : `${clientDir}: no \`typecheck\` script and its \`validate\` never runs \`tsc -b\` — its \`tsconfig.json\` references are typechecked by nothing.`,
        );
        continue;
      }
      checkingProjects.set(
        clientDir,
        checkingLeaves(
          clientDir,
          clientTsconfigReferences(clientDir),
          integrity,
        ),
      );
      continue;
    }

    if (!reachableScripts(scripts, "validate").has("typecheck")) {
      integrity.push(
        `${clientDir}: \`typecheck\` is not reachable from its \`validate\` — the typecheck it measures gates nothing.`,
      );
      continue;
    }
    const { projects, neutered } = typecheckProjects(scripts);
    for (const { project, flag } of neutered)
      integrity.push(
        `${clientDir}: its \`typecheck\` runs \`-p ${project}\` with \`${flag}\` — that pass lists files without type-checking them, so it gates nothing.`,
      );
    // Fire only when nothing was harvested at all — not when projects WERE named
    // but every one is neutered (command flag) or config-disabled (`projects` was
    // non-empty in that case; those get their own lines above).
    if (projects.length === 0 && neutered.length === 0)
      integrity.push(
        `${clientDir}: its \`typecheck\` names no \`-p <project>\` — nothing is typechecked.`,
      );
    // Resolve each harvested project to its leaves (a `tsc -b` solution expands),
    // and disable-check each leaf — so a `noCheck` in a referenced project counts.
    checkingProjects.set(
      clientDir,
      checkingLeaves(clientDir, projects, integrity),
    );
  }

  if (integrity.length > 0) {
    console.error(
      `verify:typecheck-coverage — ${integrity.length} gate-integrity issue(s): a typecheck gate is not run, or runs but checks nothing:\n`,
    );
    for (const f of integrity) console.error("  " + f);
    // NOT `enrollmentProblems`: "declares no `typecheck` script …" IS about the
    // typecheck pass, and the footer's first clause is its canonical fix.
    const advice = integrityAdvice(integrity, [
      ...siblingVouchIssues,
      ...testScriptIssues,
    ]);
    if (advice) console.error(advice);
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Phase 2 — file coverage: every tracked source file lands in a checking project.
  // ---------------------------------------------------------------------------
  let totalChecked = 0;
  const failures = [];
  const globalCovered = new Set();
  for (const clientDir of CLIENTS) {
    const covered = new Set();
    for (const project of checkingProjects.get(clientDir))
      for (const f of projectFiles(clientDir, project)) {
        covered.add(f);
        globalCovered.add(f);
      }

    const tracked = trackedSourceFiles(clientDir);
    totalChecked += tracked.length;
    for (const f of tracked)
      if (!covered.has(f)) failures.push(`${f} — in no tsconfig project`);
  }

  // First-party TS outside every workspace gets no workspace of its own;
  // require each to land in the GLOBAL union of workspace projects, so it's
  // deny-by-default rather than an allowlist that a new location could fall
  // outside.
  const otherTracked = trackedNonClientSource(CLIENTS);
  totalChecked += otherTracked.length;
  const nonClientMisses = [];
  for (const f of otherTracked)
    if (!globalCovered.has(f)) {
      nonClientMisses.push(f);
      failures.push(`${f} — in no workspace's tsconfig project`);
    }

  if (failures.length > 0) {
    console.error(
      `verify:typecheck-coverage — ${failures.length} tracked source file(s) get no \`tsc\` pass:\n`,
    );
    for (const f of failures) console.error("  " + f);
    console.error(
      "\nAdd the file to its workspace's `tsconfig.test.json` `include` (the program `typecheck` runs). Keep a test out of the build `tsconfig.json`, or the build emits it into `dist/`.",
    );
    if (nonClientMisses.some((f) => f.startsWith("scripts/")))
      console.error(
        "For root tooling under `scripts/`, keep it `.mjs` (the convention there — prettier-gated via `format:check:root`, and `.mjs` isn't in this guard's required set).",
      );
    else if (nonClientMisses.length > 0)
      console.error(
        "A TypeScript file outside every workspace needs a workspace project that includes it, or a move into the workspace that owns it.",
      );
    process.exit(1);
  }

  const exemptNote = [...EXEMPT.entries()]
    .map(([dir, reason]) => `${dir} exempt: ${reason}`)
    .join("; ");
  console.log(
    `verify:typecheck-coverage — OK: all ${totalChecked} tracked source files ` +
      `(${CLIENTS.length} workspaces + non-workspace) get a tsc pass` +
      (exemptNote ? ` (${exemptNote}).` : "."),
  );
}

// Run only when executed directly (`node scripts/verify-typecheck-coverage.mjs`);
// importing this file (tests) exposes the pure helpers without running the guard.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
