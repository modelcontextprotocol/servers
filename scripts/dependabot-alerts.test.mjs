// Tests for the daily Dependabot alert sweep (#4874). The grouping, range
// checks, lockfile readers and body builders are driven directly; `main()`
// runs with `gh` replaced by a fake spawn and the lockfiles by an in-memory
// reader, covering filing, the dry run, idempotency, new advisories, clearing,
// reconciliation and every failure that must write nothing. Live filing is
// never exercised against the real tracker. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advisoryKey,
  buildClearedBody,
  buildCommentMarker,
  buildIssueBody,
  buildIssueTitle,
  buildMarker,
  buildNewAdvisoryComment,
  groupAlerts,
  groupKey,
  highestVersion,
  inRange,
  isOwnPackage,
  isPermissionDenied,
  isRateLimited,
  issueLabels,
  main,
  mergeGhsas,
  narrowToApplicable,
  npmDeclarers,
  npmLockEntries,
  overrideAncestors,
  packageKey,
  parseClearedDate,
  parseCommentMarker,
  parseMarker,
  scopedOverrideExample,
  splitOwner,
  toSemverRange,
  uvLockEntries,
} from "./dependabot-alerts.mjs";
import { parseUvLock } from "./lib/uv-lock.mjs";

const bot = { login: "app/github-actions", is_bot: true };
const sweepLabels = [
  { name: "v2" },
  { name: "chore" },
  { name: "dependencies" },
];

/** One raw alert, as the REST API returns it. */
function alert({
  name,
  ecosystem = "npm",
  manifest = "package-lock.json",
  range,
  fixed,
  ghsa,
  severity = "high",
  state = "open",
}) {
  return {
    state,
    html_url: `https://github.com/o/r/security/dependabot/${ghsa}`,
    dependency: {
      package: { name, ecosystem },
      manifest_path: manifest,
      scope: "runtime",
    },
    security_advisory: {
      ghsa_id: ghsa,
      cve_id: null,
      severity,
      summary: `${name} is | bad`,
    },
    security_vulnerability: {
      vulnerable_version_range: range,
      first_patched_version: fixed ? { identifier: fixed } : null,
    },
  };
}

const NPM_LOCK = {
  packages: {
    "": {
      name: "@modelcontextprotocol/servers",
      devDependencies: { semver: "^7" },
    },
    "src/everything": {
      name: "@modelcontextprotocol/server-everything",
      dependencies: { hono: "^4.12.0" },
    },
    "node_modules/hono": { version: "4.12.0" },
    "node_modules/ajv/node_modules/fast-uri": { version: "3.0.1" },
    "node_modules/fast-uri": { version: "3.1.8" },
    "src/filesystem/node_modules/diff": { version: "5.0.0" },
    "node_modules/@modelcontextprotocol/server-everything": {
      link: true,
      resolved: "src/everything",
    },
  },
};

const UV_LOCK = `version = 1

[[package]]
name = "PyJWT"
version = "2.13.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "gitpython"
version = "3.1.45"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "mcp-server-git"
version = "0.6.2"
source = { editable = "." }

[package.metadata]
requires-dist = [
    { name = "gitpython", specifier = ">=3.1.45" },
]
`;

test("markers round-trip", () => {
  const group = {
    package: "pyjwt",
    manifestPath: "src/git/uv.lock",
    fixedIn: "2.15.0",
    ghsas: ["GHSA-b", "GHSA-a"],
  };
  const marker = buildMarker(group);
  assert.equal(
    marker,
    "<!-- dependabot-alerts: pkg=pyjwt; manifest=src/git/uv.lock; fixed=2.15.0; ghsas=GHSA-a,GHSA-b -->",
  );
  assert.deepEqual(parseMarker(`${marker}\nbody`), {
    ...group,
    ghsas: ["GHSA-a", "GHSA-b"],
  });
  assert.equal(parseMarker("no marker"), null);
  assert.deepEqual(
    parseCommentMarker(buildCommentMarker(["GHSA-z", "GHSA-y"])),
    ["GHSA-y", "GHSA-z"],
  );
  assert.equal(parseCommentMarker(undefined), null);
  assert.deepEqual(mergeGhsas(["A", "B"], ["B", "C"]), {
    merged: ["A", "B", "C"],
    added: ["C"],
  });
});

