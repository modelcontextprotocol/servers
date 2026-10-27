// Tests for the nightly SDK watch (#4874). The pure halves are driven
// directly; `main()` runs with `npm`, `curl` and `gh` replaced by a fake spawn
// and the manifests by an in-memory reader, covering filing, the dry run,
// suppression, the analysis retry, supersession, the refresh of an open
// issue whose rows changed (#5067) and the failure paths. The
// last tests read `.github/workflows/sdk-watch.yml` and pin the properties its
// security rests on, so editing the workflow cannot quietly undo them. Run
// via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  ANALYSIS_MARKER,
  SDK_GROUPS,
  appliedScopes,
  assertEveryPackageWatched,
  bodyScopes,
  buildAppliedMarker,
  buildIssueBody,
  buildIssueTitle,
  buildMarker,
  buildSupersededComment,
  checklist,
  formatFiledOutput,
  groupState,
  hasAnalysis,
  issueLabels,
  main,
  markRows,
  needsManifestEdit,
  parseMarker,
  parseSupersededMarker,
  readInstalls,
  refreshPlan,
  versioning,
} from "./sdk-watch.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const group = (key) => SDK_GROUPS.find((g) => g.key === key);
const bot = { login: "app/github-actions", is_bot: true };
const sweepLabels = [
  { name: "v2" },
  { name: "chore" },
  { name: "dependencies" },
];

