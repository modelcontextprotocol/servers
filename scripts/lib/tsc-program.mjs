// What a `tsc` project actually pulls into its program — the measurement
// `verify:typecheck-coverage` reads a workspace's programs through.
//
// Ported from the MCP Inspector for #4864; `#N` in these comments are that
// repo's issues. The Inspector shares this module with a program-level
// dependency guard that also asks which INSTALLED packages land in a program;
// this repo's dependency guard (`verify-dep-lockstep.mjs`) compares declared
// ranges instead, so that half was not ported. "Client" in the helpers' names
// and comments is the Inspector's word for what is a workspace (`src/<name>`)
// here: the unit that owns its own `package.json` and tsconfig projects.
//
// The answer comes from `tsc --listFilesOnly`: it reports every file the
// program resolves, including the ones reached only through another file's
// imports. That is the accurate measure — a tsconfig's `include` names only
// the roots.
//
// The listing is memoized per (workspace, project) for the life of the
// process. It is deliberately NOT cached to disk: a stale cache would make the
// guard measure a program that no longer exists and pass on a real miss —
// failing open, the one way a gate must never fail.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reachableScripts, tokenize } from "./npm-scripts.mjs";
import { resolveNodeBin } from "./resolve-node-bin.mjs";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

// Match `tsc` by token basename so a path-invoked binary (`node_modules/.bin/
// tsc`, `./node_modules/.bin/tsc.cmd`) counts, not just the bare `tsc` token.
export const isTsc = (t) => /(?:^|[\\/])tsc(?:\.(?:cmd|exe|ps1))?$/.test(t);

// A flag that makes a `tsc` pass list files without type-checking them (so it
// gates nothing). Case-insensitive — tsc's own option parsing is.
export const isDisablingFlag = (t) => /^--(noCheck|listFilesOnly)$/i.test(t);

/**
 * The tsconfig projects a client's `typecheck` names, harvested from **every**
 * script reachable from `typecheck` (not just the one string) so a delegating
 * `typecheck` (`npm run typecheck:src && …`) still counts — matching how
 * `verify-format-coverage.mjs` harvests globs across reachable scripts. Splits
 * each script on `&&`/`||`/`;` so a flag on one command doesn't leak onto
 * another. Each `tsc` command's project comes from `-p`/`--project` (or a
 * `-b`/`--build` path); a `tsc` command with **no** project flag resolves the
 * implicit `./tsconfig.json` (tsc's own default), so that idiomatic form counts
 * too. Returns `{ projects, neutered }`: `neutered` names any project whose own
 * command carries `--noCheck`/`--nocheck` or `--listFilesOnly` (matched
 * case-insensitively — tsc's option parsing is) — a pass that lists files
 * without type-checking them, which would otherwise satisfy the typecheck guard
 * while checking nothing.
 *
 * A harvested `tsc -b` **solution config** (`"files": []` + `references`) lists
 * nothing itself; {@link resolveLeafProjects} expands it to its references.
 *
 * Minor limitations, all unreachable with the plain `-p --noEmit` passes here:
 * the implicit-`./tsconfig.json` fallback assumes **no file operands** (`tsc
 * <file>` ignores the config and checks only that file, but would be credited
 * the whole config's file list); the `--noCheck`/`--listFilesOnly` detection
 * ignores a following boolean, so the contrived explicit `--noCheck false`
 * (checking *on*) is still treated as disabling; and the `&&`/`||`/`;` split
 * runs before tokenizing, so a quoted operator inside an arg would split
 * mid-token (project paths carry none of those).
 */
export function typecheckProjects(scripts) {
  const projects = [];
  const neutered = [];
  const isFlag = (t) => t.startsWith("-");
  const isProjectFlag = (t) => ["-p", "--project", "-b", "--build"].includes(t);
  for (const name of reachableScripts(scripts, "typecheck")) {
    const cmd = scripts?.[name];
    if (typeof cmd !== "string") continue;
    for (const segment of cmd.split(/&&|\|\||;/)) {
      const tokens = tokenize(segment);
      if (!tokens.some(isTsc)) continue; // only tsc commands name projects
      const disabling = tokens.find(isDisablingFlag);
      // A project path follows `-p`/`--project`/`-b`/`--build`; a tsc command
      // with none uses the implicit `./tsconfig.json` (tsc's own default).
      const named = [];
      for (let i = 0; i < tokens.length; i++)
        if (isProjectFlag(tokens[i]) && tokens[i + 1] && !isFlag(tokens[i + 1]))
          named.push(tokens[i + 1]);
      if (named.length === 0) named.push("tsconfig.json");
      for (const project of named) {
        if (disabling) neutered.push({ project, flag: disabling });
        else projects.push(project);
      }
    }
  }
  return { projects, neutered };
}