test("ranges: GitHub's commas become semver spaces; pip uses PEP 440", () => {
  assert.equal(toSemverRange(">= 3.1.3, < 3.1.6"), ">= 3.1.3 < 3.1.6");
  assert.equal(inRange("npm", "3.1.4", ">= 3.1.3, < 3.1.6"), true);
  assert.equal(inRange("npm", "3.1.6", ">= 3.1.3, < 3.1.6"), false);
  assert.equal(inRange("pip", "2.13.0", ">= 2.0.0a1, <= 2.14.0"), true);
  assert.equal(inRange("pip", "2.15.0", ">= 2.0.0a1, <= 2.14.0"), false);
  assert.throws(() => inRange("npm", "3.1.4", "whenever"), /cannot compare/);
  assert.throws(() => inRange("npm", "garbage", "< 1"), /cannot compare/);
  assert.throws(() => inRange("pip", "2.13.0", "about 2"), /specifier/);
});

test("pip names are PEP 503 normalized; npm names are exact", () => {
  assert.equal(packageKey("pip", "PyJWT"), "pyjwt");
  assert.equal(packageKey("npm", "PyJWT"), "PyJWT");
  assert.equal(highestVersion("pip", ["2.14.0", "2.15.0", "2.9.0"]), "2.15.0");
  assert.equal(highestVersion("npm", ["4.12.34", "4.13.7", "4.9.0"]), "4.13.7");
  assert.equal(highestVersion("npm", ["b", "a"]), "b");
});

test("groupAlerts makes one group per package and manifest, at the highest patch", () => {
  const groups = groupAlerts([
    alert({
      name: "PyJWT",
      ecosystem: "pip",
      manifest: "src/git/uv.lock",
      range: "<= 2.13.0",
      fixed: "2.14.0",
      ghsa: "GHSA-1",
      severity: "medium",
    }),
    alert({
      name: "pyjwt",
      ecosystem: "pip",
      manifest: "src/git/uv.lock",
      range: ">= 2.0.0a1, <= 2.14.0",
      fixed: "2.15.0",
      ghsa: "GHSA-2",
      severity: "critical",
    }),
    // The same GHSA under the other spelling.
    alert({
      name: "pyjwt",
      ecosystem: "pip",
      manifest: "src/git/uv.lock",
      range: "<= 2.13.0",
      fixed: "2.14.0",
      ghsa: "GHSA-1",
    }),
    alert({
      name: "PyJWT",
      ecosystem: "pip",
      manifest: "src/time/uv.lock",
      range: "<= 2.13.0",
      fixed: "2.14.0",
      ghsa: "GHSA-1",
    }),
    alert({
      name: "pyjwt",
      ecosystem: "pip",
      manifest: "src/git/uv.lock",
      range: "<= 2.13.0",
      fixed: null,
      ghsa: "GHSA-3",
    }),
    alert({
      name: "hono",
      range: "< 4.13.7",
      fixed: "4.13.7",
      ghsa: "GHSA-4",
      state: "fixed",
    }),
  ]);
  assert.deepEqual(
    groups.map((g) => [
      g.package,
      g.manifestPath,
      g.fixedIn,
      g.ghsas,
      g.severity,
    ]),
    [
      ["pyjwt", "src/git/uv.lock", "2.15.0", ["GHSA-1", "GHSA-2"], "critical"],
      ["pyjwt", "src/time/uv.lock", "2.14.0", ["GHSA-1"], "high"],
    ],
  );
  assert.equal(groups[0].key, groupKey("pyjwt", "src/git/uv.lock"));
  assert.notEqual(advisoryKey("a", "m", "G"), advisoryKey("a", "n", "G"));
});

