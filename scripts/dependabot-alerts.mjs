#!/usr/bin/env node
// Daily Dependabot alert sweep (#4874), replacing Dependabot's security-update
// PRs. Ported from the MCP Inspector's `scripts/dependabot-alerts.mjs`
// (inspector#2233), with the `pip` ecosystem added and its board writes left
// out.
//
//   alert -> this sweep -> issue (labeled, milestoned) -> issue-triage boards it -> maintainer PR -> v2/main
//
// Security-update PRs are a repo setting (`automated-security-fixes`), turned
// off; the ALERTS stay on, and this sweep is what consumes them. Each open
// alert becomes an ordinary issue and the fix is written by hand against
// `v2/main`, like any other work.
//
// What shapes the design, each point checked against this repo:
//
//  1. **There is no `dependabot_alert` workflow trigger** (it is a webhook
//     event only), so this is a daily schedule rather than an event handler.
//  2. **Two ecosystems.** npm alerts arrive against the root
//     `package-lock.json` (one lockfile for all four TypeScript workspaces);
//     pip alerts arrive against each Python server's `uv.lock`, with PEP 440
//     ranges, which `scripts/lib/pep440.mjs` reads. Any other ecosystem is
//     reported and skipped: filing it properly means knowing how to fix it.
//  3. **Alerts are per advisory, a fix is per bump.** Alerts are grouped by
//     `(package, manifest)`, and the issue targets the LOWEST of the applying
//     advisories' patched versions that is outside every applicable range, so
//     one bump clears all of them (`pickTarget`). When no listed patched
//     version does, the issue names the highest and flags it as still in range
//     of the advisories it misses. This departs from the Inspector, which
//     files one issue per patched version; against this repo's backlog that
//     meant seven issues for `gitpython` in one lockfile and forty-odd in all,
//     each a subset of the same edit. A pip package's name is PEP 503 normalized first:
//     Dependabot reports `PyJWT` and `pyjwt` as separate alerts.
//  4. **Alerts are computed from the default branch (`main`), and we ship from
//     `v2/main`.** So each advisory's range is re-checked against `v2/main`'s
//     own lockfile before anything is filed, and one already fixed there is
//     skipped. The converse is a blind spot no alert consumer can close: a
//     vulnerable dependency introduced on `v2/main` and not yet merged to
//     `main` produces no alert at all.
//  5. **`automated-security-fixes` can be switched back on from the UI**, with
//     no commit to record it. The sweep reads it back and fails on an explicit
//     `enabled: true`. The endpoint needs `administration: read`, which
//     `GITHUB_TOKEN` cannot be granted, so under the workflow's token the
//     check reports UNVERIFIED rather than failing every day.
//  6. **No board write.** See `scripts/lib/sweep.mjs`: the issue is filed
//     labeled and milestoned, and `issue-triage` boards it in `Todo`.
//
// The idempotency key is the marker on the first line of each issue body,
// naming the package, manifest, patched version and every GHSA the issue
// covers; it counts only on an issue the automation wrote. A second run the
// same day is a no-op. A NEW advisory for a bump that already has an open
// issue lands as a comment on it and rewrites the marker. An issue whose
// exposure is gone (fixed on `v2/main`, alert dismissed, manifest removed) is
// rewritten to say so and left open: whether its card belongs in Done or
// should be deleted depends on why, which a maintainer decides.
//
// Every failure to READ the alert feed throws before anything is written. The
// sweep clears issues whose alerts have vanished, so a partial or empty
// listing must never be mistaken for "no alerts".
//
// `--dry-run` reads everything and writes nothing: it prints each issue,
// edit and comment it would make, labels and milestone included.
//
// The pure halves are tested directly, and `main()` through an injected spawn
// function and file reader (`dependabot-alerts.test.mjs`).

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import semver from "semver";
import {
  normalizeName,
  satisfies as pep440Satisfies,
  compareVersions as pep440Compare,
} from "./lib/pep440.mjs";
import {
  SWEEP_LABELS,
  TARGET_BRANCH,
  cell,
  currentMilestone,
  gh,
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

const SWEEP = "dependabot-alerts";

/** The ecosystems this sweep can act on, as the alert feed names them. */
export const SUPPORTED_ECOSYSTEMS = ["npm", "pip"];

const DEPENDENCIES_DOC =
  "https://github.com/modelcontextprotocol/servers/blob/v2/main/AGENTS.md#dependencies";

const MARKER_RE =
  /^<!-- dependabot-alerts: pkg=(.+?); manifest=(.+?); fixed=(.+?); ghsas=(.+?) -->/;

/** Marker on the comment that announces newly seen advisories. */
const COMMENT_MARKER_RE = /^<!-- dependabot-alerts:added (.+?) -->/;

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, moderate: 2, low: 1 };

/**
 * The name a group is keyed and reported by: npm names are exact, pip names
 * are PEP 503 normalized.
 *
 * @param {string} ecosystem
 * @param {string} name
 * @returns {string}
 */
export function packageKey(ecosystem, name) {
  return ecosystem === "pip" ? normalizeName(name) : name;
}

/**
 * The issue body's first line. `(pkg, manifest)` is the key an issue is found
 * by; `fixed` records the target the body names, which moves up when a newer
 * advisory raises it, and `ghsas` every advisory the issue has announced.
 *
 * @param {{package: string, manifestPath: string, fixedIn: string, ghsas: string[]}} group
 * @returns {string}
 */
export function buildMarker({ package: pkg, manifestPath, fixedIn, ghsas }) {
  return `<!-- dependabot-alerts: pkg=${pkg}; manifest=${manifestPath}; fixed=${fixedIn}; ghsas=${[...ghsas].sort().join(",")} -->`;
}

/**
 * @param {string | undefined} body
 * @returns {{package: string, manifestPath: string, fixedIn: string, ghsas: string[]} | null}
 */