test("every SDK group is an MCP-org upstream (the #5069 risk acceptance)", () => {
  // The analysis job's residual credential channel is accepted only because
  // these upstreams are trusted MCP-org SDKs. A group outside the org needs
  // that decision taken again before it is added here.
  for (const g of SDK_GROUPS) {
    assert.match(g.repo, /^modelcontextprotocol\//, `${g.key}: ${g.repo}`);
  }
});

test("markers round-trip", () => {
  const marker = buildMarker(group("python-sdk"), "2.3.0");
  assert.deepEqual(parseMarker(`${marker}\nbody`), {
    key: "python-sdk",
    target: "2.3.0",
  });
  assert.equal(parseMarker("nope"), null);
  assert.equal(
    parseSupersededMarker(buildSupersededComment(12, "2.4.0", "2.3.0")),
    "12",
  );
  assert.equal(parseSupersededMarker("x"), null);
});

test("versioning orders npm by semver and PyPI by PEP 440", () => {
  assert.ok(versioning("npm").compare("1.10.0", "1.9.0") > 0);
  assert.ok(versioning("pypi").compare("2.0.0rc1", "2.0.0") < 0);
  assert.equal(versioning("npm").valid("nope"), false);
  assert.equal(versioning("pypi").valid("nope"), false);
  assert.equal(versioning("pypi").valid("2.3.0"), true);
  assert.equal(versioning("npm").admits("1.32.1", "^1.30.0"), true);
  assert.equal(versioning("npm").admits("1.32.1", "not a range"), false);
  assert.equal(versioning("pypi").admits("2.3.0", ">=1.29.0,<2"), false);
  assert.equal(versioning("pypi").admits("2.3.0", ""), true);
});

test("assertEveryPackageWatched fails on an unlisted SDK package only", () => {
  assert.doesNotThrow(() =>
    assertEveryPackageWatched(
      {
        "package.json": {
          "@modelcontextprotocol/server-everything": "*",
          "@modelcontextprotocol/sdk": "^1",
        },
        "src/everything/package.json": {
          "@modelcontextprotocol/server": "^2",
          zod: "^4",
        },
      },
      ["@modelcontextprotocol/server-everything"],
    ),
  );
  assert.throws(
    () =>
      assertEveryPackageWatched(
        { "src/x/package.json": { "@modelcontextprotocol/express": "^2" } },
        [],
      ),
    /@modelcontextprotocol\/express/,
  );
});

const row = (name, where, declared, installed) => ({
  name,
  where,
  declared,
  installed,
});

test("groupState targets the lowest latest of a lockstep group", () => {
  const g = group("typescript-sdk");
  const rows = [
    row("@modelcontextprotocol/client", "src/a", "^2.1.0", "2.1.0"),
    row("@modelcontextprotocol/server", "src/a", "^2.1.0", "2.1.0"),
  ];
  const state = groupState(g, rows, {
    "@modelcontextprotocol/client": "2.2.0",
    "@modelcontextprotocol/server": "2.1.5",
  });
  assert.equal(state.target, "2.1.5");
  assert.ok(state.rows.every((r) => r.behind));
  assert.match(buildIssueBody(state), /publication|being published/);
  assert.equal(
    groupState(g, rows, {
      "@modelcontextprotocol/client": "2.1.0",
      "@modelcontextprotocol/server": "2.1.0",
    }),
    null,
  );
  assert.equal(
    groupState(g, rows, { "@modelcontextprotocol/client": "2.2.0" }),
    null,
  );
  assert.equal(groupState(g, [], {}), null);
});

test("groupState compares PyPI versions per lockfile", () => {
  const state = groupState(
    group("python-sdk"),
    [
      row("mcp", "src/fetch", ">=1.29.0,<2", "1.29.0"),
      row("mcp", "src/git", ">=1.29.0,<2", "2.3.0"),
      row("mcp", "src/time", "", null),
    ],
    { mcp: "2.3.0" },
  );
  assert.deepEqual(
    state.rows.map((r) => r.behind),
    [true, false, false],
  );
});

test("needsManifestEdit and the checklist follow the declared ranges", () => {
  const lock = groupState(
    group("typescript-sdk-v1"),
    [row("@modelcontextprotocol/sdk", "src/a", "^1.30.0", "1.30.0")],
    { "@modelcontextprotocol/sdk": "1.32.1" },
  );
  assert.equal(needsManifestEdit(lock), false);
  assert.match(checklist(lock)[0], /No manifest edit needed/);

  const major = groupState(
    group("python-sdk"),
    [row("mcp", "src/fetch", ">=1.29.0,<2", "1.29.0")],
    { mcp: "2.3.0" },
  );
  assert.equal(needsManifestEdit(major), true);
  assert.match(checklist(major)[0], /Raise the `mcp` bound/);
  assert.match(checklist(major)[1], /uv lock --upgrade-package mcp/);

  const unreadable = groupState(
    group("python-sdk"),
    [row("mcp", "src/fetch", "about 1", "1.29.0")],
    { mcp: "2.3.0" },
  );
  assert.equal(needsManifestEdit(unreadable), true);
  const npmEdit = groupState(
    group("typescript-sdk-v1"),
    [row("@modelcontextprotocol/sdk", "src/a", "~1.30.0", "1.30.0")],
    { "@modelcontextprotocol/sdk": "1.32.1" },
  );
  assert.match(checklist(npmEdit)[0], /changeset/);
});

test("titles, labels and bodies", () => {
  const state = groupState(
    group("python-sdk"),
    [
      row("mcp", "src/fetch", ">=1.29.0,<2", "1.29.0"),
      row("mcp", "src/time", ">=1.29.0,<2", "1.29.0"),
    ],
    { mcp: "2.3.0" },
  );
  assert.equal(
    buildIssueTitle(state),
    "chore(deps): upgrade the MCP Python SDK to 2.3.0",
  );
  assert.deepEqual(issueLabels(state), [
    "v2",
    "chore",
    "dependencies",
    "server-fetch",
    "server-time",
  ]);
  const body = buildIssueBody(state);
  assert.ok(body.startsWith(buildMarker(state.group, "2.3.0")));
  assert.match(
    body,
    /\| `mcp` \| `src\/fetch` \| >=1\.29\.0,<2 \| 1\.29\.0 \| 2\.3\.0 \| \*\*yes\*\* \|/,
  );
  assert.match(body, /PyPI/);
  assert.ok(!body.includes("being published"));

  const everywhere = {
    group: group("typescript-sdk-v1"),
    target: "1",
    rows: [
      "everything",
      "filesystem",
      "memory",
      "sequentialthinking",
      "fetch",
      "git",
      "time",
    ].map((s) => ({ where: `src/${s}`, behind: true })),
  };
  assert.deepEqual(issueLabels(everywhere), ["v2", "chore", "dependencies"]);
  // Only servers that are behind are labeled.
  const partly = groupState(
    group("python-sdk"),
    [
      row("mcp", "src/fetch", "", "2.3.0"),
      row("mcp", "src/time", "", "1.29.0"),
    ],
    { mcp: "2.3.0" },
  );
  assert.deepEqual(issueLabels(partly), [
    "v2",
    "chore",
    "dependencies",
    "server-time",
  ]);
  assert.deepEqual(
    issueLabels({
      group: group("typescript-sdk-v1"),
      rows: [{ where: "root", behind: true }],
    }),
    ["v2", "chore", "dependencies"],
  );
});

test("hasAnalysis trusts only the automation's comment", () => {
  assert.equal(
    hasAnalysis([
      {
        body: `${ANALYSIS_MARKER}\nx`,
        user: { login: "github-actions[bot]", type: "Bot" },
      },
    ]),
    true,
  );
  assert.equal(
    hasAnalysis([
      {
        body: `${ANALYSIS_MARKER}\nx`,
        user: { login: "octocat", type: "User" },
      },
    ]),
    false,
  );
  assert.equal(
    hasAnalysis([
      {
        body: `quoting ${ANALYSIS_MARKER}`,
        user: { login: "github-actions[bot]", type: "Bot" },
      },
    ]),
    false,
  );
});

test("formatFiledOutput is one GITHUB_OUTPUT line", () => {
  assert.equal(formatFiledOutput([]), "filed=[]");
});

const NPM_LOCK = {
  packages: {
    "": { name: "@modelcontextprotocol/servers" },
    "node_modules/@modelcontextprotocol/sdk": { version: "1.30.0" },
    "src/memory/node_modules/@modelcontextprotocol/sdk": { version: "1.29.0" },
  },
};
const UV = (version) => `[[package]]
name = "mcp"
version = "${version}"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "mcp-server-time"
version = "0.6.2"
source = { editable = "." }

[package.metadata]
requires-dist = [{ name = "mcp", specifier = ">=1.29.0,<2" }]
`;

function files(overrides = {}) {
  return {
    "package.json": JSON.stringify({
      name: "@modelcontextprotocol/servers",
      devDependencies: { "@modelcontextprotocol/sdk": "^1.30.0" },
    }),
    "src/memory/package.json": JSON.stringify({
      name: "@modelcontextprotocol/server-memory",
      dependencies: { "@modelcontextprotocol/sdk": "^1.29.0" },
    }),
    "package-lock.json": JSON.stringify(NPM_LOCK),
    "src/time/uv.lock": UV("1.29.0"),
    ...overrides,
  };
}

test("readInstalls finds each declaration and the copy it resolves to", () => {
  const f = files();
  const installs = readInstalls(
    (p) => f[p],
    (p) => p in f,
  );
  assert.deepEqual(installs.ownPackages, [
    "@modelcontextprotocol/servers",
    "@modelcontextprotocol/server-memory",
  ]);
  assert.deepEqual(installs.rowsFor(group("typescript-sdk-v1")), [
    row("@modelcontextprotocol/sdk", "root", "^1.30.0", "1.30.0"),
    row("@modelcontextprotocol/sdk", "src/memory", "^1.29.0", "1.29.0"),
  ]);
  assert.deepEqual(installs.rowsFor(group("python-sdk")), [
    row("mcp", "src/time", ">=1.29.0,<2", "1.29.0"),
  ]);
  assert.deepEqual(installs.rowsFor(group("typescript-sdk")), []);
});

test("readInstalls reports every locked version of a forked resolution", () => {
  const forked = UV("1.29.0").replace(
    '[[package]]\nname = "mcp-server-time"',
    '[[package]]\nname = "mcp"\nversion = "1.27.0"\nsource = { registry = "https://pypi.org/simple" }\n\n[[package]]\nname = "mcp-server-time"',
  );
  const f = files({ "src/time/uv.lock": forked });
  const installs = readInstalls(
    (p) => f[p],
    (p) => p in f,
  );
  assert.deepEqual(
    installs.rowsFor(group("python-sdk")).map((r) => r.installed),
    ["1.29.0", "1.27.0"],
  );
  const state = groupState(
    group("python-sdk"),
    installs.rowsFor(group("python-sdk")),
    {
      mcp: "1.29.0",
    },
  );
  // The older fork is behind even though the first entry is current.
  assert.deepEqual(
    state.rows.map((r) => r.behind),
    [false, true],
  );
});

/** The registries, the tracker and the checkout, faked. */
function fakeWorld(state = {}) {
  const calls = [];
  const s = {
    npm: { "@modelcontextprotocol/sdk": "1.32.1" },
    pypi: { mcp: "2.3.0" },
    issues: [],
    comments: {},
    nextIssue: 600,
    files: files(),
    ...state,
  };
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, input: opts?.input });
    const ok = (extra) => ({ status: 0, stdout: "", stderr: "", ...extra });
    if (cmd === "npm") {
      if (s.npmFail) return ok({ status: 1, stderr: "E503" });
      return ok({ stdout: `${s.npm[args[1]]}\n` });
    }
    if (cmd === "curl") {
      if (s.pypiRaw !== undefined) return ok({ stdout: s.pypiRaw });
      const pkg = args.at(-1).match(/pypi\/([^/]+)\/json/)[1];
      return ok({ stdout: JSON.stringify({ info: { version: s.pypi[pkg] } }) });
    }
    if (cmd !== "gh") throw new Error(`unexpected ${cmd}`);
    const [a, b] = args;
    if (a === "api" && /milestones/.test(b)) {
      return ok({
        stdout: JSON.stringify([
          { title: "v2.0.0", state: "open", due_on: "2026-10-17T00:00:00Z" },
        ]),
      });
    }
    if (a === "api" && args.some((x) => /\/comments/.test(x))) {
      const n = args
        .find((x) => /issues\/\d+\/comments/.test(x))
        .match(/issues\/(\d+)/)[1];
      return ok({ stdout: JSON.stringify([s.comments[n] ?? []]) });
    }
    if (a === "issue" && b === "list")
      return ok({ stdout: JSON.stringify(s.issues) });
    if (a === "issue" && b === "create") {
      if (s.createFail?.(args)) return ok({ status: 1, stderr: "boom" });
      return ok({ stdout: `https://github.com/o/r/issues/${s.nextIssue++}\n` });
    }
    if (a === "issue" && b === "edit") {
      if (s.editFail) return ok({ status: 1, stderr: "edit boom" });
      return ok();
    }
    if (a === "issue" && b === "comment") {
      if (s.commentFail) return ok({ status: 1, stderr: "comment boom" });
      return ok();
    }
    throw new Error(`unexpected gh ${args.join(" ")}`);
  };
  const lines = [];
  const warnings = [];
  return {
    spawn,
    calls,
    lines,
    warnings,
    readFile: (p) => {
      if (!(p in s.files)) throw new Error(`no ${p}`);
      return s.files[p];
    },
    exists: (p) => p in s.files,
    log: (l) => lines.push(l),
  };
}

