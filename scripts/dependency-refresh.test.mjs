// Tests for the monthly dependency sweep (#4874). The parsers and builders
// are driven directly; `main()` runs against a throwaway tree with `npm`,
// `uv` and `gh` replaced by a fake spawn, so filing, updating, clearing, the
// no-op paths, the failure paths and the dry run are all covered without
// touching the real tracker. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ISSUE_MARKER,
  ISSUE_TITLE,
  buildClearedBody,
  buildIssueBody,
  highestVersionTag,
  installLabel,
  isActionStale,
  main,
  parseActionRefs,
  parseNpmOutdated,
  parseUvDryRun,
  parseUvTree,
  parseVersionRef,
  staleActions,
  unrankedPins,
  uvRows,
} from "./dependency-refresh.mjs";

const SHA = "d23441a48e516b6c34aea4fa41551a30e30af803";
const bot = { login: "app/github-actions", is_bot: true };
const sweepLabels = [
  { name: "v2" },
  { name: "chore" },
  { name: "dependencies" },
];

test("installLabel maps npm's dependent onto a manifest", () => {
  assert.equal(installLabel("everything"), "src/everything");
  assert.equal(installLabel("servers"), "root");
  assert.equal(installLabel("mcp-servers-4874"), "root");
  assert.equal(installLabel(undefined), "root");
});

test("parseNpmOutdated splits by dependent and dedupes per manifest", () => {
  const byInstall = parseNpmOutdated(
    JSON.stringify({
      zod: [
        {
          current: "4.4.3",
          wanted: "4.6.5",
          latest: "4.6.5",
          dependent: "memory",
        },
        {
          current: "4.4.3",
          wanted: "4.6.5",
          latest: "4.6.5",
          dependent: "everything",
        },
      ],
      diff: {
        current: "8.0.4",
        wanted: "8.0.4",
        latest: "9.0.0",
        dependent: "filesystem",
      },
      eslint: [
        {
          current: "10.0.0",
          wanted: "10.1.0",
          latest: "10.1.0",
          dependent: "servers",
        },
        {
          current: "10.0.0",
          wanted: "10.1.0",
          latest: "10.1.0",
          dependent: "servers",
        },
      ],
      gone: { latest: "1.0.0", dependent: "memory" },
    }),
  );
  assert.deepEqual([...byInstall.keys()].sort(), [
    "root",
    "src/everything",
    "src/filesystem",
    "src/memory",
  ]);
  assert.equal(byInstall.get("root").length, 1);
  assert.deepEqual(
    byInstall.get("src/memory").map((r) => r.name),
    ["gone", "zod"],
  );
  assert.equal(byInstall.get("src/memory")[0].current, "(missing)");
  assert.equal(parseNpmOutdated("  ").size, 0);
});

test("parseUvDryRun reads updates, additions and removals", () => {
  assert.deepEqual(
    parseUvDryRun(
      [
        "warning: something",
        "Resolved 52 packages in 638ms",
        "Update anyio v4.6.2.post1 -> v4.15.1",
        "Add newdep v1.0.0",
        "Remove sniffio v1.3.1",
      ].join("\n"),
    ),
    [
      { name: "anyio", current: "4.6.2.post1", wanted: "4.15.1" },
      { name: "newdep", current: "(not locked)", wanted: "1.0.0" },
      { name: "sniffio", current: "1.3.1", wanted: "(removed)" },
    ],
  );
});

test("parseUvTree keeps behind direct dependencies, without extras", () => {
  const tree = parseUvTree(
    [
      "mcp-server-fetch v0.6.3",
      "├── httpx[socks] v0.27.2 (latest: v0.28.1)",
      "├── mcp v1.29.0 (latest: v2.3.0)",
      "├── pytest-cov v7.1.0 (group: dev)",
      "└── ruff v0.8.1 (group: dev) (latest: v0.16.10)",
    ].join("\n"),
  );
  assert.deepEqual([...tree.keys()], ["httpx", "mcp", "ruff"]);
  assert.deepEqual(tree.get("ruff"), { current: "0.8.1", latest: "0.16.10" });
});