export function parseMarker(body) {
  const match = MARKER_RE.exec(body ?? "");
  if (!match) return null;
  return {
    package: match[1],
    manifestPath: match[2],
    fixedIn: match[3],
    ghsas: match[4].split(",").filter(Boolean),
  };
}

/**
 * @param {string | undefined} body
 * @returns {string[] | null}
 */
export function parseCommentMarker(body) {
  const match = COMMENT_MARKER_RE.exec(body ?? "");
  return match ? match[1].split(",").filter(Boolean) : null;
}

/** @param {string[]} added */
export function buildCommentMarker(added) {
  return `<!-- dependabot-alerts:added ${[...added].sort().join(",")} -->`;
}

/**
 * @param {string[]} existing the marker's GHSA list
 * @param {string[]} incoming the GHSAs this run saw
 * @returns {{merged: string[], added: string[]}} both sorted
 */
export function mergeGhsas(existing, incoming) {
  const known = new Set(existing);
  const added = [...new Set(incoming.filter((g) => !known.has(g)))].sort();
  const merged = [...new Set([...existing, ...incoming])].sort();
  return { merged, added };
}

/**
 * GitHub separates a range's conjuncts with a comma (`>= 3.1.3, < 3.1.6`);
 * node-semver reads a comma as nothing and silently answers `false`. Space
 * is semver's AND.
 *
 * @param {string} range
 * @returns {string}
 */