test("npm lockfile reading is workspace-aware", () => {
  assert.deepEqual(splitOwner("src/filesystem/node_modules/diff"), {
    owner: "src/filesystem",
    rest: "node_modules/diff",
  });
  assert.deepEqual(splitOwner("node_modules/diff"), {
    owner: "",
    rest: "node_modules/diff",
  });
  assert.deepEqual(npmLockEntries(NPM_LOCK, "fast-uri"), [
    {
      path: "node_modules/ajv/node_modules/fast-uri",
      version: "3.0.1",
      topLevel: false,
    },
    { path: "node_modules/fast-uri", version: "3.1.8", topLevel: true },
  ]);
  assert.deepEqual(npmLockEntries(NPM_LOCK, "diff"), [
    {
      path: "src/filesystem/node_modules/diff",
      version: "5.0.0",
      topLevel: true,
    },
  ]);
  assert.deepEqual(
    npmLockEntries(NPM_LOCK, "@modelcontextprotocol/server-everything"),
    [],
  );
  assert.deepEqual(npmDeclarers(NPM_LOCK, "hono"), [
    "src/everything/package.json",
  ]);
  assert.deepEqual(npmDeclarers(NPM_LOCK, "semver"), ["package.json"]);
  assert.deepEqual(npmDeclarers(NPM_LOCK, "fast-uri"), []);
  assert.deepEqual(
    overrideAncestors("node_modules/@scope/a/node_modules/b/node_modules/c"),
    ["@scope/a", "b"],
  );
  assert.deepEqual(overrideAncestors("src/x/node_modules/a/node_modules/c"), [
    "a",
  ]);
  assert.deepEqual(
    JSON.parse(
      scopedOverrideExample(
        [
          { path: "node_modules/ajv/node_modules/fast-uri" },
          { path: "node_modules/fast-uri" },
        ],
        { package: "fast-uri", fixedIn: "3.1.8" },
      ),
    ),
    { overrides: { ajv: { "fast-uri": "3.1.8" } } },
  );
});

test("uv lockfile entries match on the normalized name", () => {
  const lock = parseUvLock(UV_LOCK);
  assert.deepEqual(uvLockEntries(lock, "pyjwt"), [
    { path: "PyJWT", version: "2.13.0", topLevel: true },
  ]);
  assert.equal(isOwnPackage("pip", lock, "mcp-server-git"), true);
  assert.equal(isOwnPackage("pip", lock, "gitpython"), false);
  assert.equal(
    isOwnPackage("npm", NPM_LOCK, "@modelcontextprotocol/server-everything"),
    true,
  );
  assert.equal(isOwnPackage("npm", NPM_LOCK, "hono"), false);
});

test("narrowToApplicable keeps only advisories in range, and retargets", () => {
  const [group] = groupAlerts([
    alert({
      name: "gitpython",
      ecosystem: "pip",
      manifest: "src/git/uv.lock",
      range: "<= 3.1.40",
      fixed: "3.1.41",
      ghsa: "GHSA-old",
    }),
    alert({
      name: "gitpython",
      ecosystem: "pip",
      manifest: "src/git/uv.lock",
      range: "<= 3.1.59",
      fixed: "3.1.60",
      ghsa: "GHSA-mid",
      severity: "medium",
    }),
    alert({
      name: "gitpython",
      ecosystem: "pip",
      manifest: "src/git/uv.lock",
      range: "<= 3.1.61",
      fixed: "3.1.62",
      ghsa: "GHSA-new",
      severity: "low",
    }),
  ]);
  const entries = [{ path: "gitpython", version: "3.1.45", topLevel: true }];
  const { group: narrowed, affected } = narrowToApplicable(group, entries);
  assert.deepEqual(narrowed.ghsas, ["GHSA-mid", "GHSA-new"]);
  assert.equal(narrowed.fixedIn, "3.1.62");
  assert.equal(narrowed.severity, "medium");
  assert.deepEqual(affected, entries);
  assert.equal(
    narrowToApplicable(group, [
      { path: "gitpython", version: "3.1.62", topLevel: true },
    ]),
    null,
  );
});

