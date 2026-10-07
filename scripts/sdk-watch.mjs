#!/usr/bin/env node
// Nightly MCP SDK watch (#4874). Ported from the MCP Inspector's
// `scripts/sdk-watch.mjs` (inspector#1063), with the Python SDK added.
//
//   registry -> this sweep -> issue (labeled, milestoned) -> analysis comment -> maintainer PR -> v2/main
//
// Once a night it compares the MCP SDK packages this repo installs on
// `v2/main` with what their registries publish, and files ONE issue per SDK
// group that is behind. It files an issue, never a PR, for the reason every
// sweep here does: a bot-authored PR has no `Closes #N` and no board card.
// `.github/workflows/sdk-watch.yml` then has Claude read the upstream release
// notes against this codebase and posts that analysis on the issue.
//
// What shapes the design:
//
//  1. **Groups, by release cadence.** The TypeScript SDK's v2 packages
//     (`client`, `core`, `server`, `server-legacy`) are cut together and share
//     a version, so they share an issue. `@modelcontextprotocol/node` ships
//     from the same repository on its own version line, and the v1
//     `@modelcontextprotocol/sdk` is a separate line again, so each gets its
//     own group. The Python SDK is `mcp` on PyPI. A group only counts the
//     packages a manifest here actually declares, so the v1 and v2 groups can
//     both be listed while the servers move from one to the other.
//  2. **Compare the INSTALLED version** (the lockfile's), not the declared
//     range: a caret range can already resolve past its floor, and filing for
//     a bump `npm install` has taken is noise. The declared range is still
//     reported, since it says whether the fix is a manifest edit.
//  3. **A lockstep group targets the LOWEST `latest` across it**, the version
//     every package in it has actually reached. npm publishes a release one
//     package at a time, so a sweep landing mid-publish sees one package
//     ahead; targeting it would name a version the others lack and write a
//     marker that suppresses the real filing once the publish completes.
//  4. **A new SDK package must not go unwatched.** An
//     `@modelcontextprotocol/*` package declared by a manifest here (other
//     than this repo's own servers) that no group lists fails the sweep.
//  5. **Markers are trusted only on what the automation wrote**, because the
//     repository is public (`scripts/lib/sweep.mjs`). An outsider could
//     otherwise file and close an issue carrying the current target's marker
//     to suppress the real one, or post the analysis marker to suppress the
//     analysis.
//  6. **No board write**: the issue is filed labeled and milestoned and
//     `issue-triage` boards it, as for the other sweeps.
//
// Idempotency: the marker names the group and the target version. A second
// run the same night is a no-op. An issue closed for a target keeps
// suppressing it, so a maintainer's "not planned" is not re-argued nightly. A
// FURTHER release files a new issue and leaves a supersession comment on the
// older open one; it never closes it.
//
// "An issue exists" and "it was analyzed" are different claims. The workflow
// stamps `ANALYSIS_MARKER` on its comment, and an OPEN issue for the current
// target with no such comment from the automation is handed to the analysis
// job again, so a failed or timed-out analysis is retried rather than lost.
//
// Creating an issue cannot be undone, so each group is isolated, every issue
// is recorded the moment it exists, and the `filed` output is written from a
// `finally`: a later failure still fails the run, but never loses the record
// the analysis job reads.
//
// `--dry-run` reads everything and writes nothing: it prints each issue and
// comment it would make, labels and milestone included, and emits no
// `filed` output.
//
// The pure halves are tested directly, and `main()` through an injected spawn
// function and file reader (`sdk-watch.test.mjs`).

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import semver from "semver";
import {
  compareVersions as pep440Compare,
  isPrerelease,
  satisfies as pep440Satisfies,
} from "./lib/pep440.mjs";
import {
  SERVERS,
  SWEEP_LABELS,
  TARGET_BRANCH,
  cell,
  currentMilestone,
  isAutomationComment,
  isDryRun,
  issueComments,
  issueWriter,
  scopeLabel,
  sweepIssues,
} from "./lib/sweep.mjs";
import { parseUvLock } from "./lib/uv-lock.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SWEEP = "sdk-watch";