export function toSemverRange(range) {
  return range
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Does `version` fall inside an advisory's vulnerable range? Throws when
 * either cannot be read, so the caller can tell "not in range" from "could
 * not tell".
 *
 * @param {string} ecosystem
 * @param {string} version
 * @param {string} range
 * @returns {boolean}
 */
export function inRange(ecosystem, version, range) {
  if (ecosystem === "pip") return pep440Satisfies(version, range);
  const semverRange = toSemverRange(range);
  if (
    semver.validRange(semverRange) === null ||
    semver.valid(version) === null
  ) {
    throw new Error(`cannot compare ${version} against "${range}"`);
  }
  return semver.satisfies(version, semverRange);
}

/**
 * The install a lockfile path belongs to: the root, or a workspace whose own
 * `node_modules` holds a copy it could not share with the root.
 *
 * @param {string} lockPath a `packages` key, e.g. `src/filesystem/node_modules/diff`
 * @returns {{owner: string, rest: string}} `rest` starts at `node_modules/`
 */
export function splitOwner(lockPath) {
  const match = /^(src\/[^/]+)\/(node_modules\/.*)$/.exec(lockPath);
  return match
    ? { owner: match[1], rest: match[2] }
    : { owner: "", rest: lockPath };
}

/**
 * Every installed copy of `pkg` in an npm lockfile, with its tree path. A
 * copy is `topLevel` when it sits directly in an install's `node_modules`
 * (the root's, or a workspace's own), i.e. it is what a declared range
 * resolves to; a copy under another package's `node_modules` was pulled in
 * by that package.
 *
 * @param {object} lock parsed `package-lock.json` (v2 or v3)
 * @param {string} pkg
 * @returns {Array<{path: string, version: string, topLevel: boolean}>} sorted by version
 */
export function npmLockEntries(lock, pkg) {
  const entries = [];
  for (const [lockPath, entry] of Object.entries(lock.packages ?? {})) {
    const { rest } = splitOwner(lockPath);
    const tail = `node_modules/${pkg}`;
    if (rest !== tail && !rest.endsWith(`/${tail}`)) continue;
    if (!entry?.version || entry.link) continue;
    entries.push({
      path: lockPath,
      version: entry.version,
      topLevel: rest === tail,
    });
  }
  return entries.sort(
    (a, b) =>
      semver.compare(a.version, b.version) || a.path.localeCompare(b.path),
  );
}

/**
 * The manifests that declare `pkg` (any dependency section): the root, and
 * each workspace, as the lockfile records them.
 *
 * @param {object} lock parsed `package-lock.json`
 * @param {string} pkg
 * @returns {string[]} manifest paths, e.g. `package.json`, `src/everything/package.json`
 */
export function npmDeclarers(lock, pkg) {
  const declarers = [];
  for (const [lockPath, entry] of Object.entries(lock.packages ?? {})) {
    if (lockPath !== "" && !/^src\/[^/]+$/.test(lockPath)) continue;
    const declared =
      entry?.dependencies?.[pkg] ??
      entry?.devDependencies?.[pkg] ??
      entry?.optionalDependencies?.[pkg] ??
      entry?.peerDependencies?.[pkg];
    if (declared) {
      declarers.push(
        lockPath === "" ? "package.json" : `${lockPath}/package.json`,
      );
    }
  }
  return declarers.sort();
}

/**
 * `node_modules/ajv/node_modules/fast-uri` -> `["ajv"]`: the packages a
 * nested copy sits under, outermost first, ignoring a workspace prefix.
 *
 * @param {string} lockPath
 * @returns {string[]}
 */
export function overrideAncestors(lockPath) {
  const { rest } = splitOwner(lockPath);
  const segments = rest.replace(/^node_modules\//, "").split("/node_modules/");
  return segments.slice(0, -1);
}

/**
 * A parent-scoped `overrides` block for the nested vulnerable copies. npm
 * rejects a package-wide override that contradicts a direct dependency of the
 * same name (`EOVERRIDE`), so when a manifest declares the package the nested
 * copies have to be reached through their parents.
 *
 * @param {Array<{path: string}>} affected
 * @param {{package: string, fixedIn: string}} group
 * @returns {string}
 */
export function scopedOverrideExample(affected, group) {
  const overrides = {};
  for (const entry of affected) {
    const ancestors = overrideAncestors(entry.path);
    if (ancestors.length === 0) continue;
    let node = overrides;
    for (const ancestor of ancestors) {
      node[ancestor] = node[ancestor] ?? {};
      node = node[ancestor];
    }
    node[group.package] = group.fixedIn;
  }
  return JSON.stringify({ overrides }, null, 2);
}

/**
 * Every locked version of a (normalized) pip package. A lock can hold more
 * than one when the resolution forks by platform or Python version.
 *
 * @param {ReturnType<typeof parseUvLock>} lock
 * @param {string} pkg normalized
 * @returns {Array<{path: string, version: string, topLevel: boolean}>}
 */
export function uvLockEntries(lock, pkg) {
  return lock.packages
    .filter((p) => normalizeName(p.name) === pkg)
    .map((p) => ({ path: p.name, version: p.version, topLevel: true }))
    .sort((a, b) => pep440Compare(a.version, b.version));
}

/**
 * Is `pkg` this repository's own package in that lockfile? A server's own
 * advisories (`mcp-server-git`'s, say) arrive in the same feed, against the
 * lock that records the server as its root project. Its locked version is
 * the `pyproject.toml` placeholder, not what was published, and the fix is in
 * the source, so there is no bump to file: the alert wants dismissing.
 *
 * @param {string} ecosystem
 * @param {object} lock a parsed lockfile (`parseUvLock`'s, or npm's JSON)
 * @param {string} pkg
 * @returns {boolean}
 */
export function isOwnPackage(ecosystem, lock, pkg) {
  if (ecosystem === "pip") return lock.project === pkg;
  return Object.entries(lock.packages ?? {}).some(
    ([lockPath, entry]) =>
      (lockPath === "" || /^src\/[^/]+$/.test(lockPath)) && entry?.name === pkg,
  );
}

/** One bump's key, shared by grouping and reconciliation. */
export function groupKey(pkg, manifestPath) {
  return JSON.stringify([pkg, manifestPath]);
}

/**
 * The highest of these versions, in the ecosystem's own ordering.
 *
 * @param {string} ecosystem
 * @param {string[]} versions
 * @returns {string}
 */
export function highestVersion(ecosystem, versions) {
  return [...versions].sort(versionCompare(ecosystem)).at(-1);
}

/** The ecosystem's own ordering. */
function versionCompare(ecosystem) {
  return ecosystem === "pip"
    ? pep440Compare
    : (a, b) =>
        semver.valid(a) && semver.valid(b)
          ? semver.compare(a, b)
          : a.localeCompare(b);
}

/**
 * The version a grouped issue asks for: the LOWEST of the advisories' patched
 * versions that falls outside every applicable range. The highest patched
 * version is not enough on its own: one advisory's range can still cover
 * another's fix (`<1.5.0 || >=2.0.0 <2.2.0` patched at 1.5.0, beside `<2.0.0`
 * patched at 2.0.0, leaves 2.0.0 vulnerable). When no listed patched version
 * clears them all, the highest is named and `verified` is false, and the body
 * says so rather than claiming one bump clears everything.
 *
 * @param {string} ecosystem
 * @param {Array<{fixedIn: string, range: string}>} advisories
 * @param {string[]} [installed] the affected copies' versions; the target is
 *   never below the newest of them
 * @returns {{fixedIn: string, verified: boolean, stillOpen: string[]}}
 *   `stillOpen` names the advisories whose range still covers the target
 */
export function pickTarget(ecosystem, advisories, installed = []) {
  const covers = (version) =>
    advisories.filter((a) => {
      try {
        return inRange(ecosystem, version, a.range);
      } catch {
        // A range that cannot be read cannot vouch for the target.
        return true;
      }
    });
  const compare = versionCompare(ecosystem);
  // Never below an affected copy: a "bump" to an older version is a
  // downgrade, and raising a floor to it leaves the newer copy in range.
  const floor =
    installed.length > 0 ? highestVersion(ecosystem, installed) : null;
  const candidates = [...new Set(advisories.map((a) => a.fixedIn))]
    .filter((c) => floor === null || compare(c, floor) >= 0)
    .sort(compare);
  if (candidates.length === 0) {
    // Every listed fix is older than an affected copy: name the advisories
    // that still cover the newest one.
    return {
      fixedIn: highestVersion(
        ecosystem,
        advisories.map((a) => a.fixedIn),
      ),
      verified: false,
      stillOpen: covers(floor).map((a) => a.ghsa),
    };
  }

  for (const candidate of candidates) {
    if (covers(candidate).length === 0) {
      return { fixedIn: candidate, verified: true, stillOpen: [] };
    }
  }
  const highest = candidates.at(-1);
  return {
    fixedIn: highest,
    verified: false,
    stillOpen: covers(highest).map((a) => a.ghsa),
  };
}

/** One advisory as it applies to one manifest. */
export function advisoryKey(pkg, manifestPath, ghsa) {
  return JSON.stringify([pkg, manifestPath, ghsa]);
}

/**
 * Collapse per-advisory alerts into one entry per `(package, manifest)`. An
 * alert with no patched version is skipped: there is nothing to bump to.
 * `fixedIn` here is the highest patched version across every advisory;
 * `narrowToApplicable` replaces it with `pickTarget`'s choice over the ones
 * that apply.
 *
 * @param {object[]} alerts raw `GET /repos/{o}/{r}/dependabot/alerts` entries
 */
export function groupAlerts(alerts) {
  const groups = new Map();
  for (const alert of alerts) {
    if (alert.state !== "open") continue;
    const ecosystem = alert.dependency?.package?.ecosystem ?? "unknown";
    const rawName = alert.dependency?.package?.name;
    const manifestPath = alert.dependency?.manifest_path;
    const fixedIn =
      alert.security_vulnerability?.first_patched_version?.identifier;
    if (!rawName || !manifestPath || !fixedIn) continue;
    const pkg = packageKey(ecosystem, rawName);

    const key = groupKey(pkg, manifestPath);
    const advisory = {
      fixedIn,
      ghsa: alert.security_advisory?.ghsa_id ?? "",
      cve: alert.security_advisory?.cve_id ?? null,
      severity: alert.security_advisory?.severity ?? "unknown",
      summary: alert.security_advisory?.summary ?? "",
      range: alert.security_vulnerability?.vulnerable_version_range ?? "",
      url: alert.html_url ?? "",
    };

    const existing = groups.get(key);
    if (existing) {
      // The same GHSA can arrive twice under two spellings of a pip name.
      if (!existing.advisories.some((a) => a.ghsa === advisory.ghsa)) {
        existing.advisories.push(advisory);
      }
      existing.fixedIn = highestVersion(ecosystem, [existing.fixedIn, fixedIn]);
      if (
        (SEVERITY_RANK[advisory.severity] ?? 0) >
        (SEVERITY_RANK[existing.severity] ?? 0)
      ) {
        existing.severity = advisory.severity;
      }
      continue;
    }
    groups.set(key, {
      key,
      package: pkg,
      ecosystem,
      manifestPath,
      fixedIn,
      scope: alert.dependency?.scope ?? "runtime",
      severity: advisory.severity,
      advisories: [advisory],
    });
  }

  return [...groups.values()]
    .map((group) => {
      group.advisories.sort((a, b) => a.ghsa.localeCompare(b.ghsa));
      group.ghsas = group.advisories.map((a) => a.ghsa);
      return group;
    })
    .sort(
      (a, b) =>
        a.package.localeCompare(b.package) ||
        a.manifestPath.localeCompare(b.manifestPath),
    );
}

/**
 * Narrow a group to the advisories that apply to what is installed. Two
 * advisories that share a patched version can have different ranges, and an
 * issue claiming one that does not apply on this branch overstates it.
 *
 * @param {ReturnType<typeof groupAlerts>[number]} group
 * @param {Array<{path: string, version: string, topLevel: boolean}>} entries
 * @returns {{group: ReturnType<typeof groupAlerts>[number], affected: Array<{path: string, version: string, topLevel: boolean}>} | null}
 * @throws when a range or a version cannot be read
 */
export function narrowToApplicable(group, entries) {
  const applies = (advisory, entry) =>
    inRange(group.ecosystem, entry.version, advisory.range);

  const advisories = group.advisories.filter((a) =>
    entries.some((e) => applies(a, e)),
  );
  if (advisories.length === 0) return null;

  const affected = entries.filter((e) => advisories.some((a) => applies(a, e)));
  const severity = advisories.reduce(
    (worst, a) =>
      (SEVERITY_RANK[a.severity] ?? 0) > (SEVERITY_RANK[worst] ?? 0)
        ? a.severity
        : worst,
    advisories[0].severity,
  );
  return {
    group: {
      ...group,
      advisories,
      ghsas: advisories.map((a) => a.ghsa),
      severity,
      ...(({ fixedIn, verified, stillOpen }) => ({
        fixedIn,
        targetVerified: verified,
        targetStillOpen: stillOpen,
      }))(
        pickTarget(
          group.ecosystem,
          advisories,
          affected.map((e) => e.version),
        ),
      ),
    },
    affected,
  };
}

/** @param {ReturnType<typeof groupAlerts>[number]} group */
export function buildIssueTitle(group) {
  const n = group.advisories.length;
  return `chore(deps): bump \`${group.package}\` to \`${group.fixedIn}\` in \`${group.manifestPath}\` (${n} ${n === 1 ? "advisory" : "advisories"})`;
}

/** Labels: the sweep's, plus the server's when the manifest is inside one. */
export function issueLabels(group) {
  const scope = scopeLabel(group.manifestPath);
  return scope ? [...SWEEP_LABELS, scope] : [...SWEEP_LABELS];
}

/**
 * What an npm fix edits, from WHICH copies are vulnerable: the declared copy
 * needs its range raised, a nested or undeclared copy needs an `overrides`
 * pin, and both at once need both.
 */
/**
 * The manifests whose declared range resolves to this copy. A copy under
 * another package's `node_modules` is nobody's declaration. A copy at the top
 * of a workspace's own `node_modules` is that workspace's, and only if that
 * workspace declares the package: the root declaring it says nothing about a
 * copy the workspace could not share. The hoisted root copy serves every
 * manifest that declares the package.
 *
 * @param {{path: string, topLevel: boolean}} entry
 * @param {string[]} declarers every manifest that declares the package
 * @returns {string[]}
 */
export function npmCopyDeclarers(entry, declarers) {
  if (!entry.topLevel) return [];
  const { owner } = splitOwner(entry.path);
  return owner === ""
    ? declarers
    : declarers.filter((m) => m === `${owner}/package.json`);
}

function npmFix(group, { affected, declarers }) {
  const copyDeclarers = (entry) => npmCopyDeclarers(entry, declarers);
  const raise = [...new Set(affected.flatMap(copyDeclarers))].sort();
  const direct = raise.length > 0;
  const nested = affected.filter((entry) => copyDeclarers(entry).length === 0);
  const transitive = nested.length > 0;
  // A package-wide override contradicting ANY declaration of the package is
  // refused (`EOVERRIDE`), so the scoped form is needed whenever one exists,
  // not only when the declared copy is itself vulnerable.
  const scoped = declarers.length > 0;
  const unscopable = nested.some((e) => overrideAncestors(e.path).length === 0);
  const steps = [];
  if (direct) {
    steps.push(
      `**Raise the declared range** in ${raise.map((m) => `\`${m}\``).join(", ")} so \`${group.package}\` can no longer resolve below \`${group.fixedIn}\`, keeping the operator each already uses.`,
    );
  }
  if (transitive) {
    steps.push(
      scoped
        ? `**Add a parent-scoped [\`overrides\`](${DEPENDENCIES_DOC}) entry** in the root \`package.json\` for the nested copies below:\n\n\`\`\`json\n${scopedOverrideExample(nested, group)}\n\`\`\`\n\n${unscopable ? `   A copy at the top of a workspace's own \`node_modules\` names no parent in its path; \`npm explain ${group.package}\` shows which dependency pulls it in, to scope the entry under.\n\n` : ""}   A package-wide \`"${group.package}": "${group.fixedIn}"\` would fail with \`EOVERRIDE\`, because a manifest also declares \`${group.package}\` directly. **Not** \`npm audit fix\`, which can resolve an advisory by silently downgrading.`
        : `**Add an [\`overrides\`](${DEPENDENCIES_DOC}) entry** in the root \`package.json\` pinning \`${group.package}\` to \`>=${group.fixedIn}\`, for the copies below, which no declared range reaches. **Not** \`npm audit fix\`, which can resolve an advisory by silently downgrading.`,
    );
  }
  return steps;
}