test("titles and labels name the bump and the server", () => {
  const group = {
    package: "pyjwt",
    manifestPath: "src/time/uv.lock",
    fixedIn: "2.15.0",
    advisories: [{}, {}],
  };
  assert.equal(
    buildIssueTitle(group),
    "chore(deps): bump `pyjwt` to `2.15.0` in `src/time/uv.lock` (2 advisories)",
  );
  assert.equal(
    buildIssueTitle({ ...group, advisories: [{}] }).endsWith("(1 advisory)"),
    true,
  );
  assert.deepEqual(issueLabels(group), [
    "v2",
    "chore",
    "dependencies",
    "server-time",
  ]);
  assert.deepEqual(issueLabels({ manifestPath: "package-lock.json" }), [
    "v2",
    "chore",
    "dependencies",
  ]);
});

function npmGroup(pkg, fixedIn, range = "< 99") {
  const [group] = groupAlerts([
    alert({ name: pkg, range, fixed: fixedIn, ghsa: "GHSA-x" }),
  ]);
  return group;
}

test("an npm body says which edit clears which copy", () => {
  const group = npmGroup("fast-uri", "3.1.8");
  const transitive = buildIssueBody(group, {
    affected: [
      {
        path: "node_modules/ajv/node_modules/fast-uri",
        version: "3.0.1",
        topLevel: false,
      },
    ],
    declarers: [],
  });
  assert.match(transitive, /\*\*Add an \[`overrides`\]/);
  assert.ok(!transitive.includes("Raise the declared range"));

  const direct = buildIssueBody(npmGroup("hono", "4.13.7"), {
    affected: [
      { path: "node_modules/hono", version: "4.12.0", topLevel: true },
    ],
    declarers: ["src/everything/package.json"],
    securityPrsOff: true,
  });
  assert.match(
    direct,
    /\*\*Raise the declared range\*\* in `src\/everything\/package.json`/,
  );
  assert.match(direct, /Dependabot opens no security-update PRs/);

  const both = buildIssueBody(group, {
    affected: [
      { path: "node_modules/fast-uri", version: "3.0.0", topLevel: true },
      {
        path: "node_modules/ajv/node_modules/fast-uri",
        version: "3.0.1",
        topLevel: false,
      },
    ],
    declarers: ["package.json"],
  });
  assert.match(both, /Both edits are needed/);
  assert.match(both, /1\. \*\*Raise/);
  assert.match(both, /2\. \*\*Add a parent-scoped/);
  assert.match(both, /EOVERRIDE/);
  // The pipe in the summary is escaped, so the table keeps its shape.
  assert.match(both, /fast-uri is \\\| bad/);
});

test("a pip body says whether to raise the bound or refresh the lock", () => {
  const [group] = groupAlerts([
    alert({
      name: "GitPython",
      ecosystem: "pip",
      manifest: "src/git/uv.lock",
      range: "<= 3.1.61",
      fixed: "3.1.62",
      ghsa: "GHSA-g",
    }),
  ]);
  const affected = [{ path: "gitpython", version: "3.1.45", topLevel: true }];
  const direct = buildIssueBody(group, { affected, declaredSpec: ">=3.1.45" });
  assert.match(
    direct,
    /\*\*Raise the declared bound\*\* for `gitpython` in `src\/git\/pyproject.toml` \(today `>=3.1.45`\)/,
  );
  const unbounded = buildIssueBody(group, { affected, declaredSpec: "" });
  assert.match(unbounded, /today `unbounded`/);
  const transitive = buildIssueBody(group, { affected });
  assert.match(
    transitive,
    /`uv lock --upgrade-package gitpython`\*\* in `src\/git`/,
  );
  assert.match(transitive, /constraint-dependencies/);
});

