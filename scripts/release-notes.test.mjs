// Tests for scripts/release-notes.mjs (#5056): per-server bucketing (one
// server, several, none), sections only for published packages, the
// Repository catch-all dropping no PR, per-section Thanks with every exclusion
// (maintainers by permission, bots, deleted accounts, PRs, other repos), the
// maintainer-only `Credit:` line, keyword parsing, pagination, fail-fast at
// every lookup, and that nothing is created without --draft. Run via
// `npm run test:scripts`.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REPO,
  THANKS_LEAD_IN,
  assembleNotes,
  bucket,
  closingKeywordIssues,
  creditLines,
  dirsTouched,
  formatKnownIssues,
  formatPackages,
  formatThanks,
  main,
  parseGenerated,
  parseNotesArgs,
  registryUrl,
} from "./release-notes.mjs";

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

test("creditLines reads `Credit:` lines only, outside code and quotes", () => {
  assert.deepEqual(
    creditLines(
      [
        "Credit: @alice",
        "credit: @bob, @carol-x",
        "Thanks to @dave for the idea", // a mention is not a credit
        "> Credit: @erin",
        "`Credit: @frank`",
        "```",
        "Credit: @gina",
        "```",
        "  Credit:@hank",
      ].join("\n"),
    ),
    ["alice", "bob", "carol-x", "hank"],
  );
  assert.deepEqual(creditLines(null), []);
});

test("formatThanks orders by issue count, then name case-insensitively", () => {
  const reporters = new Map([
    ["zed", [5]],
    ["Amy", [9]],
    ["many", [1, 2, 3]],
    ["bob", [4]],
  ]);
  assert.equal(
    formatThanks(reporters),
    [
      "### Thanks for helping us improve",
      "",
      THANKS_LEAD_IN,
      "",
      "* @many (#1, #2, #3)",
      "* @Amy (#9)",
      "* @bob (#4)",
      "* @zed (#5)",
    ].join("\n"),
  );
  assert.equal(formatThanks(new Map()), "");
});

test("formatKnownIssues pluralizes and is omitted when empty", () => {
  assert.equal(formatKnownIssues([]), "");
  assert.equal(formatKnownIssues(["one"]), "## Known issue\n\none");
  assert.equal(formatKnownIssues(["a", "b"]), "## Known issues\n\na\n\nb");
});