/** What a pip fix edits: the declared bound, or the lock alone. */
function pipFix(group, { declaredSpec }) {
  const dir = path.posix.dirname(group.manifestPath);
  if (declaredSpec !== undefined) {
    return [
      `**Raise the declared bound** for \`${group.package}\` in \`${dir}/pyproject.toml\` (today \`${declaredSpec || "unbounded"}\`) to admit nothing below \`${group.fixedIn}\`, then run \`uv lock\` in \`${dir}\` and commit the refreshed \`uv.lock\` with it.`,
    ];
  }
  return [
    `**Run \`uv lock --upgrade-package ${group.package}\`** in \`${dir}\` and commit the refreshed \`uv.lock\`. \`${group.package}\` is transitive here, so no declared range names it. If the package that pulls it in caps it below \`${group.fixedIn}\`, add \`constraint-dependencies = ["${group.package}>=${group.fixedIn}"]\` under \`[tool.uv]\` in \`${dir}/pyproject.toml\` instead.`,
  ];
}

/**
 * @param {ReturnType<typeof groupAlerts>[number]} group narrowed to what applies
 * @param {{affected: Array<{path: string, version: string, topLevel: boolean}>, declarers?: string[], declaredSpec?: string, ghsas?: string[], securityPrsOff?: boolean}} probe
 * @returns {string}
 */