/** The SDK groups this sweep watches. See point 1 in the header. */
export const SDK_GROUPS = [
  {
    key: "typescript-sdk",
    label: "MCP TypeScript SDK",
    repo: "modelcontextprotocol/typescript-sdk",
    ecosystem: "npm",
    packages: [
      "@modelcontextprotocol/client",
      "@modelcontextprotocol/core",
      "@modelcontextprotocol/server",
      "@modelcontextprotocol/server-legacy",
    ],
  },
  {
    key: "typescript-sdk-node",
    label: "MCP TypeScript SDK Node.js adapter",
    repo: "modelcontextprotocol/typescript-sdk",
    ecosystem: "npm",
    packages: ["@modelcontextprotocol/node"],
  },
  {
    key: "typescript-sdk-v1",
    label: "MCP TypeScript SDK (v1)",
    repo: "modelcontextprotocol/typescript-sdk",
    ecosystem: "npm",
    packages: ["@modelcontextprotocol/sdk"],
  },
  {
    key: "python-sdk",
    label: "MCP Python SDK",
    repo: "modelcontextprotocol/python-sdk",
    ecosystem: "pypi",
    packages: ["mcp"],
  },
];

/** Every npm package under this scope is in scope for the watch. */
export const SDK_SCOPE = "@modelcontextprotocol/";

const MARKER_RE = /^<!-- sdk-watch: group=(.+?); target=(.+?) -->/;
const SUPERSEDED_MARKER_RE = /^<!-- sdk-watch:superseded-by (\d+) -->/;

/**
 * The marker the workflow's posting step puts on the analysis comment.
 * ⚠️ `.github/workflows/sdk-watch.yml` writes this exact string in shell; the
 * test suite asserts the workflow contains it, so the two cannot drift.
 */
export const ANALYSIS_MARKER = "<!-- sdk-watch:analysis -->";

/**
 * @param {{key: string}} group
 * @param {string} target
 */
export function buildMarker(group, target) {
  return `<!-- sdk-watch: group=${group.key}; target=${target} -->`;
}

/**
 * @param {string | undefined} body
 * @returns {{key: string, target: string} | null}
 */
export function parseMarker(body) {
  const match = MARKER_RE.exec(body ?? "");
  return match ? { key: match[1], target: match[2] } : null;
}

/**
 * @param {string | undefined} body
 * @returns {string | null} the issue number a supersession comment names
 */
export function parseSupersededMarker(body) {
  const match = SUPERSEDED_MARKER_RE.exec(body ?? "");
  return match ? match[1] : null;
}

/**
 * Ordering and range checks, per ecosystem.
 *
 * @param {"npm" | "pypi"} ecosystem
 */
export function versioning(ecosystem) {
  if (ecosystem === "pypi") {
    return {
      compare: pep440Compare,
      valid: (v) => {
        try {
          pep440Compare(v, v);
          return true;
        } catch {
          return false;
        }
      },
      // An empty specifier admits everything.
      admits: (version, spec) => pep440Satisfies(version, spec),
    };
  }
  return {
    compare: semver.compare,
    valid: (v) => semver.valid(v) !== null,
    admits: (version, range) =>
      semver.validRange(range) !== null && semver.satisfies(version, range),
  };
}

/**
 * @param {Array<{marker: {target: string}}>} issues
 * @param {{ecosystem: "npm" | "pypi"}} group
 */
function validTargets(issues, group) {
  const { valid } = versioning(group.ecosystem);
  return issues.filter((i) => valid(i.marker.target));
}

/**
 * Fail when a manifest declares an SDK package no group watches.
 *
 * @param {Record<string, Record<string, string>>} declaredByManifest manifest path -> package -> range
 * @param {string[]} ownPackages this repo's own package names, which are not SDKs
 * @throws naming each unwatched package
 */
