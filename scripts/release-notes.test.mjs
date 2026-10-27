// Tests for scripts/release-notes.mjs (#5056): per-server bucketing (one
// server, several, none), sections only for published packages, the
// Repository catch-all dropping no PR, the release-wide Thanks section (laid
// out as the Inspector's) with every exclusion (maintainers by permission,
// bots, deleted accounts, PRs, other repos), keyword parsing, pagination,
// fail-fast at every lookup, and that nothing is created without --draft.
// #5250 added the credits that never come from an issue's author: advisory
// reporters (--advisory), the prototype paragraph (--thank), and the
// preview's discovery of credit notes on the milestone's closed issues. Run via
// `npm run test:scripts`.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADVISORY_LEAD_IN,
  MIXED_LEAD_IN,
  REPO,
  THANKS_LEAD_IN,
  assembleNotes,
  bucket,
  closingKeywordIssues,
  dirsTouched,
  formatKnownIssues,
  formatPackages,
  formatThanks,
  main,
  mentionsOf,
  parseGenerated,
  parseNotesArgs,
  prototypeLeadIn,
  registryUrl,
} from "./release-notes.mjs";

const GHSA_A = "GHSA-66qx-2266-pmj6";
const GHSA_B = "GHSA-4gxg-m5jx-9j57";

const SHA = "a".repeat(40);
const BASE = [
  "--milestone",
  "v2.0.0",
  "--merge-sha",
  SHA,
  "--merge-branch",
  "v2/chore/1-release-v2.0.0",
  "--ledger-url",
  "https://l.example/x",
];
const PULL = (/** @type {number | string} */ n) =>
  `https://github.com/${REPO}/pull/${n}`;

test("parseNotesArgs defaults to a preview and validates its inputs", () => {
  assert.deepEqual(parseNotesArgs(BASE), {
    milestone: "v2.0.0",
    mergeSha: SHA,
    mergeBranch: "v2/chore/1-release-v2.0.0",
    ledgerUrl: "https://l.example/x",
    knownIssues: [],
    advisories: [],
    thanks: [],
    previousTag: undefined,
    mode: "preview",
  });
  assert.equal(parseNotesArgs([...BASE, "--draft"]).mode, "draft");
  assert.deepEqual(
    parseNotesArgs([...BASE, "--known-issue", "a", "--known-issue", "b"])
      .knownIssues,
    ["a", "b"],
  );
  assert.throws(() => parseNotesArgs([]), /all required/);
  const swap = (/** @type {string} */ flag, /** @type {string} */ value) => {
    const argv = [...BASE];
    argv[argv.indexOf(flag) + 1] = value;
    return argv;
  };
  assert.throws(
    () => parseNotesArgs(swap("--milestone", "2.0.0")),
    /not vX\.Y\.Z/,
  );
  assert.throws(
    () => parseNotesArgs(swap("--merge-sha", "main")),
    /not a full 40-hex SHA/,
  );
  assert.throws(
    () => parseNotesArgs(swap("--ledger-url", "ftp://x")),
    /not an https URL/,
  );
  assert.throws(
    () => parseNotesArgs([...BASE, "--previous-tag", "2026.8.31", "--draft"]),
    /--previous-tag is preview-only/,
  );
  assert.equal(
    parseNotesArgs([...BASE, "--previous-tag", "2026.8.31"]).previousTag,
    "2026.8.31",
  );
  // There is no --publish: publishing is the maintainer's act on the draft.
  assert.throws(() => parseNotesArgs([...BASE, "--publish"]), /publish/);
});

test("parseNotesArgs takes advisories and hand credits, and validates both", () => {
  const args = parseNotesArgs([
    ...BASE,
    "--advisory",
    GHSA_A,
    "--advisory",
    GHSA_B,
    "--advisory",
    GHSA_A,
    "--thank",
    "@amy (#1), the fix for #2",
    "--thank",
    "@bob-c and @dee (#3), the docs",
  ]);
  // A repeated advisory is read and listed once.
  assert.deepEqual(args.advisories, [GHSA_A, GHSA_B]);
  assert.deepEqual(args.thanks, [
    "@amy (#1), the fix for #2",
    "@bob-c and @dee (#3), the docs",
  ]);
  for (const id of ["GHSA-66qx-2266", "ghsa-66qx-2266-pmj6", "CVE-2026-1"]) {
    assert.throws(
      () => parseNotesArgs([...BASE, "--advisory", id]),
      /is not a GHSA-xxxx-xxxx-xxxx id/,
    );
  }
  for (const line of [
    "amy (#1), the fix",
    "thanks @amy",
    "@amy (#1)\n* @eve, injected",
    "@scope/pkg, a package",
    "@my-scope/pkg, a hyphenated scope",
  ]) {
    assert.throws(
      () => parseNotesArgs([...BASE, "--thank", line]),
      /is not one line starting with @login/,
    );
  }
});

test("registryUrl asks for the exact version on each registry", () => {
  assert.equal(
    registryUrl({
      dir: "memory",
      name: "@modelcontextprotocol/server-memory",
      version: "1.0.0",
      registry: "npm",
    }),
    "https://registry.npmjs.org/@modelcontextprotocol%2Fserver-memory/1.0.0",
  );
  assert.equal(
    registryUrl({
      dir: "git",
      name: "mcp-server-git",
      version: "2026.10.1",
      registry: "PyPI",
    }),
    "https://pypi.org/pypi/mcp-server-git/2026.10.1/json",
  );
});

test("formatPackages marks what this release publishes", () => {
  assert.equal(
    formatPackages([
      {
        dir: "a",
        name: "@s/a",
        version: "1.0.0",
        registry: "npm",
        published: true,
      },
      {
        dir: "b",
        name: "b",
        version: "0.1",
        registry: "PyPI",
        published: false,
      },
    ]),
    [
      "## Packages",
      "",
      "| Package | Version | Registry | In this release |",
      "| --- | --- | --- | --- |",
      "| `@s/a` | `1.0.0` | npm | **published** |",
      "| `b` | `0.1` | PyPI | unchanged |",
    ].join("\n"),
  );
});

