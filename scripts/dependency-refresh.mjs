#!/usr/bin/env node
// Monthly dependency sweep (#4874), replacing Dependabot's version-update PRs.
// Ported from the MCP Inspector's `scripts/dependency-refresh.mjs`
// (inspector#2229, #2235), with this repo's second ecosystem added.
//
// A Dependabot PR carries no `Closes #N` and no board card, so it was the one
// standing exception to "every PR references an issue". `.github/dependabot.yml`
// is deleted, and this sweep is what replaced its weekly Actions PRs. Once a
// month it checks three things on `v2/main` and files or updates ONE tracking
// issue listing everything behind:
//
//   - **npm**: `npm outdated` across the root and every workspace, in one run
//     (`--workspaces --include-workspace-root`), split by the manifest that
//     declares each package.
//   - **uv**: each Python server's `uv.lock`. `uv lock --upgrade --dry-run`
//     says what a lock refresh would move (the analogue of npm's `wanted`, and
//     it covers transitive packages too); `uv tree --outdated --depth 1` adds
//     the newest release of each direct dependency (npm's `latest`). Neither
//     writes the lockfile.
//   - **Actions**: every `uses:` ref under `.github/workflows`, against the
//     highest release of its action. A SHA pin, which `verify:action-pins`
//     requires in a credentialed job, is ranked by its trailing `# vX.Y.Z`
//     comment, so the pins stay watched rather than dropping out because a SHA
//     cannot be ordered. The SHA matcher is `scripts/lib/action-refs.mjs`'s,
//     so this sweep and the guard agree about what a pin is.
//
// No PR is opened. A maintainer picks what to bump and opens a normal PR
// against `v2/main` (`wanted` is the safe default; `latest` may cross a major).
//
// The issue is found again by the marker on its first line, on an issue the
// automation wrote (`scripts/lib/sweep.mjs` has the trust rule). A second run
// in the same month updates it in place; a run that finds nothing behind
// rewrites it to say so rather than leaving a stale table. It never closes the
// issue: closing is a maintainer's act.
//
// `--dry-run` reads everything and writes nothing: it prints the issue it
// would file or the edit it would make, labels and milestone included.
//
// The parsers and builders are pure and tested directly; `main()` shells out
// to `npm`, `uv` and `gh` through an injected spawn function, which
// `dependency-refresh.test.mjs` replaces with a fake.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SHA_REF, parseUses } from "./lib/action-refs.mjs";
import {
  SERVERS,
  SWEEP_LABELS,
  TARGET_BRANCH,
  cell,
  currentMilestone,
  isDryRun,
  issueWriter,
  sweepIssues,
} from "./lib/sweep.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const ISSUE_MARKER = "<!-- dependency-refresh:monthly-sweep -->";
export const ISSUE_TITLE = "chore(deps): monthly dependency refresh";
const SWEEP = "dependency-refresh";

/** Where the `uses:` refs this sweep checks live, relative to the repo root. */
export const WORKFLOW_DIR = ".github/workflows";

/** @param {string | undefined} body */
export const parseMarker = (body) =>
  (body ?? "").startsWith(ISSUE_MARKER) ? true : null;

/**
 * The manifest a `dependent` from `npm outdated --workspaces` names.
 *
 * npm reports a workspace by its arborist node name, which for this repo's
 * workspaces is the directory (`everything`), but a package name
 * (`@modelcontextprotocol/server-everything`) is accepted too, so a change in
 * how npm spells it cannot fold every workspace into `root` silently. The
 * root is reported by the checkout's directory name, which differs between
 * machines, so anything that matches no workspace is the root.
 *
 * @param {string | undefined} dependent
 * @param {Record<string, string>} [workspaceNames] package name -> `src/<dir>`
 * @returns {string}
 */
export function installLabel(dependent, workspaceNames = {}) {
  if (SERVERS.includes(dependent ?? "")) return `src/${dependent}`;
  return workspaceNames[dependent ?? ""] ?? "root";
}

/**
 * Split `npm outdated --json --workspaces --include-workspace-root` by the
 * manifest that declares each package. A package several manifests declare
 * comes back as an array, one entry per dependent.
 *
 * @param {string} json raw stdout (may be `""` or `"{}"`)
 * @param {Record<string, string>} [workspaceNames] package name -> `src/<dir>`
 * @returns {Map<string, Array<{name: string, current: string, wanted: string, latest: string}>>}
 *   keyed by `installLabel`, each list sorted by name
 */