export function assertEveryPackageWatched(declaredByManifest, ownPackages) {
  const watched = new Set(SDK_GROUPS.flatMap((g) => g.packages));
  const own = new Set(ownPackages);
  const unwatched = [
    ...new Set(
      Object.values(declaredByManifest).flatMap((deps) =>
        Object.keys(deps).filter(
          (name) =>
            name.startsWith(SDK_SCOPE) && !watched.has(name) && !own.has(name),
        ),
      ),
    ),
  ].sort();
  if (unwatched.length > 0) {
    throw new Error(
      `a manifest declares SDK package(s) no group in SDK_GROUPS watches: ${unwatched.join(", ")}; add them to a group, or this sweep never checks them`,
    );
  }
}

/**
 * Decide whether one group is behind.
 *
 * @param {(typeof SDK_GROUPS)[number]} group
 * @param {Array<{name: string, where: string, declared: string, installed: string | null}>} rows
 *   one per package per manifest that declares it
 * @param {Record<string, string>} latest per package
 * @returns {{group: (typeof SDK_GROUPS)[number], rows: Array<object>, target: string} | null}
 *   `null` when nothing is declared, a latest is unknown, or nothing is behind
 */
export function groupState(group, rows, latest) {
  const { compare } = versioning(group.ecosystem);
  const names = [...new Set(rows.map((r) => r.name))];
  if (names.length === 0) return null;
  const latests = names.map((n) => latest[n] ?? null);
  if (latests.some((v) => !v)) return null;
  const target = [...latests].sort(compare)[0];

  const marked = rows.map((r) => ({
    ...r,
    latest: latest[r.name],
    behind: r.installed !== null && compare(target, r.installed) > 0,
  }));
  if (!marked.some((r) => r.behind)) return null;
  return { group, rows: marked, target };
}

/** @param {NonNullable<ReturnType<typeof groupState>>} state */
export function buildIssueTitle(state) {
  return `chore(deps): upgrade the ${state.group.label} to ${state.target}`;
}

/**
 * Labels: the sweep's, plus each server a row is in, unless the rows reach
 * every server (then the issue is repository-wide and takes none).
 *
 * @param {NonNullable<ReturnType<typeof groupState>>} state
 */
export function issueLabels(state) {
  const scopes = [
    ...new Set(
      state.rows.map((r) => scopeLabel(`${r.where}/`)).filter(Boolean),
    ),
  ].sort();
  return scopes.length === SERVERS.length
    ? [...SWEEP_LABELS]
    : [...SWEEP_LABELS, ...scopes];
}

/**
 * Does adopting `target` need a manifest edit, or only a lock refresh? A row
 * whose declared range cannot be read counts as needing the edit, the
 * conservative direction.
 *
 * @param {NonNullable<ReturnType<typeof groupState>>} state
 */
export function needsManifestEdit({ group, rows, target }) {
  const { admits } = versioning(group.ecosystem);
  return rows
    .filter((r) => r.behind)
    .some((r) => {
      try {
        return !admits(target, r.declared);
      } catch {
        return true;
      }
    });
}

/** The upgrade checklist, by ecosystem and by whether a manifest moves. */
export function checklist(state) {
  const edit = needsManifestEdit(state);
  const { group, target } = state;
  if (group.ecosystem === "pypi") {
    return [
      edit
        ? `- [ ] Raise the \`${group.packages[0]}\` bound in each Python server's \`pyproject.toml\` that keeps ${target} out.`
        : `- [ ] **No manifest edit needed**: every declared range already admits ${target}.`,
      `- [ ] \`uv lock --upgrade-package ${group.packages[0]}\` in each Python server, and commit each refreshed \`uv.lock\` with the change.`,
      "- [ ] `uv run --frozen ruff format .` in each server you changed, then `npm run local:gate` at the root.",
    ];
  }
  return [
    edit
      ? `- [ ] Bump the declared range in every manifest that declares the package(s), all to the same range. A server whose published range changes needs a changeset (\`npm run changeset\`).`
      : `- [ ] **No manifest edit needed**: every declared range already admits ${target}, so this is a lockfile refresh.`,
    "- [ ] `npm install` at the root, and commit the refreshed `package-lock.json`.",
    "- [ ] `npm run format`, then `npm run local:gate`.",
  ];
}