test("uvRows merges the lock refresh with the direct latest", () => {
  const rows = uvRows(
    [
      { name: "mcp", current: "1.29.0", wanted: "1.30.0" },
      { name: "idna", current: "3.18", wanted: "3.20" },
    ],
    new Map([
      ["mcp", { current: "1.29.0", latest: "2.3.0" }],
      ["markdownify", { current: "0.14.1", latest: "1.2.3" }],
    ]),
  );
  assert.deepEqual(rows, [
    { name: "idna", current: "3.18", wanted: "3.20", latest: "—" },
    {
      name: "markdownify",
      current: "0.14.1",
      wanted: "0.14.1",
      latest: "1.2.3",
    },
    { name: "mcp", current: "1.29.0", wanted: "1.30.0", latest: "2.3.0" },
  ]);
});

test("parseActionRefs reads tags, SHA pins with their release, and skips the rest", () => {
  const refs = parseActionRefs(
    [
      "steps:",
      "  - uses: actions/checkout@v6",
      `    uses: actions/checkout@${SHA} # v6.1.0`,
      `  - uses: "actions/setup-node@v7"`,
      "  - uses: 'owner/repo/sub@v2' # a comment",
      `  - uses: actions/cache@${SHA}`,
      "  - uses: ./local-action",
      "  - uses: docker://alpine:3",
      "  - uses: no-ref",
      "  # uses: commented@v1",
    ].join("\n"),
  );
  assert.deepEqual(refs, [
    { action: "actions/checkout", ref: "v6" },
    { action: "actions/checkout", ref: SHA, version: "v6.1.0" },
    { action: "actions/setup-node", ref: "v7" },
    { action: "owner/repo/sub", ref: "v2" },
    { action: "actions/cache", ref: SHA },
  ]);
  assert.deepEqual(unrankedPins(refs), ["actions/cache@d23441a"]);
});

test("isActionStale compares at the precision the ref names", () => {
  assert.deepEqual(parseVersionRef("v7.0.1"), [7, 0, 1]);
  assert.equal(parseVersionRef(SHA), null);
  assert.equal(isActionStale("v7", "v7.0.1"), false);
  assert.equal(isActionStale("v7", "v8.0.0"), true);
  assert.equal(isActionStale("v7.0.0", "v7.0.1"), true);
  assert.equal(isActionStale("v8", "v7.9.9"), false);
  assert.equal(isActionStale("main", "v1"), false);
});

test("staleActions ranks SHA pins by their comment and dedupes", () => {
  const stale = staleActions(
    [
      { action: "actions/checkout", ref: "v6" },
      { action: "actions/checkout", ref: "v6" },
      { action: "actions/checkout", ref: SHA, version: "v6.1.0" },
      { action: "actions/setup-node", ref: "v7" },
      { action: "unknown/action", ref: "v1" },
    ],
    {
      "actions/checkout": "v7.0.0",
      "actions/setup-node": "v7.0.0",
      "unknown/action": null,
    },
  );
  assert.deepEqual(stale, [
    { action: "actions/checkout", current: "v6", latest: "v7.0.0" },
    {
      action: "actions/checkout",
      current: "v6.1.0 (`d23441a`)",
      latest: "v7.0.0",
    },
  ]);
});

test("highestVersionTag is the greatest version, not the newest release", () => {
  assert.equal(
    highestVersionTag(["v6.9.1", "v8.0.0", "v7.2.0", "nightly"]),
    "v8.0.0",
  );
  assert.equal(highestVersionTag(["v1", "v1.0.1"]), "v1.0.1");
  assert.equal(highestVersionTag(["nightly"]), null);
});