test("cleared bodies keep the marker and their first date", () => {
  const group = {
    package: "pyjwt",
    manifestPath: "src/git/uv.lock",
    fixedIn: "2.15.0",
  };
  const body = buildClearedBody(group, {
    ghsas: ["GHSA-1"],
    reason: "gone",
    today: "2026-10-20",
  });
  assert.deepEqual(parseMarker(body).ghsas, ["GHSA-1"]);
  assert.equal(parseClearedDate(body), "2026-10-20");
  assert.equal(parseClearedDate("nothing"), null);
  assert.match(
    buildClearedBody(group, { ghsas: ["A", "B"], reason: "r", today: "d" }),
    /the advisories/,
  );
});

test("the new-advisory comment carries its own marker", () => {
  const [group] = groupAlerts([
    alert({ name: "hono", range: "< 5", fixed: "4.13.7", ghsa: "GHSA-new" }),
  ]);
  const comment = buildNewAdvisoryComment(group, ["GHSA-new"]);
  assert.deepEqual(parseCommentMarker(comment), ["GHSA-new"]);
  assert.match(comment, /now to `4\.13\.7`/);
});

test("a permission refusal is told apart from a rate limit", () => {
  assert.equal(
    isPermissionDenied("HTTP 403: Resource not accessible by integration"),
    true,
  );
  assert.equal(isPermissionDenied("HTTP 404: Not Found"), true);
  assert.equal(isPermissionDenied("HTTP 403: API rate limit exceeded"), false);
  assert.equal(isPermissionDenied("HTTP 401: Bad credentials"), false);
  assert.equal(isRateLimited("HTTP 429"), true);
});

/** The tracker and the checkout, faked. */
function fakeWorld(state = {}) {
  const calls = [];
  const s = {
    securityFixes: {
      status: 403,
      stderr: "HTTP 403: Resource not accessible by integration",
    },
    alerts: [[]],
    alertsRaw: undefined,
    issues: [],
    comments: {},
    milestones: [
      { title: "v2.0.0", state: "open", due_on: "2026-10-17T00:00:00Z" },
    ],
    files: {
      "package-lock.json": JSON.stringify(NPM_LOCK),
      "src/git/uv.lock": UV_LOCK,
    },
    ...state,
  };
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, input: opts?.input });
    const ok = (extra) => ({ status: 0, stdout: "", stderr: "", ...extra });
    if (cmd !== "gh") throw new Error(`unexpected ${cmd}`);
    const [a, b] = args;
    if (a === "api" && /automated-security-fixes/.test(b)) {
      const r = s.securityFixes;
      return r.status === 0
        ? ok({ stdout: r.body === undefined ? "" : JSON.stringify(r.body) })
        : ok({ status: 1, stderr: r.stderr });
    }
    if (a === "api" && args.some((x) => /dependabot\/alerts/.test(x))) {
      if (s.alertsFail) return ok({ status: 1, stderr: s.alertsFail });
      return ok({ stdout: s.alertsRaw ?? JSON.stringify(s.alerts) });
    }
    if (a === "api" && /milestones/.test(b))
      return ok({ stdout: JSON.stringify(s.milestones) });
    if (a === "api" && args.some((x) => /\/comments/.test(x))) {
      const n = args
        .find((x) => /issues\/\d+\/comments/.test(x))
        .match(/issues\/(\d+)/)[1];
      return ok({ stdout: JSON.stringify([s.comments[n] ?? []]) });
    }
    if (a === "issue" && b === "list")
      return ok({ stdout: JSON.stringify(s.issues) });
    if (a === "issue" && b === "create")
      return ok({ stdout: "https://github.com/o/r/issues/500\n" });
    if (a === "issue" && (b === "edit" || b === "comment")) return ok();
    throw new Error(`unexpected gh ${args.join(" ")}`);
  };
  const readFile = (file) => {
    if (!(file in s.files))
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    return s.files[file];
  };
  const lines = [];
  const warnings = [];
  return {
    spawn,
    readFile,
    calls,
    lines,
    warnings,
    log: (l) => lines.push(l),
  };
}

const writes = (calls) =>
  calls.filter(
    (c) =>
      c.args[0] === "issue" &&
      ["create", "edit", "comment"].includes(c.args[1]),
  );