export function parseNpmOutdated(json, workspaceNames = {}) {
  const byInstall = new Map();
  const trimmed = json.trim();
  if (trimmed === "") return byInstall;
  for (const [name, info] of Object.entries(JSON.parse(trimmed))) {
    for (const entry of Array.isArray(info) ? info : [info]) {
      const label = installLabel(entry.dependent, workspaceNames);
      const rows = byInstall.get(label) ?? [];
      // One manifest can reach a package twice (a dependency and a
      // devDependency); report it once.
      if (rows.some((r) => r.name === name)) continue;
      rows.push({
        name,
        current: entry.current ?? "(missing)",
        wanted: entry.wanted ?? entry.current ?? "?",
        latest: entry.latest ?? "?",
      });
      byInstall.set(label, rows);
    }
  }
  for (const rows of byInstall.values()) {
    rows.sort((a, b) => a.name.localeCompare(b.name));
  }
  return byInstall;
}

/**
 * What `uv lock --upgrade --dry-run` would change, read off its stderr.
 *
 * @param {string} text
 * @returns {Array<{name: string, current: string, wanted: string}>}
 */
export function parseUvDryRun(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const update = /^Update (\S+) v(\S+) -> v(\S+)\s*$/.exec(line.trim());
    if (update) {
      rows.push({ name: update[1], current: update[2], wanted: update[3] });
      continue;
    }
    const added = /^Add (\S+) v(\S+)\s*$/.exec(line.trim());
    if (added) {
      rows.push({ name: added[1], current: "(not locked)", wanted: added[2] });
      continue;
    }
    const removed = /^Remove (\S+) v(\S+)\s*$/.exec(line.trim());
    if (removed) {
      rows.push({ name: removed[1], current: removed[2], wanted: "(removed)" });
    }
  }
  return rows;
}

/**
 * The newest release of each direct dependency that is behind, read off
 * `uv tree --outdated --depth 1`. A dependency with no `(latest: …)` note is
 * current and is left out.
 *
 * @param {string} text
 * @returns {Map<string, {current: string, latest: string}>}
 */
export function parseUvTree(text) {
  const latest = new Map();
  for (const line of text.split("\n")) {
    const match = /^[├└]──\s+(\S+)\s+v(\S+)(.*)$/.exec(line.trim());
    if (!match) continue;
    const note = /\(latest: v([^)]+)\)/.exec(match[3]);
    // `httpx[socks]` is the dependency on `httpx` with an extra; the lock
    // refresh names the package alone.
    const name = match[1].replace(/\[[^\]]*\]$/, "");
    if (note) latest.set(name, { current: match[2], latest: note[1] });
  }
  return latest;
}

/**
 * One Python server's rows: everything a lock refresh moves, plus any direct
 * dependency whose newest release the declared range keeps out.
 *
 * @param {ReturnType<typeof parseUvDryRun>} moves
 * @param {ReturnType<typeof parseUvTree>} direct
 * @returns {Array<{name: string, current: string, wanted: string, latest: string}>}
 */