test("buildIssueBody is null when nothing is behind, and lists each half", () => {
  assert.equal(
    buildIssueBody({
      npm: [{ label: "root", packages: [] }],
      uv: [],
      actions: [],
    }),
    null,
  );
  const body = buildIssueBody({
    npm: [
      {
        label: "src/memory",
        packages: [
          { name: "zod", current: "4.4.3", wanted: "4.6.5", latest: "4.6.5" },
        ],
      },
    ],
    uv: [
      {
        label: "src/time",
        packages: [
          { name: "mcp", current: "1.29.0", wanted: "1.30.0", latest: "2.3.0" },
        ],
      },
    ],
    actions: [{ action: "actions/checkout", current: "v6", latest: "v7.0.0" }],
    unranked: ["actions/cache@d23441a"],
  });
  assert.ok(body.startsWith(ISSUE_MARKER));
  for (const needle of [
    "## npm",
    "### `src/memory`",
    "| `zod` | 4.4.3 | 4.6.5 | 4.6.5 |",
    "## uv",
    "### `src/time/uv.lock`",
    "| `mcp` | 1.29.0 | 1.30.0 | 2.3.0 |",
    "## GitHub Actions",
    "| `actions/checkout` | v6 | v7.0.0 |",
    "`actions/cache@d23441a`",
  ]) {
    assert.ok(body.includes(needle), needle);
  }
  const actionsOnly = buildIssueBody({
    npm: [],
    uv: [],
    actions: [{ action: "a/b", current: "v1", latest: "v2" }],
  });
  assert.ok(!actionsOnly.includes("## npm"));
  assert.ok(!actionsOnly.includes("## uv"));
});

test("buildClearedBody keeps the marker and speaks for every ecosystem", () => {
  const body = buildClearedBody("2026-11-01");
  assert.ok(body.startsWith(ISSUE_MARKER));
  assert.match(body, /2026-11-01/);
  assert.match(body, /npm/);
  assert.match(body, /uv\.lock/);
  assert.match(body, /workflow/);
});

/** A checkout with workflows and one Python server. */
function fixtureRoot(t) {
  const root = mkdtempSync(path.join(tmpdir(), "dependency-refresh-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
  writeFileSync(
    path.join(root, ".github/workflows/ci.yml"),
    `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v6\n      - uses: actions/setup-node@${SHA} # v7.0.0\n`,
  );
  writeFileSync(
    path.join(root, ".github/workflows/notes.md"),
    "uses: ignored/thing@v1\n",
  );
  mkdirSync(path.join(root, "src/time"), { recursive: true });
  writeFileSync(path.join(root, "src/time/uv.lock"), "");
  return root;
}

/**
 * A fake for every command `main()` runs. `state` steers it; `calls` records
 * what reached it.
 */
function fakeTools(state = {}) {
  const calls = [];
  const s = {
    outdated: {
      status: 1,
      stdout: JSON.stringify({
        zod: {
          current: "4.4.3",
          wanted: "4.6.5",
          latest: "4.6.5",
          dependent: "memory",
        },
      }),
    },
    uvLock: { status: 0, stderr: "Update mcp v1.29.0 -> v1.30.0\n" },
    uvTree: { status: 0, stdout: "├── mcp v1.29.0 (latest: v2.3.0)\n" },
    releases: {
      "actions/checkout": "v6.1.0\nv7.0.0\n",
      "actions/setup-node": "v7.0.0\n",
    },
    issues: [],
    milestones: [
      { title: "v2.0.0", state: "open", due_on: "2026-10-17T00:00:00Z" },
    ],
    ...state,
  };
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, input: opts?.input, cwd: opts?.cwd });
    const ok = (extra) => ({ status: 0, stdout: "", stderr: "", ...extra });
    if (cmd === "npm") return ok(s.outdated);
    if (cmd === "uv") return ok(args[0] === "lock" ? s.uvLock : s.uvTree);
    if (cmd !== "gh") throw new Error(`unexpected ${cmd}`);
    if (
      args[0] === "api" &&
      args.includes("--paginate") &&
      /releases/.test(args[2])
    ) {
      const repo = args[2].split("/").slice(1, 3).join("/");
      if (s.releasesFail) return ok({ status: 1, stderr: "HTTP 404" });
      return ok({ stdout: s.releases[repo] ?? "" });
    }
    if (args[0] === "api" && /milestones/.test(args[1])) {
      return ok({ stdout: JSON.stringify(s.milestones) });
    }
    if (args[0] === "issue" && args[1] === "list") {
      return ok({ stdout: JSON.stringify(s.issues) });
    }
    if (args[0] === "issue" && args[1] === "create") {
      return ok({ stdout: "https://github.com/o/r/issues/99\n" });
    }
    if (args[0] === "issue" && args[1] === "edit") return ok();
    throw new Error(`unexpected gh ${args.join(" ")}`);
  };
  return { spawn, calls };
}