/**
 * The `references` paths declared in a tsconfig's raw text (a `tsc -b` solution
 * config), or `[]` if it has none / isn't parseable. Paths are as written
 * (relative to that tsconfig's own directory).
 */
export function parseTsconfigReferences(raw) {
  try {
    // Tolerate JSONC — block AND line comments + trailing commas (tsconfig
    // allows all; block comments are in fact the style of every other tsconfig
    // here). Block comments are stripped first so a `//` inside one doesn't
    // survive; a `//` inside a string value (e.g. an `https://` URL) is a
    // theoretical false strip this guard's tsconfigs never hit.
    const cfg = JSON.parse(
      raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .replace(/,(\s*[}\]])/g, "$1"),
    );
    return Array.isArray(cfg.references)
      ? cfg.references.map((r) => r?.path).filter((p) => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

export function tsconfigReferences(tsconfigRel) {
  try {
    return parseTsconfigReferences(
      readFileSync(path.join(repoRoot, tsconfigRel), "utf8"),
    );
  } catch {
    return []; // unreadable file (e.g. a directory / missing path)
  }
}

/**
 * The `references` in a workspace's root `tsconfig.json`. Non-empty for a
 * `tsc -b` solution config — the guard enrolls such a workspace through these
 * instead of exempting the whole tree. No workspace here is one today; kept so
 * that adopting project references does not silently drop a workspace.
 */
export function clientTsconfigReferences(clientDir) {
  return tsconfigReferences(path.posix.join(clientDir, "tsconfig.json"));
}

/**
 * The repo-relative tsconfig FILE a `clientDir`-relative `project` entry names.
 * A directory-form entry (`{ "path": "./packages/a" }`, or `tsc -p src`) means
 * `<dir>/tsconfig.json` — tsc's own rule.
 */
export function projectConfigFile(clientDir, project) {
  const projectRel = path.posix.join(clientDir, project);
  return projectRel.endsWith(".json")
    ? projectRel
    : path.posix.join(projectRel, "tsconfig.json");
}

/**
 * A `references` entry `ref` (written relative to `fromConfigFile`'s own
 * directory) as a `clientDir`-relative project path, the form the rest of the
 * graph walk uses.
 */
export function refToProject(clientDir, fromConfigFile, ref) {
  return path.posix.relative(
    clientDir,
    path.posix.join(path.posix.dirname(fromConfigFile), ref),
  );
}

/**
 * The leaf tsconfig projects `project` resolves to (paths relative to
 * `clientDir`): itself if it lists files (or has no `references`), else its
 * `references` expanded recursively. A `tsc -b` **solution config** (`{"files":
 * [], "references": […]}`) lists nothing under `--listFilesOnly`, so this is how
 * it's reduced to the real projects — and doing it here (not inside a single
 * caller) is what lets every consumer follow the same graph.
 */
export function resolveLeafProjects(clientDir, project, seen = new Set()) {
  if (seen.has(project)) return [];
  seen.add(project);
  // Lists first-party files → a real leaf. (An empty set is a solution config,
  // or a config that errored — either way the reference expansion below is the
  // right next step: a broken config yields no references either.)
  if (projectSourceFiles(clientDir, project).size > 0) return [project];
  const configFile = projectConfigFile(clientDir, project);
  const refs = tsconfigReferences(configFile);
  if (refs.length === 0) return [project]; // no files, no refs — itself
  return refs.flatMap((ref) =>
    resolveLeafProjects(
      clientDir,
      refToProject(clientDir, configFile, ref),
      seen,
    ),
  );
}

/**
 * The tsc JS entry a client's programs are measured with, resolved from the
 * client dir up the node_modules tree exactly as `npx --no-install tsc` walked
 * — but spawnable shell-free on Windows, where `npx` is a `.cmd` shim that
 * `execFileSync` can't start (ENOENT — #1939). A resolution failure is a hard
 * "cannot measure" error rather than an empty file set: the old ENOENT was
 * doubly silent, echoing "(no diagnostic captured)" per project and then
 * reporting every tracked file in the repo as uncovered. Cached per client;
 * exported so a consumer's own tsc pass (`verify-typecheck-coverage`'s
 * `--showConfig`) spawns the same entry the listings do.
 */
const tscEntryCache = new Map();
export function tscEntry(clientDir) {
  const cached = tscEntryCache.get(clientDir);
  if (cached) return cached;
  let entry;
  try {
    entry = resolveNodeBin("typescript", "tsc", path.join(repoRoot, clientDir));
  } catch (err) {
    console.error(
      `cannot resolve \`typescript\` from ${clientDir} (${err.message}): no tsc program can be measured. Run \`npm install\` at the repo root first.`,
    );
    process.exit(1);
  }
  tscEntryCache.set(clientDir, entry);
  return entry;
}

/**
 * Every file ONE project's program resolves, as absolute POSIX paths and with no
 * filtering at all — first-party sources, `node_modules` declarations, and the
 * out-of-repo `lib.*.d.ts` — plus the config diagnostic if `tsc` exited
 * non-zero. {@link projectSourceFiles} slices the first-party files out of it.
 * Memoized per (client, project): the same project is listed
 * by `resolveLeafProjects` and again by whichever slice the caller asks for.
 */
const listingCache = new Map();
export function rawProjectListing(clientDir, project) {
  const key = `${clientDir}|${project}`;
  const cached = listingCache.get(key);
  if (cached) return cached;
  let stdout;
  let error = null;
  try {
    stdout = execFileSync(
      process.execPath,
      [tscEntry(clientDir), "-p", project, "--listFilesOnly"],
      {
        cwd: path.join(repoRoot, clientDir),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 1 << 28,
      },
    );
  } catch (err) {
    // `--listFilesOnly` doesn't type-check, but a config error (an unreadable or
    // malformed tsconfig) still exits non-zero while printing the resolved file
    // list; keep stdout so a broken config doesn't mask what the callers measure.
    // Echo the diagnostic — the guards run before any client's own `typecheck`,
    // so this is the first place a bad `-p` config surfaces, and without the
    // reason the resulting report is misleading. tsc prints config errors
    // (`error TS…`) to stdout, so scan both streams for them.
    stdout = typeof err.stdout === "string" ? err.stdout : "";
    const streams =
      stdout + "\n" + (typeof err.stderr === "string" ? err.stderr : "");
    error = streams
      .split("\n")
      .filter((l) => /error TS\d+/.test(l))
      .join("\n")
      .trim();
    console.warn(
      `tsc -p ${project} (in ${clientDir}) exited non-zero:\n${error || "(no diagnostic captured)"}\n`,
    );
    // An empty diagnostic still has to read as failure downstream, so the
    // caller sees a string either way — never `""`.
    error ||= "(no diagnostic captured)";
  }
  const files = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((abs) => abs.split(path.sep).join("/"));
  const listing = { files, error };
  listingCache.set(key, listing);
  return listing;
}

/**
 * The `tsc` diagnostic for a project whose listing exited non-zero, or null. A
 * failed config still prints a file list — a partial, wrong one — so a consumer
 * that must not measure a program it couldn't resolve has to ask.
 */
export function projectListingError(clientDir, project) {
  return rawProjectListing(clientDir, project).error;
}

/**
 * Whether a repo-relative path is an installed file rather than a first-party
 * one. Matched by path SEGMENT, not substring, so a first-party directory whose
 * name merely embeds the word (`src/x/node_modules_fixtures/`) is not mistaken
 * for an install.
 */
const isInstalledPath = (rel) => rel.split("/").includes("node_modules");

/**
 * Repo-relative POSIX paths of the first-party files ONE project (no reference
 * expansion) typechecks. Absolute paths outside the repo root (`lib.d.ts`) and
 * anything under `node_modules` are dropped.
 */
export function projectSourceFiles(clientDir, project) {
  const covered = new Set();
  for (const abs of rawProjectListing(clientDir, project).files) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
    if (rel.startsWith("..") || isInstalledPath(rel)) continue;
    covered.add(rel);
  }
  return covered;
}