test("assembleNotes: packages, sections, trailer, ledger, known issues", () => {
  assert.equal(
    assembleNotes({
      packages: "P",
      sections: ["S1", "S2"],
      trailer: "T",
      mergeBranch: "mb",
      ledgerUrl: "https://l",
      knownIssues: ["K"],
    }),
    "P\n\nS1\n\nS2\n\nT\n\nRelease ledger: [mb](https://l)\n\n## Known issue\n\nK\n",
  );
  assert.equal(
    assembleNotes({
      packages: "P",
      sections: [],
      trailer: "",
      mergeBranch: "mb",
      ledgerUrl: "https://l",
      knownIssues: [],
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
  /** @type {Record<number, { files?: string[], body?: string, closing?: number[], pages?: Array<Array<number | object>> }>} */
  pulls = {},
  /** @type {Record<number, { __typename: string, author?: object | null, body?: string, comments?: object[], commentPages?: object[][] }>} */
  issues = {},
  /** @type {Record<string, string>} */
  perms = {},
  /** @type {string | undefined} */
  failOn = undefined,
  compare = "identical",
  releases = ["2026.8.31"],
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
      const issue = issues[n] ?? null;
      let node = issue;
      if (issue?.__typename === "Issue") {
        const pages = issue.commentPages ?? [issue.comments ?? []];
        const hasNextPage = index + 1 < pages.length;
        node = {
          __typename: "Issue",
          author: issue.author,
          body: issue.body ?? "",
          comments: {
            pageInfo: {
              hasNextPage,
              endCursor: hasNextPage ? String(index + 1) : null,
            },
            nodes: pages[index],
          },
        };
      }
      return ok(
        JSON.stringify({ data: { repository: { issueOrPullRequest: node } } }),
      );
    }
    const files = args[2]?.match(/pulls\/(\d+)\/files$/);
    if (files) return ok((pulls[Number(files[1])].files ?? []).join("\n"));
    if (args[1].endsWith("/releases/generate-notes")) return ok(generated);
    if (args[1].includes("/compare/")) return ok(compare);
    if (args[2] === `repos/${REPO}/releases`) return ok(releases.join("\n"));
    const login = args[1].match(/collaborators\/([^/]+)\/permission/)?.[1];
    assert.ok(login, `unexpected gh call: ${joined}`);
    return ok(perms[login]);
  };
  spawn.calls = calls;
  /** @type {string[]} */
  const fetched = [];
  /** @param {string} url */
  const fetch = async (url) => {
    fetched.push(url);
    const name = Object.values(packages).find((p) =>
      url.includes(p.name.replace("/", "%2F")),
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
const said = (/** @type {string} */ login, /** @type {string} */ body) => ({
  author: { login, __typename: "User" },
  body,
});

/** @param {import("node:test").TestContext} t */
function quiet(t) {
  /** @type {string[]} */
  const out = [];
  t.mock.method(console, "error", () => {});
  t.mock.method(process.stdout, "write", (/** @type {string} */ chunk) => {
    out.push(chunk);
    return true;
  });
  return out;
}

/** The text of one `## …` section of the notes. */
function sectionOf(/** @type {string} */ notes, /** @type {string} */ heading) {
  const start = notes.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `no section ${heading}`);
  const next = notes.indexOf("\n## ", start + heading.length);
  return notes.slice(start, next === -1 ? undefined : next);
}

test("notes: per-server sections with per-server Thanks, every PR placed", async (t) => {
  const out = quiet(t);
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
  ]);

  const git = sectionOf(notes, "## mcp-server-git 2.0.0");
  assert.match(git, /change 10 .*\n\* change 11 /);
  assert.match(git, /\* @reporter \(#1, #2\)\n*$/);
  const memory = sectionOf(
    notes,
    "## @modelcontextprotocol/server-memory 1.0.0",
  );
  assert.match(memory, /change 11/);
  assert.doesNotMatch(memory, /change 10/);
  // The same reporter, credited per server with only that server's issues.
  assert.match(memory, /\* @reporter \(#2\)\n*$/);
  const repo = sectionOf(notes, "## Repository");
  assert.match(repo, /change 12[^\n]*\n\* change 13 /);
  assert.match(repo, /\* @docs-person \(#3\)\n\* @reporter \(#4\)/);

  assert.match(
    notes,
    /\*\*Full Changelog\*\*: https:\/\/example\/compare\n\nRelease ledger: \[v2\/chore\/1-release-v2\.0\.0\]\(https:\/\/l\.example\/x\)\n$/,
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

test("a maintainer's `Credit:` line credits an outside PR's author; anyone else's does not", async (t) => {
  quiet(t);
  const notes = await main(
    BASE,
    world({
      pulls: {
        10: {
          files: ["src/git/a.py"],
          body: "Closes #1\nCloses #2\nCloses #3",
        },
      },
      issues: {
        // Filed by a maintainer from a closed outside PR, crediting its author.
        1: user("maint", { body: "Prototype: #900.\n\nCredit: @pr-author" }),
        // Credited later, in a maintainer's comment, across comment pages.
        2: user("reporter", {
          commentPages: [
            [said("someone", "+1")],
            [said("maint", "Credit: @other-author, @maint")],
          ],
        }),
        // A non-maintainer cannot add names.
        3: user("reporter", {
          body: "Credit: @sneaky",
          comments: [said("reporter", "Credit: @sneaky2")],
        }),
      },
      perms: {
        maint: "admin",
        reporter: "read",
        someone: "read",
        "pr-author": "read",
        "other-author": "none",
      },
    }),
  );
  const git = sectionOf(notes, "## mcp-server-git 2.0.0");
  assert.match(git, /\* @reporter \(#2, #3\)/);
  assert.match(git, /\* @other-author \(#2\)/);
  assert.match(git, /\* @pr-author \(#1\)/);
  assert.doesNotMatch(git, /@maint|@sneaky|@someone/);
});

test("the Thanks subsection is left out when no community reporter remains", async (t) => {
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