const writes = (calls) =>
  calls.filter(
    (c) =>
      c.cmd === "gh" &&
      c.args[0] === "issue" &&
      ["create", "edit", "comment"].includes(c.args[1]),
  );

test("main files one milestoned, labeled issue covering npm, uv and Actions", (t) => {
  const root = fixtureRoot(t);
  const { spawn, calls } = fakeTools();
  main({ repo: "o/r", root, spawn, dryRun: false, log: () => {} });

  const npm = calls.find((c) => c.cmd === "npm");
  assert.deepEqual(npm.args, [
    "outdated",
    "--json",
    "--workspaces",
    "--include-workspace-root",
  ]);
  const uv = calls.filter((c) => c.cmd === "uv");
  assert.deepEqual(
    uv.map((c) => c.args[0]),
    ["lock", "tree"],
  );
  assert.ok(uv[0].args.includes("--dry-run"));
  assert.equal(uv[0].cwd, path.join(root, "src/time"));

  const [create] = writes(calls);
  assert.deepEqual(create.args.slice(0, 2), ["issue", "create"]);
  assert.ok(create.args.includes(ISSUE_TITLE));
  assert.deepEqual(
    create.args.filter((_, i) => create.args[i - 1] === "--label"),
    ["v2", "chore", "dependencies"],
  );
  assert.equal(create.args[create.args.indexOf("--milestone") + 1], "v2.0.0");
  assert.match(create.input, /\| `zod` \| 4\.4\.3/);
  assert.match(create.input, /\| `mcp` \| 1\.29\.0 \| 1\.30\.0 \| 2\.3\.0 \|/);
  assert.match(create.input, /\| `actions\/checkout` \| v6 \| v7\.0\.0 \|/);
  // The SHA pin's comment is v7.0.0, and so is the latest: current.
  assert.ok(!create.input.includes("actions/setup-node"));
});

test("a dry run reads everything and writes nothing", (t) => {
  const root = fixtureRoot(t);
  const { spawn, calls } = fakeTools();
  const lines = [];
  main({ repo: "o/r", root, spawn, dryRun: true, log: (l) => lines.push(l) });
  assert.equal(writes(calls).length, 0);
  const out = lines.join("\n");
  assert.match(out, /would create an issue/);
  assert.match(out, /labels: v2, chore, dependencies/);
  assert.match(out, /milestone: v2\.0\.0/);
  assert.match(out, new RegExp(ISSUE_MARKER));
});

test("main updates the open sweep issue instead of filing another", (t) => {
  const root = fixtureRoot(t);
  const { spawn, calls } = fakeTools({
    issues: [
      {
        number: 7,
        title: ISSUE_TITLE,
        body: `${ISSUE_MARKER}\nold`,
        state: "OPEN",
        author: bot,
        labels: sweepLabels,
      },
    ],
  });
  main({ repo: "o/r", root, spawn, log: () => {} });
  const [edit] = writes(calls);
  assert.deepEqual(edit.args.slice(0, 3), ["issue", "edit", "7"]);
  assert.ok(
    !calls.some((c) => c.cmd === "gh" && /milestones/.test(c.args[1] ?? "")),
  );
});