/** @param {NonNullable<ReturnType<typeof groupState>>} state */
export function buildIssueBody(state) {
  const { group, rows, target } = state;
  const registry = group.ecosystem === "pypi" ? "PyPI" : "npm";
  const table = rows
    .map(
      (r) =>
        `| \`${cell(r.name)}\` | \`${cell(r.where)}\` | ${cell(r.declared || "(unbounded)")} | ${cell(r.installed ?? "(not installed)")} | ${cell(r.latest)} | ${r.behind ? "**yes**" : "no"} |`,
    )
    .join("\n");

  return [
    buildMarker(group, target),
    `A new **${group.label}** release is out. What is installed on \`${TARGET_BRANCH}\` is behind what ${registry} publishes.`,
    "",
    `| Package | Where | Declared | Installed on \`${TARGET_BRANCH}\` | Latest | Behind |`,
    "| --- | --- | --- | --- | --- | --- |",
    table,
    "",
    ...(rows.some((r) => r.latest !== target)
      ? [
          `> **Note.** A package above shows a \`Latest\` newer than the **${target}** this issue targets. The group releases in lockstep and ${registry} publishes one package at a time, so that is a release still being published. **${target}** is the newest version the whole group has reached; when the newer one finishes, the next sweep files its own issue.`,
          "",
        ]
      : []),
    `Release notes: https://github.com/${group.repo}/releases`,
    "",
    "Filed by the nightly SDK watch (#4874), one of this repo's issue-filing sweeps. None of them opens a PR: a bot-authored PR has no `Closes #N` and no board card. A maintainer picks this up and opens a normal PR against `v2/main`.",
    "",
    "### Upgrade checklist",
    "",
    ...checklist(state),
    "- [ ] Exercise the servers with a client (the `client-smoke` skill) if the release changes behavior they rely on.",
    "",
    "An automated review of what changed upstream, and which parts of these servers it touches, is posted as a comment below.",
    "",
    "A later run will not refile this issue. A **further** release files its own issue and leaves a supersession note here.",
  ].join("\n");
}

/**
 * The note left on an open issue a newer release has passed. It closes
 * nothing: closing is a maintainer's act.
 */
export function buildSupersededComment(newer, newerTarget, staleTarget) {
  return [
    `<!-- sdk-watch:superseded-by ${newer} -->`,
    `Superseded by #${newer}: the upstream has since released **${newerTarget}**, so upgrading to ${staleTarget} is no longer the current target.`,
    "",
    "Left open: this sweep does not close issues, since the card may already have moved. Close this one by hand if nothing here is still worth keeping.",
  ].join("\n");
}

/** Has the automation already posted its analysis on this issue? */
export function hasAnalysis(comments) {
  return comments.some(
    (c) =>
      isAutomationComment(c) && (c?.body ?? "").startsWith(ANALYSIS_MARKER),
  );
}

/**
 * The `$GITHUB_OUTPUT` line naming the issues the analysis job should read.
 *
 * @param {Array<{issue: number, label: string, repo: string, from: string, to: string}>} filed
 */
export function formatFiledOutput(filed) {
  return `filed=${JSON.stringify(filed)}`;
}

/**
 * Every manifest's declared SDK ranges, with where each copy is installed.
 *
 * @param {(file: string) => string} readFile repo-relative
 * @param {(file: string) => boolean} exists repo-relative
 */