export function buildIssueBody(
  group,
  { affected, declarers = [], declaredSpec, ghsas, securityPrsOff = false },
) {
  const covered = ghsas ?? group.ghsas;
  const applying = group.advisories.length;
  const rows = group.advisories
    .map(
      (a) =>
        `| [${cell(a.ghsa)}](${a.url}) | ${cell(a.cve ?? "—")} | ${cell(a.severity)} | ${cell(a.range)} | ${cell(a.fixedIn)} | ${cell(a.summary)} |`,
    )
    .join("\n");

  // With no listed patched version outside every range, any concrete pin
  // would name a version known to stay vulnerable, so the fix asks for a
  // target first and pins nothing.
  const steps =
    group.targetVerified === false
      ? [
          `**Choose a target first.** No patched version these advisories list is outside every range below (\`${group.fixedIn}\` is still in range of ${(group.targetStillOpen ?? []).map((g) => `\`${g}\``).join(", ")}). Find a release of \`${group.package}\` that no listed range covers, then make the edit this repo uses for it: raise the declared range, or pin it with ${group.ecosystem === "pip" ? "`uv lock --upgrade-package` or `constraint-dependencies`" : "an `overrides` entry"}.`,
        ]
      : group.ecosystem === "pip"
        ? pipFix(group, { declaredSpec })
        : npmFix(group, { affected, declarers });
  const fix = [
    ...(steps.length === 2
      ? [
          "Both edits are needed; neither alone clears every vulnerable copy.",
          "",
        ]
      : []),
    ...steps.map((step, i) => (steps.length > 1 ? `${i + 1}. ${step}` : step)),
    "",
    "| Vulnerable copy | Version |",
    "| --- | --- |",
    ...affected.map((e) => `| \`${cell(e.path)}\` | \`${cell(e.version)}\` |`),
  ].join("\n");

  return [
    buildMarker({ ...group, ghsas: covered }),
    `Filed automatically from ${applying} open Dependabot ${applying === 1 ? "alert" : "alerts"} by the daily alert sweep (#4874). ${securityPrsOff ? "Dependabot opens no security-update PRs on this repo; the" : "The"} fix is written by hand against \`${TARGET_BRANCH}\`.`,
    "",
    "| | |",
    "| --- | --- |",
    `| Package | \`${cell(group.package)}\` (${group.ecosystem}) |`,
    `| Manifest | \`${cell(group.manifestPath)}\` |`,
    `| Vulnerable on \`${TARGET_BRANCH}\` | ${[...new Set(affected.map((e) => e.version))].map((v) => `\`${cell(v)}\``).join(", ") || "—"} |`,
    group.targetVerified === false
      ? `| Bump to | \`${cell(group.fixedIn)}\` is the highest patched version below, but ⚠️ it is still in range of ${(group.targetStillOpen ?? []).map((g) => `\`${cell(g)}\``).join(", ")}: pick a release outside every range listed |`
      : `| Bump to | \`${cell(group.fixedIn)}\`, the lowest patched version below that is outside every range listed |`,
    `| Scope | ${cell(group.scope)} |`,
    `| Highest severity | ${cell(group.severity)} |`,
    "",
    "## Advisories",
    "",
    "| GHSA | CVE | Severity | Vulnerable range | Fixed in | Summary |",
    "| --- | --- | --- | --- | --- | --- |",
    rows,
    "",
    "## Fix",
    "",
    fix,
    "",
    "> [!NOTE]",
    `> The GHSA, CVE, severity, range and summary are the advisory's own, as Dependabot reports them. What this sweep verified against \`${TARGET_BRANCH}\` is the **installed versions and whether each advisory's range still matches them**: GitHub computes alerts from the default branch, so an alert is filed only after that re-check.`,
  ].join("\n");
}

/**
 * The date an already-cleared body records. Reused when the body is
 * regenerated, so a cleared issue, which stays open, is not edited daily for
 * a date change alone.
 *
 * @param {string | undefined} body
 * @returns {string | null}
 */