test("main ignores a look-alike issue an outsider wrote", (t) => {
  const root = fixtureRoot(t);
  const { spawn, calls } = fakeTools({
    issues: [
      {
        number: 7,
        body: `${ISSUE_MARKER}\nforged`,
        state: "OPEN",
        author: { login: "octocat" },
        labels: sweepLabels,
      },
    ],
  });
  main({ repo: "o/r", root, spawn, log: () => {} });
  assert.equal(writes(calls)[0].args[1], "create");
});

test("main leaves an up-to-date issue alone", (t) => {
  const root = fixtureRoot(t);
  // Render the body the run would produce, then present it as the existing one.
  const first = fakeTools();
  main({ repo: "o/r", root, spawn: first.spawn, log: () => {} });
  const body = writes(first.calls)[0].input;
  const { spawn, calls } = fakeTools({
    issues: [
      { number: 7, body, state: "OPEN", author: bot, labels: sweepLabels },
    ],
  });
  main({ repo: "o/r", root, spawn, log: () => {} });
  assert.equal(writes(calls).length, 0);
});

test("with nothing behind, main clears an open issue, once", (t) => {
  const root = fixtureRoot(t);
  const quiet = {
    outdated: { status: 0, stdout: "" },
    uvLock: { status: 0, stderr: "Resolved 1 package\n" },
    uvTree: { status: 0, stdout: "├── mcp v1.29.0\n" },
    releases: {
      "actions/checkout": "v6.1.0\n",
      "actions/setup-node": "v7.0.0\n",
    },
  };
  const none = fakeTools(quiet);
  main({ repo: "o/r", root, spawn: none.spawn, log: () => {} });
  assert.equal(writes(none.calls).length, 0);

  const open = fakeTools({
    ...quiet,
    issues: [
      {
        number: 7,
        body: `${ISSUE_MARKER}\nstale table`,
        state: "OPEN",
        author: bot,
        labels: sweepLabels,
      },
    ],
  });
  main({
    repo: "o/r",
    root,
    spawn: open.spawn,
    today: "2026-11-01",
    log: () => {},
  });
  const [edit] = writes(open.calls);
  assert.equal(edit.input, buildClearedBody("2026-11-01"));

  const cleared = fakeTools({
    ...quiet,
    issues: [
      {
        number: 7,
        body: buildClearedBody("2026-11-01"),
        state: "OPEN",
        author: bot,
        labels: sweepLabels,
      },
    ],
  });
  main({
    repo: "o/r",
    root,
    spawn: cleared.spawn,
    today: "2026-11-01",
    log: () => {},
  });
  assert.equal(writes(cleared.calls).length, 0);
});

test("main files unmilestoned when no milestone is dated", (t) => {
  const root = fixtureRoot(t);
  const { spawn, calls } = fakeTools({
    milestones: [{ title: "someday", due_on: null }],
  });
  const lines = [];
  main({ repo: "o/r", root, spawn, log: (l) => lines.push(l) });
  assert.ok(!writes(calls)[0].args.includes("--milestone"));
  assert.ok(lines.some((l) => /filed unmilestoned/.test(l)));
});

test("main fails, writing nothing, when a lookup fails", (t) => {
  const root = fixtureRoot(t);
  for (const [state, pattern] of [
    [
      { outdated: { status: 2, stderr: "E404 registry" } },
      /npm outdated failed/,
    ],
    [
      { uvLock: { status: 2, stderr: "no network" } },
      /uv lock --upgrade --dry-run failed/,
    ],
    [{ releasesFail: true }, /release lookup for actions\/checkout failed/],
  ]) {
    const { spawn, calls } = fakeTools(state);
    assert.throws(
      () => main({ repo: "o/r", root, spawn, log: () => {} }),
      pattern,
    );
    assert.equal(writes(calls).length, 0);
  }
  assert.throws(
    () => main({ repo: "", root, log: () => {} }),
    /GITHUB_REPOSITORY/,
  );
  assert.throws(
    () =>
      main({
        repo: "o/r",
        root,
        spawn: () => ({ error: new Error("ENOENT npm") }),
        log: () => {},
      }),
    /ENOENT/,
  );
});