export function readInstalls(readFile, exists) {
  const npmManifests = [
    "package.json",
    ...SERVERS.map((s) => `src/${s}/package.json`).filter(exists),
  ];
  const declaredByManifest = {};
  const ownPackages = [];
  for (const manifest of npmManifests) {
    const json = JSON.parse(readFile(manifest));
    if (json.name) ownPackages.push(json.name);
    declaredByManifest[manifest] = {
      ...json.peerDependencies,
      ...json.optionalDependencies,
      ...json.devDependencies,
      ...json.dependencies,
    };
  }
  const npmLock = JSON.parse(readFile("package-lock.json"));

  const npmRows = (pkg) =>
    npmManifests
      .filter((m) => declaredByManifest[m][pkg] !== undefined)
      .map((manifest) => {
        const where = path.posix.dirname(manifest);
        const own =
          where === "."
            ? null
            : npmLock.packages?.[`${where}/node_modules/${pkg}`];
        const hoisted = npmLock.packages?.[`node_modules/${pkg}`];
        return {
          name: pkg,
          where: where === "." ? "root" : where,
          declared: declaredByManifest[manifest][pkg],
          installed: (own ?? hoisted)?.version ?? null,
        };
      });

  const uvLocks = SERVERS.map((s) => `src/${s}/uv.lock`)
    .filter(exists)
    .map((file) => ({
      where: path.posix.dirname(file),
      lock: parseUvLock(readFile(file)),
    }));
  const pypiRows = (pkg) =>
    uvLocks
      .filter(({ lock }) => lock.declared.has(pkg))
      .map(({ where, lock }) => ({
        name: pkg,
        where,
        declared: lock.declared.get(pkg),
        installed: lock.packages.find((p) => p.name === pkg)?.version ?? null,
      }));

  return {
    declaredByManifest,
    ownPackages,
    rowsFor: (group) =>
      group.packages.flatMap((pkg) =>
        group.ecosystem === "pypi" ? pypiRows(pkg) : npmRows(pkg),
      ),
  };
}

function latestNpm(pkg, spawn) {
  const result = spawn("npm", ["view", pkg, "version"], { encoding: "utf8" });
  if (result.error) throw result.error;
  // A failed `npm view` prints nothing; reading that as "no newer version"
  // would turn a registry outage into a clean night.
  if (result.status !== 0) {
    throw new Error(
      `npm view ${pkg} failed (exit ${result.status}): ${(result.stderr ?? "").trim()}`,
    );
  }
  const version = (result.stdout ?? "").trim();
  if (!semver.valid(version)) {
    throw new Error(
      `npm view ${pkg} returned an unusable version: "${version}"`,
    );
  }
  return version;
}

function latestPypi(pkg, spawn) {
  const url = `https://pypi.org/pypi/${pkg}/json`;
  const result = spawn("curl", ["-fsSL", "--max-time", "60", url], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `PyPI lookup for ${pkg} failed (exit ${result.status}): ${(result.stderr ?? "").trim()}`,
    );
  }
  let version;
  try {
    version = JSON.parse(result.stdout ?? "").info?.version;
  } catch (error) {
    throw new Error(
      `PyPI returned unreadable JSON for ${pkg}: ${error.message}`,
      { cause: error },
    );
  }
  if (!versioning("pypi").valid(version ?? "") || isPrerelease(version)) {
    throw new Error(
      `PyPI returned an unusable version for ${pkg}: "${version}"`,
    );
  }
  return version;
}

/**
 * @param {object} [options]
 * @param {string} [options.repo]
 * @param {string} [options.root]
 * @param {typeof spawnSync} [options.spawn]
 * @param {(file: string) => string} [options.readFile] repo-relative
 * @param {(file: string) => boolean} [options.exists] repo-relative
 * @param {string | undefined} [options.output] the `$GITHUB_OUTPUT` file
 * @param {boolean} [options.dryRun]
 * @param {(line: string) => void} [options.log]
 * @param {(line: string) => void} [options.warn] for warnings and per-group failures
 */