const run = (world, extra = {}) =>
  main({
    repo: "o/r",
    spawn: world.spawn,
    readFile: world.readFile,
    log: world.log,
    warn: (w) => world.warnings.push(w),
    dryRun: false,
    today: "2026-10-20",
    ...extra,
  });

const pipAlerts = [
  alert({
    name: "PyJWT",
    ecosystem: "pip",
    manifest: "src/git/uv.lock",
    range: "<= 2.13.0",
    fixed: "2.14.0",
    ghsa: "GHSA-1",
  }),
  alert({
    name: "pyjwt",
    ecosystem: "pip",
    manifest: "src/git/uv.lock",
    range: ">= 2.0.0a1, <= 2.14.0",
    fixed: "2.15.0",
    ghsa: "GHSA-2",
  }),
];

test("main files one labeled, milestoned issue per bump", () => {
  const world = fakeWorld({
    alerts: [
      pipAlerts,
      [
        alert({
          name: "hono",
          range: "< 4.13.7",
          fixed: "4.13.7",
          ghsa: "GHSA-h",
        }),
      ],
    ],
  });
  run(world);
  const created = writes(world.calls);
  assert.equal(created.length, 2);
  const [hono, pyjwt] = created;
  assert.ok(
    hono.args.includes(
      "chore(deps): bump `hono` to `4.13.7` in `package-lock.json` (1 advisory)",
    ),
  );
  assert.ok(
    pyjwt.args.includes(
      "chore(deps): bump `pyjwt` to `2.15.0` in `src/git/uv.lock` (2 advisories)",
    ),
  );
  assert.deepEqual(
    pyjwt.args.filter((_, i) => pyjwt.args[i - 1] === "--label"),
    ["v2", "chore", "dependencies", "server-git"],
  );
  assert.equal(pyjwt.args[pyjwt.args.indexOf("--milestone") + 1], "v2.0.0");
  assert.match(
    pyjwt.input,
    /^<!-- dependabot-alerts: pkg=pyjwt; manifest=src\/git\/uv.lock; fixed=2.15.0; ghsas=GHSA-1,GHSA-2 -->/,
  );
  assert.match(world.lines.join("\n"), /UNVERIFIED/);
  // The milestone is read once per run, not once per issue.
  assert.equal(
    world.calls.filter((c) => /milestones/.test(c.args[1] ?? "")).length,
    1,
  );
});

test("a dry run prints the payloads and writes nothing, even with security PRs on", () => {
  const world = fakeWorld({
    alerts: [pipAlerts],
    securityFixes: { status: 0, body: { enabled: true } },
  });
  run(world, { dryRun: true });
  assert.equal(writes(world.calls).length, 0);
  const out = world.lines.join("\n");
  assert.match(out, /ENABLED.*dry run: continuing/);
  assert.match(out, /would create an issue/);
  assert.match(out, /labels: v2, chore, dependencies, server-git/);
  assert.match(out, /milestone: v2\.0\.0/);
});

test("a real run fails on security PRs switched back on, before reading alerts", () => {
  const world = fakeWorld({
    alerts: [pipAlerts],
    securityFixes: { status: 0, body: { enabled: true } },
  });
  assert.throws(() => run(world), /ENABLED/);
  assert.ok(
    !world.calls.some((c) => c.args.some((x) => /dependabot\/alerts/.test(x))),
  );
});

test("an empty success (the older 204 contract) reads as enabled", () => {
  const world = fakeWorld({
    alerts: [pipAlerts],
    securityFixes: { status: 0 },
  });
  assert.throws(() => run(world), /ENABLED/);
});

test("security PRs read back as off are stated in the body", () => {
  const world = fakeWorld({
    alerts: [pipAlerts],
    securityFixes: { status: 0, body: { enabled: false } },
  });
  run(world);
  assert.match(
    writes(world.calls)[0].input,
    /Dependabot opens no security-update PRs/,
  );
});

test("any other failure reading the setting fails the run", () => {
  const world = fakeWorld({
    securityFixes: { status: 1, stderr: "HTTP 500: boom" },
  });
  assert.throws(() => run(world), /automated-security-fixes lookup failed/);
});