function outputFile(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "sdk-watch-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "output");
}
const filedFrom = (file) => {
  const line = readFileSync(file, "utf8").trim();
  return JSON.parse(line.replace(/^filed=/, ""));
};
const writes = (calls) =>
  calls.filter(
    (c) =>
      c.cmd === "gh" &&
      c.args[0] === "issue" &&
      ["create", "edit", "comment"].includes(c.args[1]),
  );
const run = (world, extra = {}) =>
  main({
    repo: "o/r",
    spawn: world.spawn,
    readFile: world.readFile,
    exists: world.exists,
    log: world.log,
    warn: (w) => world.warnings.push(w),
    dryRun: false,
    ...extra,
  });

test("main files one issue per group behind, and hands them to the analysis", (t) => {
  const world = fakeWorld();
  const output = outputFile(t);
  run(world, { output });
  const created = writes(world.calls);
  assert.equal(created.length, 2);
  const [ts, py] = created;
  assert.ok(
    ts.args.includes(
      "chore(deps): upgrade the MCP TypeScript SDK (v1) to 1.32.1",
    ),
  );
  assert.deepEqual(
    ts.args.filter((_, i) => ts.args[i - 1] === "--label"),
    ["v2", "chore", "dependencies", "server-memory"],
  );
  assert.ok(
    py.args.includes("chore(deps): upgrade the MCP Python SDK to 2.3.0"),
  );
  assert.equal(py.args[py.args.indexOf("--milestone") + 1], "v2.0.0");
  assert.deepEqual(filedFrom(output), [
    {
      issue: 600,
      label: "MCP TypeScript SDK (v1)",
      repo: "modelcontextprotocol/typescript-sdk",
      from: "1.29.0",
      to: "1.32.1",
    },
    {
      issue: 601,
      label: "MCP Python SDK",
      repo: "modelcontextprotocol/python-sdk",
      from: "1.29.0",
      to: "2.3.0",
    },
  ]);
});