test("parseGenerated splits PR entries from GitHub's trailer", () => {
  const body = [
    "<!-- Release notes generated using configuration in .github/release.yml -->",
    "## What's Changed",
    `* fix: a by @x in ${PULL(12)}`,
    `* chore: b by @y in ${PULL(3)}`,
    "",
    "## New Contributors",
    `* @y made their first contribution in ${PULL(3)}`,
    "",
    "**Full Changelog**: https://example/compare",
  ].join("\n");
  assert.deepEqual(parseGenerated(body), {
    entries: [
      { pr: 12, line: `* fix: a by @x in ${PULL(12)}` },
      { pr: 3, line: `* chore: b by @y in ${PULL(3)}` },
    ],
    trailer: [
      "## New Contributors",
      "",
      `* @y made their first contribution in ${PULL(3)}`,
      "",
      "**Full Changelog**: https://example/compare",
    ].join("\n"),
  });
  // A category heading (a future .github/release.yml) is fine; a repeat is not
  // listed twice.
  assert.deepEqual(
    parseGenerated(`### Fixes\n* a in ${PULL(1)}\n* a in ${PULL(1)}`).entries,
    [{ pr: 1, line: `* a in ${PULL(1)}` }],
  );
  assert.equal(parseGenerated(`* a in ${PULL(1)}`).trailer, "");
});

test("parseGenerated throws on a line it does not know, rather than drop it", () => {
  assert.throws(
    () =>
      parseGenerated("## What's Changed\n* a in https://github.com/o/r/pull/1"),
    /unrecognized line/,
  );
  assert.throws(
    () => parseGenerated("## What's Changed\nsomething new"),
    /unrecognized line/,
  );
});

test("dirsTouched maps src/<dir>/ to known package directories only", () => {
  const dirs = new Set(["git", "memory", "time"]);
  assert.deepEqual(dirsTouched(["src/git/a.py"], dirs), ["git"]);
  assert.deepEqual(
    dirsTouched(["src/time/x", "src/git/y", "src/git/z", "README.md"], dirs),
    ["git", "time"],
  );
  assert.deepEqual(
    dirsTouched(["scripts/x.mjs", "src/README.md", "src/unknown/x"], dirs),
    [],
  );
});

test("bucket: one, several and no servers; unpublished and empty fall to Repository", () => {
  const pkgs = [
    { dir: "git", name: "g", version: "2", registry: "PyPI", published: true },
    { dir: "time", name: "t", version: "2", registry: "PyPI", published: true },
    {
      dir: "memory",
      name: "m",
      version: "1",
      registry: "npm",
      published: false,
    },
  ];
  const e = (/** @type {number} */ pr) => ({ pr, line: `* ${pr}` });
  const entries = [e(1), e(2), e(3), e(4), e(5)];
  const touched = new Map([
    [1, ["git"]],
    [2, ["git", "time"]],
    [3, []],
    [4, ["memory"]],
    [5, ["memory", "time"]],
  ]);
  const sections = /** @type {const} */ (bucket(entries, pkgs, touched)).map(
    (s) => [s.heading, s.entries.map((x) => x.pr)],
  );
  assert.deepEqual(sections, [
    ["## g 2", [1, 2]],
    ["## t 2", [2, 5]],
    ["## Repository", [3, 4]],
  ]);
  // No leftovers → no Repository section; a published package with no PR
  // still gets its section.
  assert.deepEqual(
    bucket([e(1)], pkgs, new Map([[1, ["git"]]])).map((s) => s.heading),
    ["## g 2", "## t 2"],
  );
});

test("closingKeywordIssues reads every closing keyword, never a cross-repo ref", () => {
  const body = [
    "Closes #1",
    "fixes: #2, Resolved #3",
    "close #4 and FIXED #5",
    "Refs #6",
    "Closes other/repo#7",
    "prefixes #8",
  ].join("\n");
  assert.deepEqual(closingKeywordIssues(body), [1, 2, 3, 4, 5]);
  assert.deepEqual(closingKeywordIssues(null), []);
});

test("closingKeywordIssues ignores keywords GitHub ignores: code, quotes, comments", () => {
  const body = [
    "Closes #1",
    "<!-- Closes #2 -->",
    "Documents `Closes #4` and ``fixes #5``.",
    "```sh",
    "Closes #6",
    "```",
    "> Closes #8",
    "Resolves #10",
  ].join("\n");
  assert.deepEqual(closingKeywordIssues(body), [1, 10]);
  assert.deepEqual(closingKeywordIssues("Closes #1\n```\nCloses #2"), [1]);
});

test("formatThanks orders by issue count, then name case-insensitively", () => {
  const reporters = new Map([
    ["zed", [5]],
    ["Amy", [9]],
    ["many", [1, 2, 3]],
    ["bob", [4]],
  ]);
  assert.equal(
    formatThanks({ reporters }),
    [
      "## Thanks for helping us improve",
      "",
      THANKS_LEAD_IN,
      "",
      "* @many (#1, #2, #3)",
      "* @Amy (#9)",
      "* @bob (#4)",
      "* @zed (#5)",
    ].join("\n"),
  );
  assert.equal(formatThanks({}), "");
  assert.equal(
    formatThanks({ reporters: new Map(), advisories: new Map(), thanks: [] }),
    "",
  );
});