test("a failed or malformed alert listing writes nothing", () => {
  for (const [state, pattern] of [
    [{ alertsFail: "HTTP 403: API rate limit exceeded" }, /rate-limited/],
    [{ alertsFail: "HTTP 502" }, /alert listing failed/],
    [{ alertsRaw: "[[{" }, /truncated or malformed/],
    [{ alertsRaw: "[]" }, /not a list of pages/],
    [{ alertsRaw: "{}" }, /not a list of pages/],
  ]) {
    const world = fakeWorld({
      ...state,
      issues: [
        {
          number: 1,
          title: "t",
          body: buildMarker({
            package: "x",
            manifestPath: "package-lock.json",
            fixedIn: "1",
            ghsas: ["G"],
          }),
          author: bot,
          labels: sweepLabels,
        },
      ],
    });
    assert.throws(() => run(world), pattern);
    assert.equal(writes(world.calls).length, 0);
  }
});

/** The issue a first run would file, presented back as already open. */
function filedIssue(alerts, number = 41) {
  const first = fakeWorld({ alerts: [alerts] });
  run(first);
  const create = writes(first.calls)[0];
  return {
    number,
    title: create.args[create.args.indexOf("--title") + 1],
    body: create.input,
    state: "OPEN",
    author: bot,
    labels: sweepLabels,
  };
}

test("a second run over the same alerts is a no-op", () => {
  const issue = filedIssue(pipAlerts);
  const world = fakeWorld({ alerts: [pipAlerts], issues: [issue] });
  run(world);
  assert.equal(writes(world.calls).length, 0);
});

test("a look-alike issue from an outsider does not suppress filing", () => {
  const issue = { ...filedIssue(pipAlerts), author: { login: "octocat" } };
  const world = fakeWorld({ alerts: [pipAlerts], issues: [issue] });
  run(world);
  assert.equal(writes(world.calls)[0].args[1], "create");
  assert.match(world.warnings.join("\n"), /"octocat"/);
});

test("a new advisory is commented FIRST, then the issue rewritten", () => {
  const issue = filedIssue([pipAlerts[0]]);
  const world = fakeWorld({ alerts: [pipAlerts], issues: [issue] });
  run(world);
  const [comment, edit] = writes(world.calls);
  assert.deepEqual(comment.args.slice(0, 3), ["issue", "comment", "41"]);
  assert.deepEqual(parseCommentMarker(comment.input), ["GHSA-2"]);
  assert.deepEqual(edit.args.slice(0, 3), ["issue", "edit", "41"]);
  assert.match(edit.input, /fixed=2\.15\.0; ghsas=GHSA-1,GHSA-2/);
  assert.ok(
    edit.args.includes(
      "chore(deps): bump `pyjwt` to `2.15.0` in `src/git/uv.lock` (2 advisories)",
    ),
  );
});

test("an advisory the automation already announced is not announced again", () => {
  const issue = filedIssue([pipAlerts[0]]);
  const announced = {
    body: buildCommentMarker(["GHSA-2"]),
    user: { login: "github-actions[bot]", type: "Bot" },
  };
  const forged = {
    body: buildCommentMarker(["GHSA-2"]),
    user: { login: "octocat", type: "User" },
  };
  const world = fakeWorld({
    alerts: [pipAlerts],
    issues: [issue],
    comments: { 41: [announced] },
  });
  run(world);
  assert.deepEqual(
    writes(world.calls).map((c) => c.args[1]),
    ["edit"],
  );

  const forgedWorld = fakeWorld({
    alerts: [pipAlerts],
    issues: [issue],
    comments: { 41: [forged] },
  });
  run(forgedWorld);
  assert.deepEqual(
    writes(forgedWorld.calls).map((c) => c.args[1]),
    ["comment", "edit"],
  );
});