test("a dry run prints the payloads, writes nothing and emits no output", (t) => {
  const world = fakeWorld();
  const output = outputFile(t);
  run(world, { output, dryRun: true });
  assert.equal(writes(world.calls).length, 0);
  assert.throws(() => readFileSync(output), /ENOENT/);
  const out = world.lines.join("\n");
  assert.match(out, /would create an issue/);
  assert.match(out, /labels: v2, chore, dependencies, server-time/);
  assert.match(out, /milestone: v2\.0\.0/);
});

test("a quiet night is a no-op that emits []", (t) => {
  const world = fakeWorld({
    npm: { "@modelcontextprotocol/sdk": "1.30.0" },
    pypi: { mcp: "1.29.0" },
    files: files({ "src/memory/package.json": "{}" }),
  });
  const output = outputFile(t);
  run(world, { output });
  assert.equal(writes(world.calls).length, 0);
  assert.deepEqual(filedFrom(output), []);
  // Still listed: an open issue for a settled group may need refreshing.
  assert.ok(world.calls.some((c) => c.args[1] === "list"));
  assert.ok(!world.calls.some((c) => /milestones/.test(c.args[1] ?? "")));
});

const sweepIssue = (number, key, target, state = "OPEN", author = bot) => ({
  number,
  title: "t",
  body: `${buildMarker({ key }, target)}\nbody`,
  state,
  author,
  labels: sweepLabels,
});

/**
 * The issues a run against `state` files, as the next night's listing returns
 * them: numbered from 600, with the labels and body the sweep wrote.
 */
function filedIssues(state = {}) {
  const world = fakeWorld(state);
  run(world);
  return writes(world.calls).map((c, i) => ({
    number: 600 + i,
    title: c.args[c.args.indexOf("--title") + 1],
    body: c.input,
    state: "OPEN",
    author: bot,
    labels: c.args
      .filter((_, j) => c.args[j - 1] === "--label")
      .map((name) => ({ name })),
  }));
}

test("an existing analyzed issue is a no-op; an unanalyzed one is re-queued", (t) => {
  const analyzed = {
    body: `${ANALYSIS_MARKER}\n...`,
    user: { login: "github-actions[bot]", type: "Bot" },
  };
  const world = fakeWorld({
    issues: filedIssues(),
    comments: { 600: [analyzed] },
  });
  const output = outputFile(t);
  run(world, { output });
  assert.equal(writes(world.calls).length, 0);
  assert.deepEqual(
    filedFrom(output).map((f) => f.issue),
    [601],
  );
});

test("a closed issue for the target keeps suppressing it, unanalyzed", (t) => {
  const world = fakeWorld({
    issues: [
      sweepIssue(10, "typescript-sdk-v1", "1.32.1", "CLOSED"),
      sweepIssue(11, "python-sdk", "2.3.0", "CLOSED"),
    ],
  });
  const output = outputFile(t);
  run(world, { output });
  assert.equal(writes(world.calls).length, 0);
  assert.deepEqual(filedFrom(output), []);
});

test("a forged marker from an outsider suppresses nothing", (t) => {
  const forged = sweepIssue(10, "python-sdk", "2.3.0", "CLOSED", {
    login: "octocat",
  });
  const world = fakeWorld({
    issues: [forged],
    files: files({ "src/memory/package.json": "{}", "package.json": "{}" }),
  });
  run(world, { output: outputFile(t) });
  assert.equal(writes(world.calls).length, 1);
  assert.match(world.warnings.join("\n"), /"octocat"/);
});