export function parseClearedDate(body) {
  const match =
    /\*\*No longer applicable on `[^`]+` as of (\d{4}-\d{2}-\d{2})\*\*/.exec(
      body ?? "",
    );
  return match ? match[1] : null;
}

/**
 * The body an issue is rewritten to once its exposure is gone. The marker
 * stays, so the same advisory coming back into range reuses this issue.
 *
 * @param {{package: string, manifestPath: string, fixedIn: string}} group
 * @param {{ghsas: string[], reason: string, today: string}} context
 * @returns {string}
 */
export function buildClearedBody(group, { ghsas, reason, today }) {
  return [
    buildMarker({ ...group, ghsas }),
    `**No longer applicable on \`${TARGET_BRANCH}\` as of ${today}**: ${reason}.`,
    "",
    `\`${group.package}\` is no longer exposed to ${ghsas.length === 1 ? "the advisory" : "the advisories"} below on the branch this repo ships from. This body is rewritten rather than the issue closed, because whether its card belongs in **Done** or should be **deleted** depends on why: a merged fix shipped something, a dismissed alert or a dropped dependency did not.`,
    "",
    `Previously covered: ${ghsas.map((g) => `\`${g}\``).join(", ")}.`,
    "",
    "If the same advisory comes back into range, this issue is reused rather than a new one filed.",
  ].join("\n");
}

/**
 * The comment a NEW advisory for an already-open issue gets. Posted before
 * the body edit, so it claims nothing about the body.
 *
 * @param {ReturnType<typeof groupAlerts>[number]} group
 * @param {string[]} added
 * @returns {string}
 */
export function buildNewAdvisoryComment(group, added) {
  const rows = group.advisories
    .filter((a) => added.includes(a.ghsa))
    .map(
      (a) =>
        `| [${cell(a.ghsa)}](${a.url}) | ${cell(a.severity)} | ${cell(a.summary)} |`,
    )
    .join("\n");
  return [
    buildCommentMarker(added),
    `${added.length} new Dependabot ${added.length === 1 ? "advisory" : "advisories"} for \`${group.package}\`. The bump this issue asks for is now to \`${group.fixedIn}\`${group.targetVerified === false ? "; see the issue body, since no single listed patched version clears every advisory" : `, which clears ${added.length === 1 ? "it" : "them"} along with the rest`}.`,
    "",
    "| GHSA | Severity | Summary |",
    "| --- | --- | --- |",
    rows,
  ].join("\n");
}

/** A rate limit, reported as 403 or 429 with this wording. */
export function isRateLimited(stderr) {
  return /rate limit/i.test(stderr) || /HTTP 429\b/.test(stderr);
}

/**
 * The "this token may not read that" answer, as opposed to a real failure.
 * A rate limit is a 403 too, so it is excluded; 401 is a bad token.
 */
export function isPermissionDenied(stderr) {
  if (isRateLimited(stderr)) return false;
  return /HTTP (403|404)\b/.test(stderr);
}

/**
 * Detect Dependabot's security-update PRs switched back on.
 *
 * @returns {boolean} whether the setting was read and found off
 * @throws on an explicit `enabled: true` (a dry run reports it instead, since
 *   previewing the sweep should not need the setting changed first), or on a
 *   failure that is not a permission refusal
 */
function checkSecurityPrsOff(repo, spawn, { dryRun, log }) {
  const result = gh(spawn, ["api", `repos/${repo}/automated-security-fixes`]);
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    if (!isPermissionDenied(stderr)) {
      throw new Error(`automated-security-fixes lookup failed: ${stderr}`);
    }
    log(
      `${SWEEP}: cannot read automated-security-fixes (${stderr}); the token lacks ` +
        "`administration: read`, so whether Dependabot security PRs are off is UNVERIFIED this run",
    );
    return false;
  }
  // Today the endpoint answers 200 with `{"enabled": …, "paused": …}`. An
  // older contract answered 204 with no body to mean "enabled", so an empty
  // success is read as enabled: reading it as `{}`, i.e. off, would wave the
  // one condition this guard exists for straight through.
  const text = (result.stdout ?? "").trim();
  const state = text === "" ? { enabled: true } : JSON.parse(text);
  if (state.enabled === true) {
    const message =
      "Dependabot security-update PRs are ENABLED. This sweep replaces them, so both are running " +
      "and Dependabot is opening PRs with no issue. Disable them (Settings -> Advanced Security, " +
      `or DELETE /repos/${repo}/automated-security-fixes) and re-run.`;
    if (!dryRun) throw new Error(message);
    log(`${SWEEP}: ⚠️ ${message} (dry run: continuing)`);
    return false;
  }
  return true;
}

/**
 * Every open Dependabot alert. Every failure throws before anything is
 * written: `main()` clears issues whose alerts are gone, so a partial or
 * empty listing would stand down issues for alerts that are still open.
 * `--slurp` keeps one array per page, which `JSON.parse` can read.
 */
function openAlerts(repo, spawn) {
  const result = gh(spawn, [
    "api",
    "--paginate",
    "--slurp",
    `repos/${repo}/dependabot/alerts?state=open&per_page=100`,
  ]);
  const untouched = "no issue was filed, commented on or cleared this run";
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    throw new Error(
      isRateLimited(stderr)
        ? `${SWEEP}: the alert listing was rate-limited (${stderr}); ${untouched}; re-run once the quota resets`
        : `${SWEEP}: the alert listing failed (${stderr}); ${untouched}`,
    );
  }
  let pages;
  try {
    pages = JSON.parse(result.stdout ?? "");
  } catch (error) {
    throw new Error(
      `${SWEEP}: the alert listing returned a truncated or malformed response (${error.message}); ${untouched}`,
      { cause: error },
    );
  }
  // `[[]]` is zero alerts; `[]` is zero pages, which is not the same thing.
  if (
    !Array.isArray(pages) ||
    pages.length === 0 ||
    !pages.every(Array.isArray)
  ) {
    throw new Error(
      `${SWEEP}: the alert listing was not a list of pages; ${untouched}`,
    );
  }
  return pages.flat();
}