export function uvRows(moves, direct) {
  const rows = new Map();
  for (const move of moves) {
    rows.set(move.name, {
      ...move,
      latest: direct.get(move.name)?.latest ?? "—",
    });
  }
  for (const [name, { current, latest }] of direct) {
    if (!rows.has(name))
      rows.set(name, { name, current, wanted: current, latest });
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every action reference in one workflow file.
 *
 * A line regex rather than a YAML parse, as in the Inspector: `uses:` is
 * always a scalar on its own line in these workflows, and the one comment
 * that matters, the `# vX.Y.Z` after a SHA pin, sits on that line. Local
 * (`./…`) and container (`docker://…`) steps, and a ref with no `@`, are
 * skipped by `parseUses`.
 *
 * @param {string} yaml
 * @returns {Array<{action: string, ref: string, version?: string}>}
 */
export function parseActionRefs(yaml) {
  const refs = [];
  for (const line of yaml.split("\n")) {
    const match = /^\s*(?:-\s+)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/.exec(
      line,
    );
    if (!match) continue;
    const parsed = parseUses(match[1] ?? match[2] ?? match[3]);
    if (parsed === null) continue;
    const comment = /#\s*(v?\d+(?:\.\d+){0,2})\s*$/.exec(line);
    if (SHA_REF.test(parsed.ref) && comment) parsed.version = comment[1];
    refs.push(parsed);
  }
  return refs;
}

/**
 * `v7`, `v7.0`, `7.0.1` as numbers, or `null` for a SHA or a branch.
 *
 * @param {string} ref
 * @returns {number[] | null}
 */
export function parseVersionRef(ref) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(ref);
  if (!match) return null;
  return match
    .slice(1)
    .filter((part) => part !== undefined)
    .map(Number);
}

/**
 * Is `current` behind `latest`, compared to the precision `current` names?
 * `v7` is a moving major tag, so it is current until `v8`; an exact `v7.0.0`
 * is behind `v7.0.1`.
 *
 * @param {string} current
 * @param {string} latest
 * @returns {boolean} `false` when either side is not a numeric ref
 */
export function isActionStale(current, latest) {
  const from = parseVersionRef(current);
  const to = parseVersionRef(latest);
  if (from === null || to === null) return false;
  for (let i = 0; i < from.length; i++) {
    const other = to[i] ?? 0;
    if (other !== from[i]) return other > from[i];
  }
  return false;
}

/**
 * The stale refs, deduped. A SHA pin is ranked by its comment, so it is
 * reported as soon as any newer release ships, and shown as that release plus
 * the short SHA, which is what a maintainer re-resolves. A SHA pin with no
 * comment cannot be ranked and is listed separately by `unrankedPins`.
 *
 * @param {ReturnType<typeof parseActionRefs>} refs
 * @param {Record<string, string | null>} latestByAction
 * @returns {Array<{action: string, current: string, latest: string}>}
 */
export function staleActions(refs, latestByAction) {
  const stale = new Map();
  for (const { action, ref, version } of refs) {
    const latest = latestByAction[action];
    if (!latest || !isActionStale(version ?? ref, latest)) continue;
    const current = version ? `${version} (\`${ref.slice(0, 7)}\`)` : ref;
    stale.set(`${action}@${ref}`, { action, current, latest });
  }
  return [...stale.values()].sort(
    (a, b) =>
      a.action.localeCompare(b.action) || a.current.localeCompare(b.current),
  );
}

/**
 * SHA pins with no version comment: this sweep cannot rank them, and saying
 * so is better than leaving them silently unwatched. `verify:action-pins`
 * already refuses one in a credentialed job; elsewhere one is legal.
 *
 * @param {ReturnType<typeof parseActionRefs>} refs
 * @returns {string[]} `action@sha7`, deduped and sorted
 */
export function unrankedPins(refs) {
  return [
    ...new Set(
      refs
        .filter((r) => SHA_REF.test(r.ref) && !r.version)
        .map((r) => `${r.action}@${r.ref.slice(0, 7)}`),
    ),
  ].sort();
}

/**
 * The highest parseable version among release tags. Not `releases/latest`,
 * which is the most recently designated release: an action that cuts a
 * maintenance release on an old major would make that read as newest.
 *
 * @param {string[]} tags
 * @returns {string | null}
 */
export function highestVersionTag(tags) {
  let best = null;
  let bestParts = null;
  for (const tag of tags) {
    const parts = parseVersionRef(tag);
    if (parts === null) continue;
    if (bestParts === null || comparePadded(parts, bestParts) > 0) {
      best = tag;
      bestParts = parts;
    }
  }
  return best;
}

function comparePadded(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const npmTable = (rows) =>
  [
    "| Package | Current | Wanted | Latest |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (p) =>
        `| \`${cell(p.name)}\` | ${cell(p.current)} | ${cell(p.wanted)} | ${cell(p.latest)} |`,
    ),
  ].join("\n");

const uvTable = (rows) =>
  [
    "| Package | Locked | `uv lock --upgrade` | Latest (direct only) |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (p) =>
        `| \`${cell(p.name)}\` | ${cell(p.current)} | ${cell(p.wanted)} | ${cell(p.latest)} |`,
    ),
  ].join("\n");

/**
 * @param {{npm: Array<{label: string, packages: Array<object>}>, uv: Array<{label: string, packages: Array<object>}>, actions: ReturnType<typeof staleActions>, unranked?: string[]}} found
 * @returns {string | null} the issue body, or `null` when nothing is behind
 */