test("a dry run previews the supersession note too", (t) => {
  const world = fakeWorld({
    issues: [sweepIssue(9, "python-sdk", "2.2.0")],
    files: files({ "src/memory/package.json": "{}", "package.json": "{}" }),
  });
  run(world, { output: outputFile(t), dryRun: true });
  assert.equal(writes(world.calls).length, 0);
  const out = world.lines.join("\n");
  assert.match(out, /would comment on #9/);
  assert.match(out, /Superseded by #NEW/);
});

test("a newer release supersedes the open older issue, once", (t) => {
  const older = sweepIssue(9, "python-sdk", "2.2.0");
  const noTs = files({ "src/memory/package.json": "{}", "package.json": "{}" });
  const world = fakeWorld({ issues: [older], files: noTs });
  run(world, { output: outputFile(t) });
  const [create, comment] = writes(world.calls);
  assert.equal(create.args[1], "create");
  assert.deepEqual(comment.args.slice(0, 3), ["issue", "comment", "9"]);
  assert.equal(parseSupersededMarker(comment.input), "600");

  // Next night: the new issue exists and the note is posted.
  const note = {
    body: comment.input,
    user: { login: "github-actions[bot]", type: "Bot" },
  };
  const analyzed = {
    body: ANALYSIS_MARKER,
    user: { login: "github-actions[bot]", type: "Bot" },
  };
  const [filed] = filedIssues({ files: noTs });
  const next = fakeWorld({
    issues: [older, filed],
    comments: { 9: [note], 600: [analyzed] },
    files: noTs,
  });
  run(next, { output: outputFile(t) });
  assert.equal(writes(next.calls).length, 0);
});

test("bodyScopes reads back the scope labels a body's rows called for", () => {
  const behind = groupState(
    group("typescript-sdk-v1"),
    [
      row("@modelcontextprotocol/sdk", "root", "^1.30.0", "1.30.0"),
      row("@modelcontextprotocol/sdk", "src/memory", "^1.29.0", "1.29.0"),
      row("@modelcontextprotocol/sdk", "src/everything", "^1.32.1", "1.32.1"),
    ],
    { "@modelcontextprotocol/sdk": "1.32.1" },
  );
  assert.deepEqual(bodyScopes(buildIssueBody(behind)), ["server-memory"]);
  assert.deepEqual(
    bodyScopes(buildIssueBody(behind)),
    issueLabels(behind).filter((l) => l.startsWith("server-")),
  );
  assert.deepEqual(bodyScopes("no table here"), []);
  assert.deepEqual(bodyScopes(undefined), []);
  const everywhere = groupState(
    group("python-sdk"),
    ["fetch", "git", "time", "everything", "filesystem", "memory"]
      .concat("sequentialthinking")
      .map((s) => row("mcp", `src/${s}`, ">=1", "1.0.0")),
    { mcp: "2.0.0" },
  );
  assert.deepEqual(bodyScopes(buildIssueBody(everywhere)), []);
});

test("refreshPlan is null for an unchanged issue, ticked boxes included", () => {
  const state = groupState(
    group("python-sdk"),
    [row("mcp", "src/time", ">=1.29.0,<2", "1.29.0")],
    { mcp: "1.30.0" },
  );
  const body = buildIssueBody(state);
  const labels = issueLabels(state).map((name) => ({ name }));
  assert.equal(refreshPlan({ body, labels }, state), null);
  const ticked = body.replace("- [ ]", "- [x]");
  assert.notEqual(ticked, body);
  assert.equal(refreshPlan({ body: ticked, labels }, state), null);
});

test("refreshPlan rewrites changed rows and moves only its own scope labels", () => {
  const rows = [
    row("mcp", "src/time", ">=1.29.0,<2", "1.29.0"),
    row("mcp", "src/git", ">=1.29.0,<2", "1.29.0"),
  ];
  const latest = { mcp: "1.30.0" };
  const was = groupState(group("python-sdk"), rows, latest);
  const issue = {
    body: buildIssueBody(was).replace("- [ ]", "- [x]"),
    labels: [
      ...issueLabels(was),
      "server-fetch", // a maintainer's, which no row ever called for
      "help wanted",
    ].map((name) => ({ name })),
  };
  // git upgrades on its own, and fetch now declares mcp and is behind.
  const now = groupState(
    group("python-sdk"),
    [
      rows[0],
      row("mcp", "src/git", ">=1.29.0,<2", "1.30.0"),
      row("mcp", "src/memory", ">=1.29.0,<2", "1.28.0"),
    ],
    latest,
  );
  assert.deepEqual(refreshPlan(issue, now), {
    body: buildIssueBody(now),
    addLabels: ["server-memory"],
    removeLabels: ["server-git"],
  });

  // A label the rows still call for, which someone removed, stays removed;
  // one the rows newly call for, already present, is not added twice.
  const trimmed = {
    body: buildIssueBody(was),
    labels: [{ name: "server-git" }, { name: "server-memory" }],
  };
  // The record keeps only what the sweep itself applied: time, not memory.
  assert.deepEqual(refreshPlan(trimmed, now), {
    body: buildIssueBody(now, ["server-time"]),
    addLabels: [],
    removeLabels: ["server-git"],
  });
});

test("appliedScopes reads the record, falling back to the rows", () => {
  const state = groupState(
    group("python-sdk"),
    [
      row("mcp", "src/time", ">=1", "1.0.0"),
      row("mcp", "src/git", ">=1", "1.0.0"),
    ],
    { mcp: "2.0.0" },
  );
  const body = buildIssueBody(state);
  assert.equal(
    body.split("\n").at(-1),
    buildAppliedMarker(["server-git", "server-time"]),
  );
  assert.deepEqual(appliedScopes(body), ["server-git", "server-time"]);
  assert.deepEqual(appliedScopes(buildIssueBody(state, [])), []);
  // A body written before the record existed: what its rows called for.
  const legacy = body.split("\n").slice(0, -1).join("\n");
  assert.deepEqual(appliedScopes(legacy), ["server-git", "server-time"]);
  assert.deepEqual(appliedScopes(undefined), []);
});

test("a scope label someone applied first survives successive refreshes", () => {
  const latest = { mcp: "1.30.0" };
  const time = row("mcp", "src/time", ">=1.29.0,<2", "1.29.0");
  const night1 = groupState(group("python-sdk"), [time], latest);
  // A maintainer had already put server-memory on the issue.
  let issue = {
    body: buildIssueBody(night1),
    labels: ["server-time", "server-memory"].map((name) => ({ name })),
  };
  const apply = (plan) => ({
    body: plan.body,
    labels: [
      ...issue.labels.filter((l) => !plan.removeLabels.includes(l.name)),
      ...plan.addLabels.map((name) => ({ name })),
    ],
  });

  // Night 2: memory falls behind. Its label is already there; not the sweep's.
  const night2 = groupState(
    group("python-sdk"),
    [time, row("mcp", "src/memory", ">=1.29.0,<2", "1.28.0")],
    latest,
  );
  const plan2 = refreshPlan(issue, night2);
  assert.deepEqual([plan2.addLabels, plan2.removeLabels], [[], []]);
  assert.deepEqual(appliedScopes(plan2.body), ["server-time"]);
  issue = apply(plan2);

  // Night 3: memory catches up. The sweep did not apply its label, so keeps it.
  const night3 = groupState(
    group("python-sdk"),
    [time, row("mcp", "src/memory", ">=1.29.0,<2", "1.30.0")],
    latest,
  );
  const plan3 = refreshPlan(issue, night3);
  assert.deepEqual([plan3.addLabels, plan3.removeLabels], [[], []]);
  issue = apply(plan3);
  assert.ok(issue.labels.some((l) => l.name === "server-memory"));

  // Night 4: time catches up too. Its label was the sweep's, so it goes.
  const done = markRows(
    group("python-sdk"),
    [
      row("mcp", "src/time", ">=1.29.0,<2", "1.30.0"),
      row("mcp", "src/memory", ">=1.29.0,<2", "1.30.0"),
    ],
    latest,
  );
  const plan4 = refreshPlan(issue, done);
  assert.deepEqual(plan4.removeLabels, ["server-time"]);
  assert.deepEqual(appliedScopes(plan4.body), []);
  assert.equal(refreshPlan(apply(plan4), done), null);
});

test("ownership lapses with the rows, even when the label was already gone", () => {
  const latest = { mcp: "1.30.0" };
  const time = row("mcp", "src/time", ">=1.29.0,<2", "1.29.0");
  const git = (installed) => row("mcp", "src/git", ">=1.29.0,<2", installed);
  const both = groupState(group("python-sdk"), [time, git("1.29.0")], latest);
  // The sweep applied both; a maintainer has since removed server-git.
  const issue = {
    body: buildIssueBody(both),
    labels: [{ name: "server-time" }],
  };
  const caughtUp = groupState(
    group("python-sdk"),
    [time, git("1.30.0")],
    latest,
  );
  const plan = refreshPlan(issue, caughtUp);
  assert.deepEqual(plan.removeLabels, []);
  assert.deepEqual(appliedScopes(plan.body), ["server-time"]);

  // The maintainer reapplies server-git and git falls behind again: the
  // label is theirs now, so git catching up a second time leaves it.
  const again = refreshPlan(
    {
      body: plan.body,
      labels: [{ name: "server-time" }, { name: "server-git" }],
    },
    both,
  );
  assert.deepEqual([again.addLabels, again.removeLabels], [[], []]);
  assert.deepEqual(appliedScopes(again.body), ["server-time"]);
  const last = refreshPlan(
    {
      body: again.body,
      labels: [{ name: "server-time" }, { name: "server-git" }],
    },
    caughtUp,
  );
  assert.deepEqual(last.removeLabels, []);
});

test("a copy with no installed version does not settle its group", (t) => {
  const [filed] = filedIssues({
    files: files({ "src/time/uv.lock": UV("2.3.0") }),
  });
  // The lockfile no longer resolves either copy: nothing is behind, but
  // nothing is known to have caught up either.
  const lockless = files({
    "src/time/uv.lock": UV("2.3.0"),
    "package-lock.json": JSON.stringify({ packages: {} }),
  });
  const none = fakeWorld({ issues: [filed], files: lockless });
  run(none, { output: outputFile(t) });
  assert.equal(writes(none.calls).length, 0);
});

test("an open issue whose installs changed is refreshed in place, once", (t) => {
  const noPy = files({ "src/time/uv.lock": UV("2.3.0") });
  const [filed] = filedIssues({ files: noPy });
  assert.deepEqual(bodyScopes(filed.body), ["server-memory"]);
  filed.labels.push({ name: "server-filesystem" }, { name: "help wanted" });

  // memory reaches the target on its own; the root copy is still behind.
  const upgraded = files({
    "src/time/uv.lock": UV("2.3.0"),
    "package-lock.json": JSON.stringify({
      packages: {
        ...NPM_LOCK.packages,
        "src/memory/node_modules/@modelcontextprotocol/sdk": {
          version: "1.32.1",
        },
      },
    }),
  });
  const analyzed = {
    body: ANALYSIS_MARKER,
    user: { login: "github-actions[bot]", type: "Bot" },
  };
  const world = fakeWorld({
    issues: [filed],
    comments: { 600: [analyzed] },
    files: upgraded,
  });
  const output = outputFile(t);
  run(world, { output });
  const [edit, ...rest] = writes(world.calls);
  assert.equal(rest.length, 0);
  assert.deepEqual(edit.args.slice(0, 3), ["issue", "edit", "600"]);
  assert.deepEqual(
    edit.args.filter((_, i) => edit.args[i - 1] === "--remove-label"),
    ["server-memory"],
  );
  assert.ok(!edit.args.includes("--add-label"));
  assert.match(
    edit.input,
    /\| `src\/memory` \| \^1\.29\.0 \| 1\.32\.1 \| 1\.32\.1 \| no \|/,
  );
  assert.deepEqual(bodyScopes(edit.input), []);
  // Already analyzed, so the refresh queues nothing.
  assert.deepEqual(filedFrom(output), []);
  assert.match(world.lines.join("\n"), /refreshed #600.*removed server-memory/);

  // The next night finds it current.
  const next = fakeWorld({
    issues: [
      {
        ...filed,
        body: edit.input,
        labels: filed.labels.filter((l) => l.name !== "server-memory"),
      },
    ],
    comments: { 600: [analyzed] },
    files: upgraded,
  });
  run(next, { output: outputFile(t) });
  assert.equal(writes(next.calls).length, 0);
});

test("a dry run previews the refresh; a closed issue is never refreshed", (t) => {
  const [filed] = filedIssues({
    files: files({ "src/time/uv.lock": UV("2.3.0") }),
  });
  const moved = files({
    "src/time/uv.lock": UV("2.3.0"),
    "package-lock.json": JSON.stringify({
      packages: {
        ...NPM_LOCK.packages,
        "src/memory/node_modules/@modelcontextprotocol/sdk": {
          version: "1.32.1",
        },
      },
    }),
  });
  const dry = fakeWorld({ issues: [filed], files: moved });
  run(dry, { output: outputFile(t), dryRun: true });
  assert.equal(writes(dry.calls).length, 0);
  const out = dry.lines.join("\n");
  assert.match(out, /would edit #600/);
  assert.match(out, /remove labels: server-memory/);

  const closed = fakeWorld({
    issues: [{ ...filed, state: "CLOSED" }],
    files: moved,
  });
  run(closed, { output: outputFile(t) });
  assert.equal(writes(closed.calls).length, 0);
});

test("the last outdated copy catching up rewrites the open issue to say so", (t) => {
  const noPy = files({ "src/time/uv.lock": UV("2.3.0") });
  const [filed] = filedIssues({ files: noPy });
  filed.labels.push({ name: "help wanted" });
  // Both copies reach the target: the group files nothing and is settled.
  const caughtUp = files({
    "src/time/uv.lock": UV("2.3.0"),
    "package-lock.json": JSON.stringify({
      packages: {
        "": { name: "@modelcontextprotocol/servers" },
        "node_modules/@modelcontextprotocol/sdk": { version: "1.32.1" },
        "src/memory/node_modules/@modelcontextprotocol/sdk": {
          version: "1.32.1",
        },
      },
    }),
  });
  const world = fakeWorld({ issues: [filed], files: caughtUp });
  const output = outputFile(t);
  run(world, { output });
  const [edit, ...rest] = writes(world.calls);
  assert.equal(rest.length, 0);
  assert.deepEqual(edit.args.slice(0, 3), ["issue", "edit", "600"]);
  assert.deepEqual(
    edit.args.filter((_, i) => edit.args[i - 1] === "--remove-label"),
    ["server-memory"],
  );
  assert.ok(!edit.args.includes("--add-label"));
  assert.equal(parseMarker(edit.input).target, "1.32.1");
  assert.match(edit.input, /Nothing here is behind 1\.32\.1 any more/);
  assert.doesNotMatch(edit.input, /\*\*yes\*\*/);
  assert.doesNotMatch(edit.input, /- \[ \]/);
  // Nothing to analyze, and nothing filed.
  assert.deepEqual(filedFrom(output), []);
  assert.match(world.lines.join("\n"), /#600 has nothing behind any more/);

  // The next night finds it current; a closed one is never touched.
  const next = fakeWorld({
    issues: [{ ...filed, body: edit.input, labels: [] }],
    files: caughtUp,
  });
  run(next, { output: outputFile(t) });
  assert.equal(writes(next.calls).length, 0);
  const closed = fakeWorld({
    issues: [{ ...filed, state: "CLOSED" }],
    files: caughtUp,
  });
  run(closed, { output: outputFile(t) });
  assert.equal(writes(closed.calls).length, 0);
});

test("a group no manifest declares any more rewrites its open issues", (t) => {
  const [filed] = filedIssues({
    files: files({ "src/time/uv.lock": UV("2.3.0") }),
  });
  // Every server moves off the v1 SDK, leaving no row in its group.
  const migrated = files({
    "src/time/uv.lock": UV("2.3.0"),
    "package.json": JSON.stringify({ name: "@modelcontextprotocol/servers" }),
    "src/memory/package.json": JSON.stringify({
      name: "@modelcontextprotocol/server-memory",
    }),
  });
  const world = fakeWorld({ issues: [filed], files: migrated });
  run(world, { output: outputFile(t) });
  const [edit, ...rest] = writes(world.calls);
  assert.equal(rest.length, 0);
  assert.deepEqual(
    edit.args.filter((_, i) => edit.args[i - 1] === "--remove-label"),
    ["server-memory"],
  );
  assert.equal(parseMarker(edit.input).target, "1.32.1");
  assert.match(edit.input, /No manifest on `v2\/main` declares/);
  assert.doesNotMatch(edit.input, /\| Package \|/);
  assert.ok(!world.calls.some((c) => c.cmd === "npm"));
});

test("a settled group's edit failure fails the run after the rest", (t) => {
  const [filed] = filedIssues({
    files: files({ "src/time/uv.lock": UV("2.3.0") }),
  });
  const world = fakeWorld({
    issues: [filed],
    files: files({
      "src/time/uv.lock": UV("2.3.0"),
      "package.json": "{}",
      "src/memory/package.json": "{}",
    }),
    editFail: true,
  });
  assert.throws(
    () => run(world, { output: outputFile(t) }),
    /1 group\(s\) failed: MCP TypeScript SDK \(v1\): gh issue edit failed/,
  );
});

test("a failure after filing still emits what was filed, then fails", (t) => {
  const world = fakeWorld({
    issues: [sweepIssue(9, "python-sdk", "2.2.0")],
    commentFail: true,
  });
  const output = outputFile(t);
  assert.throws(
    () => run(world, { output }),
    /1 group\(s\) failed.*comment boom/,
  );
  assert.deepEqual(
    filedFrom(output).map((f) => f.issue),
    [600, 601],
  );
  assert.match(
    world.warnings.join("\n"),
    /MCP Python SDK failed: .*comment boom/,
  );
});

test("one group's failure does not cost another its issue", (t) => {
  const world = fakeWorld({
    createFail: (args) => args.some((a) => /TypeScript/.test(a)),
  });
  const output = outputFile(t);
  assert.throws(
    () => run(world, { output }),
    /MCP TypeScript SDK \(v1\): gh issue create failed/,
  );
  assert.deepEqual(
    filedFrom(output).map((f) => f.label),
    ["MCP Python SDK"],
  );
  assert.match(
    world.warnings.join("\n"),
    /\(v1\) failed: gh issue create failed/,
  );
});

test("a registry failure fails the run before anything is filed", () => {
  for (const state of [
    { npmFail: true },
    { npm: { "@modelcontextprotocol/sdk": "latest" } },
    { pypiRaw: "<html>" },
    { pypi: { mcp: "3.0.0rc1" } },
  ]) {
    const world = fakeWorld(state);
    assert.throws(() => run(world));
    assert.equal(writes(world.calls).length, 0);
  }
  assert.throws(() => main({ repo: "", log: () => {} }), /GITHUB_REPOSITORY/);
});

test("an unwatched SDK package fails the run", () => {
  const world = fakeWorld({
    files: files({
      "src/memory/package.json": JSON.stringify({
        dependencies: { "@modelcontextprotocol/express": "^2" },
      }),
    }),
  });
  assert.throws(() => run(world), /@modelcontextprotocol\/express/);
});

test("the repository's real manifests are all watched", () => {
  const installs = readInstalls(
    (p) => readFileSync(path.join(repoRoot, p), "utf8"),
    (p) => {
      try {
        readFileSync(path.join(repoRoot, p));
        return true;
      } catch {
        return false;
      }
    },
  );
  assert.doesNotThrow(() =>
    assertEveryPackageWatched(
      installs.declaredByManifest,
      installs.ownPackages,
    ),
  );
  assert.ok(installs.rowsFor(group("python-sdk")).length >= 3);
});

// The workflow's security rests on properties of its YAML; pin them.
const workflowText = readFileSync(
  path.join(repoRoot, ".github/workflows/sdk-watch.yml"),
  "utf8",
);
const workflow = parse(workflowText);

test("the workflow posts the same analysis marker the sweep reads", () => {
  assert.ok(workflowText.includes(`'${ANALYSIS_MARKER}'`));
});

test("the model runs only in a job that can read and nothing else", () => {
  const { analyze, post, sweep } = workflow.jobs;
  assert.deepEqual(analyze.permissions, { contents: "read" });
  const modelJobs = Object.entries(workflow.jobs)
    .filter(([, job]) =>
      job.steps.some((s) => /claude-code-action/.test(s.uses ?? "")),
    )
    .map(([name]) => name);
  assert.deepEqual(modelJobs, ["analyze"]);
  assert.ok(!analyze.steps.some((s) => /gh issue comment/.test(s.run ?? "")));
  assert.equal(post.permissions.issues, "write");
  assert.ok(sweep.outputs.filed);
});

test("the model is granted no shell, no writes and no network", () => {
  const step = workflow.jobs.analyze.steps.find((s) =>
    /claude-code-action/.test(s.uses ?? ""),
  );
  const args = step.with.claude_args;
  assert.match(args, /--tools "Read,Grep,Glob"/);
  assert.match(args, /--allowedTools "Read,Grep,Glob"/);
  const denied = /--disallowedTools "([^"]+)"/.exec(args)[1].split(",");
  for (const tool of [
    "Bash",
    "Edit",
    "Write",
    "WebFetch",
    "WebSearch",
    "Task",
  ]) {
    assert.ok(denied.includes(tool), `${tool} is denied`);
  }
  for (const pattern of [/Bash\(/, /npm/, /curl/, /wget/]) {
    assert.doesNotMatch(args.replace(/--disallowedTools "[^"]+"/, ""), pattern);
  }
  assert.match(args, /--json-schema/);
});

test("the analysis is scanned before it is written, and uploaded only if written", () => {
  const steps = workflow.jobs.analyze.steps;
  const stage = steps.findIndex((s) => /Stage the analysis/.test(s.name ?? ""));
  const upload = steps.findIndex((s) => /upload-artifact/.test(s.uses ?? ""));
  assert.ok(stage >= 0 && upload > stage);
  const script = steps[stage].run;
  assert.ok(script.indexOf("SCAN_ANTHROPIC") < script.indexOf("> analysis.md"));
  assert.match(steps[upload].if, /hashFiles\('analysis\.md'\)/);
  const postScript = workflow.jobs.post.steps.find((s) =>
    /Post the analysis/.test(s.name ?? ""),
  ).run;
  assert.match(postScript, /SCAN_ANTHROPIC/);
  assert.match(postScript, /--body-file -/);
});

test("every job is bounded and guarded against forks running it", () => {
  for (const [name, job] of Object.entries(workflow.jobs)) {
    assert.ok(job["timeout-minutes"], `${name} has a timeout`);
  }
  assert.match(
    workflow.jobs.sweep.if,
    /repository_owner == 'modelcontextprotocol'/,
  );
});