test("formatThanks: advisories alone, mixed with issues, one line per person", () => {
  assert.equal(
    formatThanks({
      advisories: new Map([
        ["solo", [GHSA_B]],
        ["two", [GHSA_A, GHSA_B]],
      ]),
    }),
    [
      "## Thanks for helping us improve",
      "",
      ADVISORY_LEAD_IN,
      "",
      `* @two (${GHSA_A}, ${GHSA_B})`,
      `* @solo (${GHSA_B})`,
    ].join("\n"),
  );
  // A person who filed an issue and reported an advisory is listed once,
  // issues first, and counted by every reference.
  assert.equal(
    formatThanks({
      reporters: new Map([
        ["both", [7]],
        ["filer", [3, 4]],
      ]),
      advisories: new Map([
        ["both", [GHSA_A, GHSA_B]],
        ["finder", [GHSA_A]],
      ]),
    }),
    [
      "## Thanks for helping us improve",
      "",
      MIXED_LEAD_IN,
      "",
      `* @both (#7, ${GHSA_A}, ${GHSA_B})`,
      "* @filer (#3, #4)",
      `* @finder (${GHSA_A})`,
    ].join("\n"),
  );
});

test("formatThanks: the prototype paragraph, alone or after the reporters", () => {
  assert.equal(
    formatThanks({ thanks: ["@ace (#1), the assertion"] }),
    [
      "## Thanks for helping us improve",
      "",
      prototypeLeadIn(1, false),
      "",
      "* @ace (#1), the assertion",
    ].join("\n"),
  );
  assert.match(
    prototypeLeadIn(1, false),
    /^Thank you to this contributor, whose pull request prototyped a change/,
  );
  assert.match(
    prototypeLeadIn(2, true),
    /^And to these contributors, whose pull requests prototyped changes/,
  );
  assert.match(
    prototypeLeadIn(2, false),
    /\[issues, not pull requests\]\(https:\/\/github\.com\/modelcontextprotocol\/servers\/blob\/v2\/main\/CONTRIBUTING\.md\)/,
  );
  assert.equal(
    formatThanks({
      reporters: new Map([["r", [1]]]),
      thanks: ["@a (#2), x", "@b (#3), y"],
    }),
    [
      "## Thanks for helping us improve",
      "",
      THANKS_LEAD_IN,
      "",
      "* @r (#1)",
      "",
      prototypeLeadIn(2, true),
      "",
      "* @a (#2), x",
      "* @b (#3), y",
    ].join("\n"),
  );
});

test("mentionsOf finds logins in prose only", () => {
  assert.deepEqual(
    mentionsOf(
      [
        "Credit to @amy and @Bob-C's prototype, (@dee), @amy again.",
        "Mail me@example.com; install @modelcontextprotocol/server-memory.",
        "Not `@code`, not <!-- @hidden -->,",
        "> nor @quoted",
        "```",
        "@fenced",
        "```",
        "nor a-@b, nor @-x, nor @trailing-.",
      ].join("\n"),
    ),
    ["amy", "Bob-C", "dee"],
  );
});

test("formatKnownIssues pluralizes and is omitted when empty", () => {
  assert.equal(formatKnownIssues([]), "");
  assert.equal(formatKnownIssues(["one"]), "## Known issue\n\none");
  assert.equal(formatKnownIssues(["a", "b"]), "## Known issues\n\na\n\nb");
});

test("assembleNotes: packages, ledger, sections, trailer, known issues, thanks", () => {
  assert.equal(
    assembleNotes({
      packages: "P",
      sections: ["S1", "S2"],
      trailer: "T",
      mergeBranch: "mb",
      ledgerUrl: "https://l",
      knownIssues: ["K"],
      thanks: "## Thanks for helping us improve\n\nX",
    }),
    "P\n\nRelease ledger: [mb](https://l)\n\nS1\n\nS2\n\nT\n\n## Known issue\n\nK\n\n## Thanks for helping us improve\n\nX\n",
  );
  assert.equal(
    assembleNotes({
      packages: "P",
      sections: [],
      trailer: "",
      mergeBranch: "mb",
      ledgerUrl: "https://l",
      knownIssues: [],
      thanks: "",
    }),
    "P\n\nRelease ledger: [mb](https://l)\n",
  );
});