/**
 * Read a manifest, keeping "absent" (real evidence the exposure went away)
 * apart from "unparseable" (evidence of nothing).
 *
 * @returns {{lock: object} | {absent: true} | {unparseable: true}}
 */
function readManifest(ecosystem, manifestPath, readFile) {
  let raw;
  try {
    raw = readFile(manifestPath);
  } catch (error) {
    if (error.code === "ENOENT") return { absent: true };
    throw error;
  }
  try {
    if (ecosystem === "pip") {
      if (!manifestPath.endsWith("uv.lock")) return { unparseable: true };
      return { lock: parseUvLock(raw) };
    }
    return { lock: JSON.parse(raw) };
  } catch {
    return { unparseable: true };
  }
}

/** Every GHSA an automation-authored comment on an issue already announced. */
function announcedAdvisories(repo, number, spawn) {
  const announced = new Set();
  for (const comment of issueComments(repo, number, spawn)) {
    if (!isAutomationComment(comment)) continue;
    for (const ghsa of parseCommentMarker(comment.body) ?? []) {
      announced.add(ghsa);
    }
  }
  return announced;
}

/**
 * @param {object} [options]
 * @param {string} [options.repo]
 * @param {string} [options.root] the checkout whose lockfiles are probed
 * @param {typeof spawnSync} [options.spawn]
 * @param {(file: string) => string} [options.readFile] repo-relative reader
 * @param {boolean} [options.dryRun]
 * @param {string} [options.today]
 * @param {(line: string) => void} [options.log]
 * @param {(line: string) => void} [options.warn] for warnings and per-group failures
 */