export function main({
  repo = process.env.GITHUB_REPOSITORY,
  root = repoRoot,
  spawn = spawnSync,
  readFile = (file) => readFileSync(path.join(root, file), "utf8"),
  exists = (file) => existsSync(path.join(root, file)),
  output = process.env.GITHUB_OUTPUT,
  dryRun = isDryRun(),
  log = console.log,
  warn = console.warn,
} = {}) {
  if (!repo) throw new Error("repo not specified (GITHUB_REPOSITORY unset)");
  const writer = issueWriter({ repo, spawn, dryRun, sweep: SWEEP, log });

  const installs = readInstalls(readFile, exists);
  assertEveryPackageWatched(installs.declaredByManifest, installs.ownPackages);

  const states = [];
  for (const group of SDK_GROUPS) {
    const rows = installs.rowsFor(group);
    if (rows.length === 0) continue;
    const latest = {};
    for (const name of new Set(rows.map((r) => r.name))) {
      latest[name] =
        group.ecosystem === "pypi"
          ? latestPypi(name, spawn)
          : latestNpm(name, spawn);
    }
    const state = groupState(group, rows, latest);
    if (state) states.push(state);
  }

  const emit = (filed) => {
    if (output && !dryRun)
      appendFileSync(output, `${formatFiledOutput(filed)}\n`);
  };

  if (states.length === 0) {
    log(`${SWEEP}: every MCP SDK package is current; no-op`);
    emit([]);
    return;
  }

  const existing = sweepIssues(repo, spawn, {
    state: "all",
    parseMarker,
    sweep: SWEEP,
    warn,
  })
    .map((issue) => ({ ...issue, marker: parseMarker(issue.body) }))
    .filter((issue) => issue.marker);
  const filed = [];
  const failures = [];
  let milestone;

  try {
    for (const state of states) {
      const { compare } = versioning(state.group.ecosystem);
      const forGroup = validTargets(
        existing.filter((i) => i.marker.key === state.group.key),
        state.group,
      );
      const match = forGroup.find(
        (i) => compare(i.marker.target, state.target) === 0,
      );

      try {
        const record = (issue) =>
          filed.push({
            issue,
            label: state.group.label,
            repo: state.group.repo,
            // The LOWEST installed copy, so the analysis covers every
            // release some install here still has to cross.
            from: state.rows
              .filter((r) => r.behind)
              .map((r) => r.installed)
              .sort(compare)[0],
            to: state.target,
          });

        let number;
        if (match) {
          number = match.number;
        } else {
          if (milestone === undefined)
            milestone = currentMilestone(repo, spawn);
          const created = writer.create({
            title: buildIssueTitle(state),
            labels: issueLabels(state),
            milestone,
            body: buildIssueBody(state),
          });
          number = created.number;
          if (number !== null) {
            record(number); // Before any further fallible work.
            log(`${SWEEP}: filed ${created.url}`);
          } else {
            log(`${SWEEP}: dry run: the analysis job would review this issue`);
          }
        }

        // OPEN only: a closed issue keeps suppressing its target, and must not
        // be handed a fresh analysis every night.
        if (match && match.state === "OPEN") {
          if (hasAnalysis(issueComments(repo, number, spawn))) {
            log(
              `${SWEEP}: ${state.group.label} ${state.target} has an issue and an analysis; no-op`,
            );
          } else {
            record(number);
            log(
              `${SWEEP}: #${number} has no analysis yet; queuing it for the analysis job`,
            );
          }
        } else if (match) {
          log(
            `${SWEEP}: ${state.group.label} ${state.target} was filed as #${number} and closed; leaving it alone`,
          );
        }

        // Any OPEN issue for an older target of this group is now stale. A
        // dry run has no new number yet, so it previews the note with a
        // placeholder, and nothing can have announced an issue that does not
        // exist.
        for (const stale of forGroup) {
          if (stale.number === number || stale.state !== "OPEN") continue;
          if (compare(stale.marker.target, state.target) >= 0) continue;
          const announced =
            number !== null &&
            issueComments(repo, stale.number, spawn).some(
              (c) =>
                isAutomationComment(c) &&
                parseSupersededMarker(c.body) === String(number),
            );
          if (announced) continue;
          const shown = number ?? "NEW";
          writer.comment(
            stale.number,
            buildSupersededComment(shown, state.target, stale.marker.target),
          );
          log(`${SWEEP}: noted that #${shown} supersedes #${stale.number}`);
        }
      } catch (error) {
        // One group's failure must not cost another group its issue.
        failures.push(`${state.group.label}: ${error.message}`);
        warn(`${SWEEP}: ${state.group.label} failed: ${error.message}`);
      }
    }
  } finally {
    emit(filed);
  }

  if (failures.length > 0) {
    throw new Error(
      `${SWEEP}: ${failures.length} group(s) failed: ${failures.join("; ")}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