// A fake `gh` over a small repo model, and a fake registry. `failOn` makes the
// first gh call whose joined argv includes it fail, the way a rate limit or a
// 404 would.
function world({
  packages = {
    git: { file: "pyproject.toml", name: "mcp-server-git", version: "2.0.0" },
    time: { file: "pyproject.toml", name: "mcp-server-time", version: "2.0.0" },
    memory: {
      file: "package.json",
      name: "@modelcontextprotocol/server-memory",
      version: "1.0.0",
    },
  },
  onRegistry = ["mcp-server-time"],
  /** @type {Record<number, { files?: string[], renamedFrom?: Record<string, string>, body?: string, closing?: number[], pages?: Array<Array<number | object>> }>} */
  pulls = {},
  /** @type {Record<number, object>} */
  issues = {},
  /** @type {Record<string, string>} */
  perms = {},
  /** @type {string | undefined} */
  failOn = undefined,
  compare = "identical",
  releases = ["2026.8.31"],
  /** @type {string[]} */
  tagRefs = [],
  /** @type {Record<string, object>} */
  advisories = {},
  /** @type {Record<string, number>} */
  milestones = { "v2.0.0": 4 },
  /** @type {Array<{ number: number, body?: string | null, author: string, type?: string, comments?: Array<{ body: string | null, author: string, type?: string }> }>} */
  milestoneIssues = [],
} = {}) {
  /** @type {Array<{ cmd: string, args: string[], input?: string }>} */
  const calls = [];
  const generated = [
    "## What's Changed",
    ...Object.keys(pulls).map((n) => `* change ${n} by @dev in ${PULL(n)}`),
    "",
    "**Full Changelog**: https://example/compare",
  ].join("\n");
  const ok = (/** @type {string} */ stdout) => ({
    status: 0,
    stdout,
    stderr: "",
  });
  const tree = {
    entries: [
      { name: "README.md", type: "blob", object: {} },
      ...Object.entries(packages).map(([dir, p]) => ({
        name: dir,
        type: "tree",
        object: {
          entries: [
            { name: "README.md", object: { text: "" } },
            {
              name: p.file,
              object: {
                text:
                  p.file === "package.json"
                    ? JSON.stringify({ name: p.name, version: p.version })
                    : `[project]\nname = "${p.name}"\nversion = "${p.version}"\n`,
              },
            },
          ],
        },
      })),
    ],
  };
  /**
   * @param {string} cmd
   * @param {string[]} args
   * @param {{ input?: string }} [opts]
   */
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, input: opts?.input });
    const joined = args.join(" ");
    if (failOn && joined.includes(failOn)) {
      return { status: 1, stdout: "", stderr: "API rate limit exceeded" };
    }
    assert.equal(cmd, "gh");
    if (args[0] === "release" && args[1] === "view") return ok(releases[0]);
    if (args[0] === "release") return ok("https://github.com/r/releases/1");
    if (args[1] === "graphql") {
      const vars = Object.fromEntries(
        args
          .filter((_, i) => args[i - 1] === "-F" || args[i - 1] === "-f")
          .map((kv) => kv.split(/=(.*)/s).slice(0, 2)),
      );
      if (vars.query.includes("Blob")) {
        assert.equal(vars.expr, `${SHA}:src`);
        return ok(JSON.stringify({ data: { repository: { object: tree } } }));
      }
      const n = Number(vars.n);
      const index = vars.after ? Number(vars.after) : 0;
      if (vars.query.includes("closingIssuesReferences")) {
        const pr = pulls[n];
        const pages = pr.pages ?? [pr.closing ?? []];
        const hasNextPage = index + 1 < pages.length;
        return ok(
          JSON.stringify({
            data: {
              repository: {
                pullRequest: {
                  body: pr.body ?? "",
                  closingIssuesReferences: {
                    pageInfo: {
                      hasNextPage,
                      endCursor: hasNextPage ? String(index + 1) : null,
                    },
                    nodes: pages[index].map((ref) =>
                      typeof ref === "number"
                        ? { number: ref, repository: { nameWithOwner: REPO } }
                        : ref,
                    ),
                  },
                },
              },
            },
          }),
        );
      }
      return ok(
        JSON.stringify({
          data: { repository: { issueOrPullRequest: issues[n] ?? null } },
        }),
      );
    }
    const files = args[2]?.match(/pulls\/(\d+)\/files$/);
    if (files) {
      // The --jq emits each file, then its rename source when it has one.
      const { files: list = [], renamedFrom = {} } = pulls[Number(files[1])];
      return ok(
        list
          .flatMap((f) => (renamedFrom[f] ? [f, renamedFrom[f]] : [f]))
          .join("\n"),
      );
    }
    const advisory = args[1].match(/security-advisories\/(.+)$/)?.[1];
    if (advisory) {
      assert.equal(args.length, 2);
      return advisories[advisory]
        ? ok(JSON.stringify(advisories[advisory]))
        : { status: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" };
    }
    // The --jq each listing passes, applied to the model: the milestone's
    // number by title, then its closed issues and each one's comments as JSON
    // lines.
    if (args[2]?.includes("/milestones?")) {
      const title = JSON.parse(
        /** @type {string} */ (args[4].match(/== (".*?")\)/)?.[1]),
      );
      return ok(String(milestones[title] ?? ""));
    }
    if (args[2]?.includes("/issues?milestone=")) {
      assert.match(args[2], /state=closed/);
      const number = Number(args[2].match(/milestone=(\d+)/)?.[1]);
      assert.ok(Object.values(milestones).includes(number));
      return ok(
        milestoneIssues
          .map((i) =>
            JSON.stringify({
              number: i.number,
              url: `https://github.com/${REPO}/issues/${i.number}`,
              body: i.body ?? null,
              author: i.author,
              type: i.type ?? "User",
            }),
          )
          .join("\n"),
      );
    }
    const commentsOf = args[2]?.match(/issues\/(\d+)\/comments/)?.[1];
    if (commentsOf) {
      const issue = milestoneIssues.find(
        (i) => i.number === Number(commentsOf),
      );
      return ok(
        (issue?.comments ?? [])
          .map((c, k) =>
            JSON.stringify({
              url: `https://github.com/${REPO}/issues/${commentsOf}#issuecomment-${k}`,
              body: c.body,
              author: c.author,
              type: c.type ?? "User",
            }),
          )
          .join("\n"),
      );
    }
    if (args[1].includes("/git/matching-refs/tags/"))
      return ok(tagRefs.join("\n"));
    if (args[1].endsWith("/releases/generate-notes")) return ok(generated);
    if (args[1].includes("/compare/")) return ok(compare);
    if (args[2] === `repos/${REPO}/releases`) return ok(releases.join("\n"));
    const login = args[1].match(/collaborators\/([^/]+)\/permission/)?.[1];
    assert.ok(login, `unexpected gh call: ${joined}`);
    // GitHub's answer for a login that is no account.
    if (!(login in perms)) {
      return {
        status: 1,
        stdout: "",
        stderr: `gh: ${login} is not a user (HTTP 404)`,
      };
    }
    return ok(perms[login]);
  };
  spawn.calls = calls;
  /** @type {string[]} */
  const fetched = [];
  /** @param {string} url */
  const fetch = async (url) => {
    fetched.push(url);
    const name = Object.values(packages).find((p) =>
      url.includes(p.name.replaceAll("/", "%2F")),
    )?.name;
    return { status: name && onRegistry.includes(name) ? 200 : 404 };
  };
  return { spawn, fetch, fetched };
}