test("an exposure fixed on v2/main clears its issue, once", () => {
  const issue = filedIssue(pipAlerts);
  const fixedLock = UV_LOCK.replace('version = "2.13.0"', 'version = "2.15.0"');
  const world = fakeWorld({
    alerts: [pipAlerts],
    issues: [issue],
    files: { "src/git/uv.lock": fixedLock },
  });
  run(world);
  const [edit] = writes(world.calls);
  assert.match(
    edit.input,
    /\*\*No longer applicable on `v2\/main` as of 2026-10-20\*\*: every installed copy is out of range \(`2\.15\.0`\)/,
  );

  const again = fakeWorld({
    alerts: [pipAlerts],
    issues: [{ ...issue, body: edit.input }],
    files: { "src/git/uv.lock": fixedLock },
  });
  run(again, { today: "2026-10-21" });
  assert.equal(writes(again.calls).length, 0);
});

test("a manifest gone from the branch clears; an unreadable one does not", () => {
  const issue = filedIssue(pipAlerts);
  const gone = fakeWorld({ alerts: [pipAlerts], issues: [issue], files: {} });
  run(gone);
  assert.match(writes(gone.calls)[0].input, /is no longer part of this repo/);

  const npmIssue = filedIssue([
    alert({ name: "hono", range: "< 4.13.7", fixed: "4.13.7", ghsa: "GHSA-h" }),
  ]);
  const garbled = fakeWorld({
    alerts: [
      [
        alert({
          name: "hono",
          range: "< 4.13.7",
          fixed: "4.13.7",
          ghsa: "GHSA-h",
        }),
      ],
    ],
    issues: [npmIssue],
    files: { "package-lock.json": "{ not json" },
  });
  run(garbled);
  assert.equal(writes(garbled.calls).length, 0);
  assert.match(garbled.lines.join("\n"), /WITHOUT clearing/);
});

test("an unreadable range skips the group without clearing", () => {
  const bad = [
    alert({
      name: "hono",
      range: "sometime last year",
      fixed: "4.13.7",
      ghsa: "GHSA-h",
    }),
  ];
  const world = fakeWorld({ alerts: [bad] });
  run(world);
  assert.equal(writes(world.calls).length, 0);
  assert.match(world.lines.join("\n"), /could not compare hono/);
});

test("the server's own package and other ecosystems are reported, not filed", () => {
  const world = fakeWorld({
    alerts: [
      [
        alert({
          name: "mcp-server-git",
          ecosystem: "pip",
          manifest: "src/git/uv.lock",
          range: "< 2026.1.14",
          fixed: "2026.1.14",
          ghsa: "GHSA-own",
        }),
        alert({
          name: "actions/cache",
          ecosystem: "actions",
          manifest: ".github/workflows/ci.yml",
          range: "< 4",
          fixed: "4.0.0",
          ghsa: "GHSA-act",
        }),
      ],
    ],
  });
  run(world);
  assert.equal(writes(world.calls).length, 0);
  const out = world.lines.join("\n");
  assert.match(
    out,
    /mcp-server-git is this repository's own package.*Dismiss the alert/,
  );
  assert.match(out, /actions\/cache \(actions.*raise it by hand/);
});

test("reconciliation clears an issue whose alerts all closed, and keeps one still open", () => {
  const issue = filedIssue(pipAlerts);
  const closed = fakeWorld({ alerts: [[]], issues: [issue] });
  run(closed);
  assert.match(
    writes(closed.calls)[0].input,
    /every alert it tracked has been fixed or dismissed/,
  );
  assert.match(closed.lines.join("\n"), /no open alerts/);

  // Still open, but with no patched version now: no group, so no evidence.
  const lostPatch = pipAlerts.map((a) => ({
    ...a,
    security_vulnerability: {
      ...a.security_vulnerability,
      first_patched_version: null,
    },
  }));
  const kept = fakeWorld({ alerts: [lostPatch], issues: [issue] });
  run(kept);
  assert.equal(writes(kept.calls).length, 0);
  assert.match(kept.lines.join("\n"), /left as is/);
});

test("main needs a repo", () => {
  assert.throws(() => main({ repo: "", log: () => {} }), /GITHUB_REPOSITORY/);
});