export function buildIssueBody({ npm, uv, actions, unranked = [] }) {
  const npmBehind = npm.filter((i) => i.packages.length > 0);
  const uvBehind = uv.filter((i) => i.packages.length > 0);
  // An unranked pin alone still files: it is something this sweep cannot
  // vouch for, and saying so is the point of listing it.
  if (
    npmBehind.length === 0 &&
    uvBehind.length === 0 &&
    actions.length === 0 &&
    unranked.length === 0
  ) {
    return null;
  }

  const sections = [];
  if (npmBehind.length > 0) {
    sections.push("## npm", "");
    for (const { label, packages } of npmBehind) {
      sections.push(`### \`${label}\``, "", npmTable(packages), "");
    }
  }
  if (uvBehind.length > 0) {
    sections.push(
      "## uv",
      "",
      "`uv lock --upgrade` is what refreshing each lockfile within the declared ranges would move, transitive packages included. **Latest** is the newest release of a direct dependency; where it is past the `uv lock --upgrade` column, the range in `pyproject.toml` is what holds it back.",
      "",
    );
    for (const { label, packages } of uvBehind) {
      sections.push(`### \`${label}/uv.lock\``, "", uvTable(packages), "");
    }
  }
  if (actions.length > 0) {
    sections.push(
      "## GitHub Actions",
      "",
      "| Action | Current | Latest |",
      "| --- | --- | --- |",
      ...actions.map(
        (a) =>
          `| \`${cell(a.action)}\` | ${cell(a.current)} | ${cell(a.latest)} |`,
      ),
      "",
      "A SHA pin is ranked by its `# vX.Y.Z` comment. When bumping one, resolve the new SHA and its exact release from the same tag lookup (`verify:action-pins` cannot check offline that they agree).",
      "",
    );
  }
  if (unranked.length > 0) {
    sections.push(
      `SHA pins with no \`# vX.Y.Z\` comment, which this sweep cannot rank: ${unranked.map((p) => `\`${p}\``).join(", ")}.`,
      "",
    );
  }

  return [
    ISSUE_MARKER,
    `Routine dependency refresh: \`npm outdated\` across the root and every workspace, a \`uv\` lock refresh check for each Python server, and a workflow \`uses:\` check, run against \`${TARGET_BRANCH}\` on a monthly schedule. It replaces Dependabot's version-update PRs (#4874).`,
    "",
    `This is a tracking issue, not a diff. Pick what is worth bumping and open a normal PR against \`${TARGET_BRANCH}\`. \`Wanted\` is the safe default; \`Latest\` may cross a major and needs its own judgement. Pin a transitive npm package with an \`overrides\` entry, not \`npm audit fix\`; bump a devDependency several workspaces declare in every one of them; and commit a Python server's refreshed \`uv.lock\` with the change (\`AGENTS.md\`, Dependencies).`,
    "",
    ...sections,
    "A later run of this sweep updates this body in place rather than filing a duplicate.",
  ].join("\n");
}

/**
 * The body a still-open tracking issue is rewritten to once nothing is
 * behind. It speaks for all three ecosystems, so it never claims a clean bill
 * the sweep did not check. Rewritten rather than closed: closing is a
 * maintainer's act.
 *
 * @param {string} isoDate
 * @returns {string}
 */
export function buildClearedBody(isoDate) {
  return [
    ISSUE_MARKER,
    `Everything this sweep checks is current as of ${isoDate}: no npm package is outdated at the root or in any workspace, no Python server's \`uv.lock\` would move on \`uv lock --upgrade\` and no direct Python dependency is behind its newest release, and no version-ranked workflow \`uses:\` ref is behind its action's highest release.`,
    "",
    "A ref pinned to a branch, or to a commit SHA with no `# vX.Y.Z` comment, cannot be ranked, so this statement says nothing about it.",
    "",
    "The tables an earlier run listed are gone because nothing in them is behind any more. Safe to close; a later run that finds something behind rewrites this body rather than filing a duplicate.",
  ].join("\n");
}

/**
 * Each workspace's package name, mapped to its directory.
 *
 * @param {string} root
 * @returns {Record<string, string>}
 */
export function workspacePackageNames(root) {
  const names = {};
  for (const server of SERVERS) {
    const manifest = path.join(root, "src", server, "package.json");
    if (!existsSync(manifest)) continue;
    const { name } = JSON.parse(readFileSync(manifest, "utf8"));
    if (name) names[name] = `src/${server}`;
  }
  return names;
}

function runOutdated(root, spawn) {
  const result = spawn(
    "npm",
    ["outdated", "--json", "--workspaces", "--include-workspace-root"],
    { cwd: root, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  // 0 means nothing is outdated and 1 means something is; both are successful
  // runs. Anything else is a real failure that also prints nothing to stdout,
  // so accepting it would report a clean sweep over an outage.
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `npm outdated failed (exit ${result.status}): ${(result.stderr ?? "").trim()}`,
    );
  }
  return result.stdout ?? "";
}

function runUv(dir, args, spawn) {
  const result = spawn("uv", args, { cwd: dir, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `uv ${args.join(" ")} failed in ${dir} (exit ${result.status}): ${(result.stderr ?? "").trim()}`,
    );
  }
  return result;
}