const user = (/** @type {string} */ login, extra = {}) => ({
  __typename: "Issue",
  author: { login, __typename: "User" },
  ...extra,
});
/** @param {import("node:test").TestContext} t */
function quiet(t) {
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const err = [];
  t.mock.method(console, "error", (/** @type {string} */ line) => {
    err.push(line);
  });
  t.mock.method(process.stdout, "write", (/** @type {string} */ chunk) => {
    out.push(chunk);
    return true;
  });
  return { out, err };
}

/** The text of one `## …` section of the notes. */
function sectionOf(/** @type {string} */ notes, /** @type {string} */ heading) {
  const start = notes.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `no section ${heading}`);
  const next = notes.indexOf("\n## ", start + heading.length);
  return notes.slice(start, next === -1 ? undefined : next);
}

test("notes: per-server sections, every PR placed, one release-wide Thanks", async (t) => {
  const { out } = quiet(t);
  const deps = world({
    pulls: {
      10: { files: ["src/git/a.py"], body: "Closes #1" },
      11: { files: ["src/git/b.py", "src/memory/c.ts"], closing: [2] },
      12: { files: [".github/workflows/x.yml"], body: "Fixes #3" },
      13: { files: ["src/time/d.py"], body: "Closes #4" },
    },
    issues: {
      1: user("reporter"),
      2: user("reporter"),
      3: user("docs-person"),
      4: user("reporter"),
    },
    perms: { reporter: "read", "docs-person": "triage" },
  });
  const notes = await main(BASE, deps);
  assert.equal(out.join(""), notes);

  // time is already on the registry, so it is unchanged, gets no section,
  // and its PR falls through to Repository rather than being dropped.
  assert.match(
    notes,
    /\| `mcp-server-time` \| `2\.0\.0` \| PyPI \| unchanged \|/,
  );
  assert.doesNotMatch(notes, /^## mcp-server-time/m);
  assert.deepEqual(notes.match(/^## .*/gm), [
    "## Packages",
    "## @modelcontextprotocol/server-memory 1.0.0",
    "## mcp-server-git 2.0.0",
    "## Repository",
    "## Thanks for helping us improve",
  ]);
  // The ledger sits directly under the Packages table (#5115), so the
  // evidence for what was published is read with it, not below every PR list.
  assert.match(
    sectionOf(notes, "## Packages"),
    /\|\n\nRelease ledger: \[v2\/chore\/1-release-v2\.0\.0\]\(https:\/\/l\.example\/x\)\n$/,
  );
  assert.equal(notes.split("Release ledger:").length, 2);

  const git = sectionOf(notes, "## mcp-server-git 2.0.0");
  assert.match(git, /change 10 .*\n\* change 11 [^\n]*\n*$/);
  const memory = sectionOf(
    notes,
    "## @modelcontextprotocol/server-memory 1.0.0",
  );
  assert.match(memory, /change 11/);
  assert.doesNotMatch(memory, /change 10/);
  const repo = sectionOf(notes, "## Repository");
  assert.match(
    repo,
    /change 12[^\n]*\n\* change 13 [^\n]*\n\n\*\*Full Changelog/,
  );

  // One Thanks section for the whole release, last, as the Inspector lays it
  // out: each reporter once, with every issue of theirs across all servers.
  assert.ok(
    notes.endsWith(
      [
        "**Full Changelog**: https://example/compare",
        "",
        "## Thanks for helping us improve",
        "",
        THANKS_LEAD_IN,
        "",
        "* @reporter (#1, #2, #4)",
        "* @docs-person (#3)",
        "",
      ].join("\n"),
    ),
    notes,
  );
  // Each PR's files, closing refs, each issue and each login: looked up once.
  const count = (/** @type {string} */ s) =>
    deps.spawn.calls.filter((c) => c.args.join(" ").includes(s)).length;
  assert.equal(count("pulls/11/files"), 1);
  assert.equal(count("/permission"), 2);
  assert.equal(
    deps.spawn.calls.filter(
      (c) =>
        c.args.join(" ").includes("issueOrPullRequest") &&
        c.args.includes("n=2"),
    ).length,
    1,
  );
  // The registries were asked about the exact versions on the merge SHA.
  assert.deepEqual(deps.fetched, [
    "https://registry.npmjs.org/@modelcontextprotocol%2Fserver-memory/1.0.0",
    "https://pypi.org/pypi/mcp-server-git/2.0.0/json",
    "https://pypi.org/pypi/mcp-server-time/2.0.0/json",
  ]);
  // The preview creates nothing.
  assert.equal(
    deps.spawn.calls.some(
      (c) => c.args[0] === "release" && c.args[1] === "create",
    ),
    false,
  );
});

test("Thanks excludes maintainers, bots, deleted accounts, PRs and other repos", async (t) => {
  quiet(t);
  const notes = await main(
    BASE,
    world({
      pulls: {
        10: {
          files: ["src/git/a.py"],
          body: "Closes #1\nFixes #2\nResolves #4, closes #5, closes #6",
          closing: [
            3,
            { number: 7, repository: { nameWithOwner: "other/repo" } },
          ],
        },
      },
      issues: {
        1: user("reporter"),
        2: user("maint"),
        3: user("reporter"),
        4: { __typename: "Issue", author: { login: "bot", __typename: "Bot" } },
        5: { __typename: "PullRequest" },
        6: { __typename: "Issue", author: null },
      },
      perms: { reporter: "read", maint: "write" },
    }),
  );
  assert.match(notes, /\* @reporter \(#1, #3\)\n/);
  assert.doesNotMatch(notes, /@maint|@bot|#5|#7/);
});

test("the Thanks section is left out when no community reporter remains", async (t) => {
  quiet(t);
  const notes = await main(
    BASE,
    world({
      pulls: { 10: { files: ["src/git/a.py"], body: "Closes #1" } },
      issues: { 1: user("maint") },
      perms: { maint: "maintain" },
    }),
  );
  assert.doesNotMatch(notes, /Thanks/);
  assert.match(
    notes,
    /## mcp-server-git 2\.0\.0\n\n### What's Changed\n\n\* change 10/,
  );
});

test("closing references are followed across every page", async (t) => {
  quiet(t);
  const deps = world({
    pulls: { 10: { files: ["src/git/a"], pages: [[1], [2], [3]] } },
    issues: { 1: user("a"), 2: user("b"), 3: user("c") },
    perms: { a: "read", b: "triage", c: "none" },
  });
  const notes = await main(BASE, deps);
  assert.match(notes, /@a \(#1\)\n\* @b \(#2\)\n\* @c \(#3\)/);
  const cursors = deps.spawn.calls
    .filter((c) => c.args.some((a) => a.includes("closingIssuesReferences")))
    .map((c) => c.args.find((a) => a.startsWith("after=")) ?? null);
  assert.deepEqual(cursors, [null, "after=1", "after=2"]);
});

test("generate-notes runs from the latest published Release to the merge SHA", async (t) => {
  quiet(t);
  const deps = world();
  await main(BASE, deps);
  const call = deps.spawn.calls.find((c) =>
    c.args[1]?.endsWith("/releases/generate-notes"),
  );
  assert.deepEqual(call?.args.slice(2), [
    "-f",
    "tag_name=v2.0.0",
    "-f",
    `target_commitish=${SHA}`,
    "-f",
    "previous_tag_name=2026.8.31",
    "--jq",
    ".body",
  ]);

  const override = world();
  await main([...BASE, "--previous-tag", "2026.8.18"], override);
  assert.ok(
    override.spawn.calls.some((c) =>
      c.args.includes("previous_tag_name=2026.8.18"),
    ),
  );
  assert.equal(
    override.spawn.calls.some((c) => c.args[0] === "release"),
    false,
  );
});

for (const [what, failOn] of [
  ["the previous-release lookup", "release view"],
  ["the manifest lookup", ":src"],
  ["generate-notes", "generate-notes"],
  ["a PR files lookup", "/files"],
  ["a closing-references lookup", "closingIssuesReferences"],
  ["an issue lookup", "issueOrPullRequest"],
  ["a permission lookup", "/permission"],
  ["the compare check", "/compare/"],
  ["the existing-release check", `repos/${REPO}/releases --jq`],
  ["the existing-tag check", "matching-refs"],
]) {
  test(`a failed ${what} aborts with nothing created`, async (t) => {
    quiet(t);
    const deps = world({
      pulls: { 10: { files: ["src/git/a"], body: "Closes #1" } },
      issues: { 1: user("maybe-maint") },
      perms: { "maybe-maint": "read" },
      failOn,
    });
    await assert.rejects(
      main([...BASE, "--draft"], deps),
      /rate limit exceeded/,
    );
    assert.equal(
      deps.spawn.calls.some((c) => c.args[1] === "create"),
      false,
    );
  });
}

test("a registry answer other than 200/404 aborts — UNKNOWN is a stop", async (t) => {
  quiet(t);
  const deps = world();
  const fetch = async () => ({ status: 503 });
  await assert.rejects(
    main([...BASE, "--draft"], { spawn: deps.spawn, fetch }),
    /HTTP 503 .*UNKNOWN/,
  );
  assert.equal(
    deps.spawn.calls.some((c) => c.args[1] === "create"),
    false,
  );
});

test("an unknown permission value aborts rather than reading as community", async (t) => {
  quiet(t);
  await assert.rejects(
    main(
      BASE,
      world({
        pulls: { 10: { files: [], body: "Closes #1" } },
        issues: { 1: user("who") },
        perms: { who: "" },
      }),
    ),
    /unexpected permission "" for @who/,
  );
});

test("GraphQL errors and missing nodes abort", async (t) => {
  quiet(t);
  await assert.rejects(
    main(BASE, world({ pulls: { 10: { files: [], body: "Closes #99" } } })),
    /#99 not found/,
  );

  const inner = world({ pulls: { 10: { files: [] } } });
  const respond = (/** @type {string} */ stdout) =>
    /** @type {import("./release-notes.mjs").Spawn} */ (
      (cmd, args, opts) =>
        args[1] === "graphql" &&
        args.some((a) => a.includes("closingIssuesReferences"))
          ? { status: 0, stdout, stderr: "" }
          : inner.spawn(cmd, args, opts)
    );
  await assert.rejects(
    main(BASE, {
      spawn: respond('{"errors":[{"message":"boom"}]}'),
      fetch: inner.fetch,
    }),
    /boom/,
  );
  await assert.rejects(
    main(BASE, {
      spawn: respond('{"data":{"repository":{"pullRequest":null}}}'),
      fetch: inner.fetch,
    }),
    /PR #10 not found/,
  );
});

test("a manifest tree that is missing or malformed aborts", async (t) => {
  quiet(t);
  const inner = world();
  const tree = (/** @type {unknown} */ object) =>
    /** @type {import("./release-notes.mjs").Spawn} */ (
      (cmd, args, opts) =>
        args.some((a) => a.includes("Blob"))
          ? {
              status: 0,
              stdout: JSON.stringify({ data: { repository: { object } } }),
              stderr: "",
            }
          : inner.spawn(cmd, args, opts)
    );
  const run = (/** @type {unknown} */ object) =>
    main(BASE, { spawn: tree(object), fetch: inner.fetch });
  await assert.rejects(run(null), /no src\/ tree/);
  await assert.rejects(run({ entries: [] }), /no package manifests/);
  const dir = (/** @type {unknown} */ file) => ({
    entries: [{ name: "x", type: "tree", object: { entries: [file] } }],
  });
  await assert.rejects(
    run(dir({ name: "package.json", object: null })),
    /src\/x\/package\.json has no text/,
  );
  await assert.rejects(
    run(dir({ name: "package.json", object: { text: '{"version":"1"}' } })),
    /has no package name/,
  );
  await assert.rejects(
    run(dir({ name: "package.json", object: { text: '{"name":"n"}' } })),
    /has no version/,
  );
});

test("no previous published Release aborts", async (t) => {
  quiet(t);
  await assert.rejects(
    main(BASE, world({ releases: [""] })),
    /no previous published Release/,
  );
});

test("a spawn error is rethrown", async () => {
  const boom = new Error("ENOENT");
  await assert.rejects(
    main(BASE, {
      spawn: () => ({ status: null, error: boom }),
      fetch: world().fetch,
    }),
    (e) => e === boom,
  );
});

test("--draft creates a draft at the merge SHA under the milestone tag", async (t) => {
  quiet(t);
  const deps = world();
  const notes = await main([...BASE, "--draft"], deps);
  const create = deps.spawn.calls.find((c) => c.args[1] === "create");
  assert.deepEqual(create?.args, [
    "release",
    "create",
    "v2.0.0",
    "--repo",
    REPO,
    "--target",
    SHA,
    "--title",
    "v2.0.0",
    "--notes-file",
    "-",
    "--draft",
  ]);
  assert.equal(create?.input, notes);
  // Never published, never marked latest: that is the maintainer's step.
  assert.equal(create?.args.includes("--latest"), false);
});

test("--draft refuses a SHA that is not on main", async (t) => {
  quiet(t);
  for (const compare of ["ahead", "diverged"]) {
    const deps = world({ compare });
    await assert.rejects(
      main([...BASE, "--draft"], deps),
      new RegExp(`not on main \\(compare status "${compare}"\\)`),
    );
    assert.equal(
      deps.spawn.calls.some((c) => c.args.join(" ").includes("generate-notes")),
      false,
    );
  }
  const behind = world({ compare: "behind" });
  await main([...BASE, "--draft"], behind);
  assert.ok(behind.spawn.calls.some((c) => c.args[1] === "create"));
});

test("--draft refuses when a Release or draft with that tag already exists", async (t) => {
  quiet(t);
  const deps = world({ releases: ["2026.8.31", "v2.0.0"] });
  await assert.rejects(
    main([...BASE, "--draft"], deps),
    /tagged v2\.0\.0 already exists/,
  );
  assert.equal(
    deps.spawn.calls.some((c) => c.args[1] === "create"),
    false,
  );
});

test("an existing milestone tag aborts in every mode, before notes are generated", async (t) => {
  quiet(t);
  for (const mode of [[], ["--draft"]]) {
    const deps = world({
      // A prefix match (v2.0.0-rc.1) is not the tag itself.
      tagRefs: ["refs/tags/v2.0.0-rc.1", "refs/tags/v2.0.0"],
    });
    await assert.rejects(
      main([...BASE, ...mode], deps),
      /tag v2\.0\.0 already exists: GitHub would use its commit/,
    );
    assert.equal(
      deps.spawn.calls.some(
        (c) =>
          c.args.join(" ").includes("generate-notes") || c.args[1] === "create",
      ),
      false,
    );
  }
  const prefixOnly = world({ tagRefs: ["refs/tags/v2.0.0-rc.1"] });
  await main(BASE, prefixOnly);
});

test("a file renamed out of a server's directory still places the PR there", async (t) => {
  quiet(t);
  const notes = await main(
    BASE,
    world({
      pulls: {
        10: {
          files: ["docs/moved.md"],
          renamedFrom: { "docs/moved.md": "src/git/old.md" },
        },
      },
    }),
  );
  assert.match(
    notes,
    /## mcp-server-git 2\.0\.0\n\n### What's Changed\n\n\* change 10/,
  );
  assert.doesNotMatch(notes, /## Repository/);
});

/** An advisory as `security-advisories/{id}` answers, credits as given. */
function advisory(
  /** @type {string} */ id,
  /** @type {Array<[string, string, string?]>} */ credits,
  state = "draft",
) {
  return {
    ghsa_id: id,
    state,
    credits_detailed: credits.map(([login, creditState, type = "User"]) => ({
      user: { login, type },
      type: "reporter",
      state: creditState,
    })),
  };
}

test("--advisory credits each advisory's reporters, flags pending, drops the rest", async (t) => {
  const { err } = quiet(t);
  const deps = world({
    pulls: { 10: { files: ["src/git/a.py"], body: "Closes #1" } },
    issues: { 1: user("both") },
    advisories: {
      [GHSA_A]: advisory(GHSA_A, [
        ["both", "accepted"],
        ["waiting", "pending"],
        ["nope", "declined"],
        ["dependabot", "accepted", "Bot"],
        ["maint", "accepted"],
      ]),
      [GHSA_B]: advisory(
        GHSA_B,
        [
          ["both", "accepted"],
          ["finder", "accepted"],
        ],
        "published",
      ),
    },
    perms: { both: "read", waiting: "read", finder: "none", maint: "admin" },
  });
  const notes = await main(
    [...BASE, "--advisory", GHSA_A, "--advisory", GHSA_B],
    deps,
  );
  assert.ok(
    notes.endsWith(
      [
        "## Thanks for helping us improve",
        "",
        MIXED_LEAD_IN,
        "",
        `* @both (#1, ${GHSA_A}, ${GHSA_B})`,
        `* @finder (${GHSA_B})`,
        `* @waiting (${GHSA_A})`,
        "",
      ].join("\n"),
    ),
    notes,
  );
  assert.doesNotMatch(notes, /@nope|@dependabot|@maint/);
  assert.ok(
    err.some((line) =>
      line.startsWith(`PENDING advisory credit: @waiting on ${GHSA_A}`),
    ),
    err.join("\n"),
  );
  // A declined credit and a bot are never looked up; everyone else once,
  // across issues and advisories.
  const asked = deps.spawn.calls
    .map((c) => c.args[1]?.match(/collaborators\/([^/]+)\/permission/)?.[1])
    .filter(Boolean);
  assert.deepEqual(asked, ["both", "waiting", "maint", "finder"]);
});

test("an advisory that cannot carry a shipped fix, or answers oddly, aborts", async (t) => {
  quiet(t);
  const run = (/** @type {object} */ answer) =>
    main(
      [...BASE, "--advisory", GHSA_A, "--draft"],
      world({ advisories: { [GHSA_A]: answer }, perms: { x: "read" } }),
    );
  for (const state of ["triage", "closed", "withdrawn"]) {
    await assert.rejects(
      run(advisory(GHSA_A, [], state)),
      new RegExp(`${GHSA_A} is ${state}: only a draft or published advisory`),
    );
  }
  await assert.rejects(
    run(advisory(GHSA_B, [])),
    new RegExp(`asked for ${GHSA_A}, GitHub answered ${GHSA_B}`),
  );
  await assert.rejects(
    run({ ghsa_id: GHSA_A, state: "draft" }),
    /has no credits_detailed list/,
  );
  await assert.rejects(
    run(advisory(GHSA_A, [["x", "maybe"]])),
    /unexpected credit state "maybe"/,
  );
  // An advisory GitHub does not show this caller (or that is not ours).
  const deps = world();
  await assert.rejects(
    main([...BASE, "--advisory", GHSA_A, "--draft"], deps),
    /Not Found \(HTTP 404\)/,
  );
  assert.equal(
    deps.spawn.calls.some((c) => c.args[1] === "create"),
    false,
  );
});

test("--thank lines become the prototype paragraph, after the reporters", async (t) => {
  quiet(t);
  const notes = await main(
    [...BASE, "--thank", "@ace (#9), the fix for #5", "--draft"],
    world({
      pulls: { 10: { files: ["src/git/a.py"], body: "Closes #1" } },
      issues: { 1: user("filer") },
      perms: { filer: "read" },
    }),
  );
  assert.ok(
    notes.endsWith(
      [
        THANKS_LEAD_IN,
        "",
        "* @filer (#1)",
        "",
        prototypeLeadIn(1, true),
        "",
        "* @ace (#9), the fix for #5",
        "",
      ].join("\n"),
    ),
    notes,
  );
});

test("the preview lists maintainers' credit notes on the milestone's closed issues", async (t) => {
  const { err } = quiet(t);
  const deps = world({
    milestones: { "v1.9.0": 3, "v2.0.0": 4 },
    milestoneIssues: [
      {
        number: 21,
        author: "maint",
        body: "Harvested from #900, crediting @harvested as its prototype.",
        comments: [
          // Credited, and already given a --thank.
          { author: "maint", body: "Thanks to @thanked for #901." },
          // Not a credit note at all.
          { author: "maint", body: "cc @harvested, any update?" },
          // A community member's own words are not a maintainer's credit.
          { author: "outsider", body: "Credit to @friend please" },
          { author: "github-actions", type: "Bot", body: "credit @botpal" },
          { author: "maint", body: null },
        ],
      },
      {
        number: 20,
        author: "maint",
        // Only maintainers, a quoted mention and a non-account are named.
        body: "Credit: @maint2 and @ghost-typo.\n> credit @quoted",
      },
    ],
    perms: {
      maint: "maintain",
      maint2: "write",
      harvested: "read",
      thanked: "triage",
      outsider: "read",
    },
  });
  await main([...BASE, "--thank", "@Thanked (#901), the fix"], deps);
  const lines = err.slice(err.findIndex((l) => l.startsWith("credit notes")));
  assert.deepEqual(lines.slice(0, 3), [
    "credit notes on v2.0.0's closed issues (each needs a --thank, unless it credits a reporter already listed):",
    `  #21 https://github.com/${REPO}/issues/21: @harvested (NO --thank)`,
    `  #21 https://github.com/${REPO}/issues/21#issuecomment-0: @thanked (--thank given)`,
  ]);
  assert.equal(lines.length, 4);
  // The milestone's number came from its title.
  assert.ok(
    deps.spawn.calls.some((c) => c.args[2]?.includes("issues?milestone=4&")),
  );
});

test("discovery is preview-only, and says so when it finds nothing", async (t) => {
  const { err } = quiet(t);
  await main(BASE, world());
  assert.ok(err.includes("no credit notes on v2.0.0's closed issues"));
  const draft = world();
  await main([...BASE, "--draft"], draft);
  assert.equal(
    draft.spawn.calls.some((c) => c.args.join(" ").includes("milestones")),
    false,
  );
});

test("discovery aborts on a missing milestone or a failed lookup", async (t) => {
  quiet(t);
  await assert.rejects(
    main(BASE, world({ milestones: {} })),
    /no milestone titled v2\.0\.0/,
  );
  const issue = {
    number: 1,
    author: "maint",
    body: "credit @who",
  };
  for (const failOn of ["/milestones?", "issues?milestone=", "/comments"]) {
    await assert.rejects(
      main(
        BASE,
        world({ milestoneIssues: [issue], perms: { maint: "admin" }, failOn }),
      ),
      /rate limit exceeded/,
    );
  }
  // Only a 404 means "not an account"; any other failed permission lookup
  // aborts, as it does for a reporter.
  await assert.rejects(
    main(
      BASE,
      world({
        milestoneIssues: [issue],
        perms: { maint: "admin", who: "superuser" },
      }),
    ),
    /unexpected permission "superuser" for @who/,
  );
});