export function main({
  repo = process.env.GITHUB_REPOSITORY,
  root = repoRoot,
  spawn = spawnSync,
  readFile = (file) => readFileSync(path.join(root, file), "utf8"),
  dryRun = isDryRun(),
  today = new Date().toISOString().slice(0, 10),
  log = console.log,
  warn = console.warn,
} = {}) {
  if (!repo) throw new Error("repo not specified (GITHUB_REPOSITORY unset)");
  const writer = issueWriter({ repo, spawn, dryRun, sweep: SWEEP, log });

  const securityPrsOff = checkSecurityPrsOff(repo, spawn, { dryRun, log });
  const alerts = openAlerts(repo, spawn);
  const groups = groupAlerts(alerts);

  // Loaded before the loop and reconciled after it: a fixed or dismissed
  // alert vanishes from the `state=open` feed, so its issue is found from the
  // issues side.
  const existingIssues = sweepIssues(repo, spawn, {
    state: "open",
    parseMarker,
    sweep: SWEEP,
    warn,
  })
    .map((issue) => ({ ...issue, marker: parseMarker(issue.body) }))
    .filter((issue) => issue.marker);

  const manifests = new Map();
  let milestone;
  const milestoneOnce = () => {
    if (milestone === undefined) milestone = currentMilestone(repo, spawn);
    return milestone;
  };

  const writeCleared = (issue, group, reason) => {
    const priorDate = parseClearedDate(issue.body);
    const ghsas = issue.marker.ghsas;
    if (
      priorDate &&
      issue.body ===
        buildClearedBody(group, { ghsas, reason, today: priorDate })
    ) {
      return;
    }
    writer.edit(issue.number, {
      body: buildClearedBody(group, { ghsas, reason, today }),
    });
    log(`${SWEEP}: cleared #${issue.number}: ${reason}`);
  };

  const seenKeys = new Set();
  /**
   * What this run established about each `(package, manifest, GHSA)`:
   * `tracked` (an issue covers it), `not-exposed` (probed, out of range) or
   * `indeterminate` (could not be probed). Absent means no group carried it.
   *
   * @type {Map<string, "tracked" | "not-exposed" | "indeterminate">}
   */
  const disposition = new Map();
  const note = (group, ghsas, value) => {
    for (const ghsa of ghsas) {
      disposition.set(
        advisoryKey(group.package, group.manifestPath, ghsa),
        value,
      );
    }
  };
  // From the RAW feed, so an advisory that is still open but lost its patched
  // version (and so formed no group) still counts as open.
  const openAdvisories = new Set(
    alerts
      .filter((a) => a.state === "open")
      .map((a) =>
        a.dependency?.package?.name &&
        a.dependency?.manifest_path &&
        a.security_advisory?.ghsa_id
          ? advisoryKey(
              packageKey(
                a.dependency.package.ecosystem,
                a.dependency.package.name,
              ),
              a.dependency.manifest_path,
              a.security_advisory.ghsa_id,
            )
          : null,
      )
      .filter(Boolean),
  );

  for (const rawGroup of groups) {
    seenKeys.add(rawGroup.key);

    if (!SUPPORTED_ECOSYSTEMS.includes(rawGroup.ecosystem)) {
      log(
        `${SWEEP}: ${rawGroup.package} (${rawGroup.ecosystem}, ${rawGroup.manifestPath}) is not an npm or pip dependency; this sweep cannot file it, raise it by hand: ${rawGroup.ghsas.join(", ")}`,
      );
      note(rawGroup, rawGroup.ghsas, "indeterminate");
      continue;
    }

    const existing = existingIssues.find(
      (i) =>
        i.marker.package === rawGroup.package &&
        i.marker.manifestPath === rawGroup.manifestPath,
    );
    const clear = (reason) => {
      if (existing) writeCleared(existing, rawGroup, reason);
    };

    if (!manifests.has(rawGroup.manifestPath)) {
      manifests.set(
        rawGroup.manifestPath,
        readManifest(rawGroup.ecosystem, rawGroup.manifestPath, readFile),
      );
    }
    const manifest = manifests.get(rawGroup.manifestPath);
    if (manifest.unparseable) {
      log(
        `${SWEEP}: ${rawGroup.manifestPath} could not be read as a ${rawGroup.ecosystem} lockfile; skipping ${rawGroup.package} WITHOUT clearing its issue`,
      );
      note(rawGroup, rawGroup.ghsas, "indeterminate");
      continue;
    }
    if (manifest.absent) {
      log(
        `${SWEEP}: ${rawGroup.manifestPath} absent on ${TARGET_BRANCH}; skipping ${rawGroup.package}`,
      );
      note(rawGroup, rawGroup.ghsas, "not-exposed");
      clear(`\`${rawGroup.manifestPath}\` is no longer part of this repo`);
      continue;
    }
    const { lock } = manifest;
    if (isOwnPackage(rawGroup.ecosystem, lock, rawGroup.package)) {
      log(
        `${SWEEP}: ${rawGroup.package} is this repository's own package in ${rawGroup.manifestPath}; its advisories are fixed in the source, not by a bump. Dismiss the alert if the fix has shipped: ${rawGroup.ghsas.join(", ")}`,
      );
      note(rawGroup, rawGroup.ghsas, "indeterminate");
      continue;
    }

    let entries;
    let applicable;
    try {
      entries =
        rawGroup.ecosystem === "pip"
          ? uvLockEntries(lock, rawGroup.package)
          : npmLockEntries(lock, rawGroup.package);
      applicable = narrowToApplicable(rawGroup, entries);
    } catch (error) {
      // A range or version this sweep cannot read is not evidence that the
      // exposure is gone, so the issue is left alone.
      log(
        `${SWEEP}: could not compare ${rawGroup.package} against its advisories (${error.message}); skipping WITHOUT clearing its issue`,
      );
      note(rawGroup, rawGroup.ghsas, "indeterminate");
      continue;
    }
    if (applicable === null) {
      const seen = [...new Set(entries.map((e) => e.version))];
      log(
        `${SWEEP}: ${rawGroup.package}@${seen.join("/") || "(absent)"} is already out of range on ${TARGET_BRANCH}; skipping`,
      );
      note(rawGroup, rawGroup.ghsas, "not-exposed");
      clear(
        seen.length > 0
          ? `every installed copy is out of range (${seen.map((v) => `\`${v}\``).join(", ")})`
          : "the package is no longer installed at all",
      );
      continue;
    }
    const { group, affected } = applicable;
    note(
      rawGroup,
      rawGroup.ghsas.filter((g) => !group.ghsas.includes(g)),
      "not-exposed",
    );
    note(group, group.ghsas, "tracked");

    const probe =
      group.ecosystem === "pip"
        ? { affected, declaredSpec: lock.declared.get(group.package) }
        : { affected, declarers: npmDeclarers(lock, group.package) };

    if (!existing) {
      const created = writer.create({
        title: buildIssueTitle(group),
        labels: issueLabels(group),
        milestone: milestoneOnce(),
        body: buildIssueBody(group, { ...probe, securityPrsOff }),
      });
      if (created.url) {
        log(
          `${SWEEP}: filed ${created.url}${milestone ? "; issue-triage boards it in Todo" : "; no dated milestone, so triage places it in Incoming"}`,
        );
      }
      continue;
    }

    const { merged, added } = mergeGhsas(existing.marker.ghsas, group.ghsas);
    const title = buildIssueTitle(group);
    const body = buildIssueBody(group, {
      ...probe,
      ghsas: merged,
      securityPrsOff,
    });

    // Decided by comparing the rendered issue, not by counting additions: an
    // issue whose exposure shrank has nothing new and is still stale.
    if (
      added.length === 0 &&
      existing.title === title &&
      existing.body === body
    ) {
      log(
        `${SWEEP}: #${existing.number} is up to date for ${group.package}; no-op`,
      );
      continue;
    }

    // Comment FIRST, then rewrite the marker: editing first and failing on the
    // comment would make the next run take the no-op branch and never post it.
    const announced = announcedAdvisories(repo, existing.number, spawn);
    const unannounced = added.filter((ghsa) => !announced.has(ghsa));
    if (unannounced.length > 0) {
      writer.comment(
        existing.number,
        buildNewAdvisoryComment(group, unannounced),
      );
    }
    writer.edit(existing.number, { title, body });
    log(
      added.length > 0
        ? `${SWEEP}: added ${added.join(", ")} to #${existing.number}`
        : `${SWEEP}: refreshed #${existing.number} for ${group.package}`,
    );
  }

  // A marked issue whose bump is no longer in the open feed at all.
  for (const issue of existingIssues) {
    const key = groupKey(issue.marker.package, issue.marker.manifestPath);
    if (seenKeys.has(key)) continue;

    // A vanished KEY is not a closed ADVISORY: an advisory that is still open
    // but lost its patched version forms no group, and must not stand its
    // issue down.
    const key3 = (ghsa) =>
      advisoryKey(issue.marker.package, issue.marker.manifestPath, ghsa);
    const stillOpen = issue.marker.ghsas.filter((g) =>
      openAdvisories.has(key3(g)),
    );
    const unresolved = stillOpen.filter((g) => {
      const state = disposition.get(key3(g));
      return state === undefined || state === "indeterminate";
    });
    if (unresolved.length > 0) {
      log(
        `${SWEEP}: #${issue.number} left as is: ${unresolved.join(", ")} still open and this run could not establish a replacement`,
      );
      continue;
    }
    const reason =
      stillOpen.length === 0
        ? "every alert it tracked has been fixed or dismissed"
        : "no installed copy is in range of its advisories any more";
    writeCleared(
      issue,
      {
        package: issue.marker.package,
        manifestPath: issue.marker.manifestPath,
        fixedIn: issue.marker.fixedIn,
      },
      reason,
    );
  }

  if (groups.length === 0)
    log(`${SWEEP}: no open alerts with a patched version`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