/** Each Python server's rows, keyed by its directory. */
function sweepUv(root, spawn) {
  return SERVERS.filter((server) =>
    existsSync(path.join(root, "src", server, "uv.lock")),
  ).map((server) => {
    const dir = path.join(root, "src", server);
    // uv reports the dry run on stderr.
    const lock = runUv(dir, ["lock", "--upgrade", "--dry-run"], spawn);
    const tree = runUv(
      dir,
      ["tree", "--outdated", "--depth", "1", "--frozen"],
      spawn,
    );
    return {
      label: `src/${server}`,
      packages: uvRows(
        parseUvDryRun(`${lock.stderr ?? ""}\n${lock.stdout ?? ""}`),
        parseUvTree(tree.stdout ?? ""),
      ),
    };
  });
}

function collectActionRefs(root) {
  const dir = path.join(root, WORKFLOW_DIR);
  return readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .flatMap((file) =>
      parseActionRefs(readFileSync(path.join(dir, file), "utf8")),
    );
}

/**
 * The action's highest released version tag, from the full release list
 * (every page: the list is ordered by date, not version). A failed lookup,
 * 404 included, throws: the list endpoint answers "no releases" with an empty
 * array, so a 404 means a repository this sweep cannot check at all.
 */
function latestReleaseTag(action, spawn) {
  const repo = action.split("/").slice(0, 2).join("/");
  const result = spawn(
    "gh",
    [
      "api",
      "--paginate",
      `repos/${repo}/releases?per_page=100`,
      "--jq",
      ".[] | select(.draft == false and .prerelease == false) | .tag_name",
    ],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `release lookup for ${repo} failed (exit ${result.status}): ${(result.stderr ?? "").trim()}`,
    );
  }
  return highestVersionTag(
    (result.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

/**
 * @param {object} [options]
 * @param {string} [options.repo]
 * @param {string} [options.root] the checkout to sweep
 * @param {typeof spawnSync} [options.spawn]
 * @param {boolean} [options.dryRun]
 * @param {string} [options.today] `YYYY-MM-DD`
 * @param {(line: string) => void} [options.log]
 * @param {(line: string) => void} [options.warn] for warnings and per-group failures
 */
export function main({
  repo = process.env.GITHUB_REPOSITORY,
  root = repoRoot,
  spawn = spawnSync,
  dryRun = isDryRun(),
  today = new Date().toISOString().slice(0, 10),
  log = console.log,
  warn = console.warn,
} = {}) {
  if (!repo) throw new Error("repo not specified (GITHUB_REPOSITORY unset)");
  const writer = issueWriter({ repo, spawn, dryRun, sweep: SWEEP, log });

  const npmByInstall = parseNpmOutdated(
    runOutdated(root, spawn),
    workspacePackageNames(root),
  );
  const npm = ["root", ...SERVERS.map((s) => `src/${s}`)]
    .filter((label) => npmByInstall.has(label))
    .map((label) => ({ label, packages: npmByInstall.get(label) }));
  const uv = sweepUv(root, spawn);

  const refs = collectActionRefs(root);
  const latestByAction = Object.fromEntries(
    [...new Set(refs.map((r) => r.action))].map((action) => [
      action,
      latestReleaseTag(action, spawn),
    ]),
  );
  const actions = staleActions(refs, latestByAction);
  const unranked = unrankedPins(refs);

  // Looked up before branching on the body: the nothing-behind case still
  // has to reach an open issue to clear it.
  const existing =
    sweepIssues(repo, spawn, {
      state: "open",
      parseMarker,
      sweep: SWEEP,
      warn,
    }).find((i) => parseMarker(i.body)) ?? null;
  const body = buildIssueBody({ npm, uv, actions, unranked });

  if (body === null) {
    if (!existing) {
      log(`${SWEEP}: nothing behind in npm, uv or Actions — no-op`);
      return;
    }
    const cleared = buildClearedBody(today);
    if (existing.body === cleared) {
      log(
        `${SWEEP}: #${existing.number} already says nothing is behind — no-op`,
      );
      return;
    }
    writer.edit(existing.number, { body: cleared });
    log(`${SWEEP}: nothing behind — cleared the list on #${existing.number}`);
    return;
  }

  if (existing) {
    if (existing.body === body) {
      log(`${SWEEP}: #${existing.number} is already up to date — no-op`);
      return;
    }
    writer.edit(existing.number, { body });
    log(`${SWEEP}: updated #${existing.number}`);
    return;
  }

  const milestone = currentMilestone(repo, spawn);
  const created = writer.create({
    title: ISSUE_TITLE,
    labels: SWEEP_LABELS,
    milestone,
    body,
  });
  if (created.url) log(`${SWEEP}: filed ${created.url}`);
  if (!milestone) {
    // Unmilestoned means unapproved, so triage sweeps it into `Incoming`.
    log(`${SWEEP}: no dated open milestone — filed unmilestoned`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
