#!/usr/bin/env node
// Assemble a milestone release's notes, per server, and optionally create the
// draft GitHub Release (#5056) —
// `npm run release:notes -- --milestone vX.Y.Z --merge-sha <sha> --merge-branch <b> --ledger-url <u> [...]`.
// It replaces the shell recipe the release skill's step 5a carried, and is
// modeled on the MCP Inspector's helper (modelcontextprotocol/inspector#2550),
// adapted to a repository that publishes seven packages at seven versions.
//
// A reader of a release wants to know what changed in the server they use, so
// the notes are laid out per PACKAGE rather than as one flat list:
//
//   ## Packages                      every package, its version, and whether
//                                    this release publishes it (registry check)
//   ## <package> <version>           one per PUBLISHED package, with its
//     ### What's Changed             PRs
//   ## Repository                    every PR left over (CI, docs, skills, a
//                                    server whose version did not change), so
//                                    no PR in the generated list is dropped
//   ## New Contributors / Full Changelog   GitHub's own trailer, verbatim
//   Release ledger: [<branch>](<url>)
//   ## Known issues                  only when passed in: a maintainer's call
//   ## Thanks for helping us improve one release-wide list of the community
//                                    members whose issues the PRs close, laid
//                                    out as the Inspector's release notes are
//
// The PR list is GitHub's generated one (`releases/generate-notes`, what the
// UI's button uses) from the latest PUBLISHED Release to the merge commit. A
// PR is bucketed by the files it changes: `src/<dir>/` is that directory's
// package. Thanks credits each closed issue's author; maintainers
// (admin/maintain/write), bots and deleted accounts are never credited.
// GitHub adds everyone `@`-mentioned in a release body to its Contributors
// strip, so that section is what puts the reporters there.
//
// FAIL FAST. Every `gh` call and registry request is checked and a failure
// throws before anything is created: a permission lookup that errors must
// never read as "community" (that could credit a maintainer), a rate-limited
// lookup must never drop a PR or a reporter, and a registry that does not
// answer says nothing about what this release publishes. A permission value or
// a generated-notes line outside the known set throws for the same reason.
//
// The default run is a PREVIEW that prints the notes and creates nothing.
// `--draft` creates a draft Release at the merge SHA under the milestone tag.
// There is deliberately no `--publish`: publishing starts `release.yml`, so it
// stays a maintainer's act on the draft (the release skill, step 5b).

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readProject } from "./prepare-python-release.mjs";

export const REPO = "modelcontextprotocol/servers";
const [OWNER, NAME] = REPO.split("/");

// What `collaborators/{user}/permission` reports in its `permission` field.
// A public repo reports `read` for anyone without a role, so a community
// member is `read` (or `triage`/`none`), and a maintainer is anyone above it.
const MAINTAINER_PERMISSIONS = new Set(["admin", "maintain", "write"]);
const COMMUNITY_PERMISSIONS = new Set(["triage", "read", "none"]);

export const THANKS_LEAD_IN =
  "This release addresses issues reported by these community members. Thank you for taking the time to file them:";
export const REPOSITORY_HEADING = "## Repository";

/**
 * @typedef {{ dir: string, name: string, version: string, registry: "npm" | "PyPI" }} Package
 * @typedef {Package & { published: boolean }} CheckedPackage
 * @typedef {{ pr: number, line: string }} Entry
 * @typedef {{ heading: string, entries: Entry[] }} Section
 * @typedef {(cmd: string, args: string[], options: object) => { status: number | null, stdout?: string, stderr?: string, error?: Error }} Spawn
 */

/**
 * @param {string[]} argv
 */
export function parseNotesArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      milestone: { type: "string" },
      "merge-sha": { type: "string" },
      "merge-branch": { type: "string" },
      "ledger-url": { type: "string" },
      "known-issue": { type: "string", multiple: true },
      "previous-tag": { type: "string" },
      draft: { type: "boolean" },
    },
  });
  const milestone = values.milestone;
  const mergeSha = values["merge-sha"];
  const mergeBranch = values["merge-branch"];
  const ledgerUrl = values["ledger-url"];
  if (!milestone || !mergeSha || !mergeBranch || !ledgerUrl) {
    throw new Error(
      "--milestone, --merge-sha, --merge-branch and --ledger-url are all required",
    );
  }
  // The tag is the milestone's name; a typo here becomes a tag on the release.
  if (!/^v\d+\.\d+\.\d+$/.test(milestone)) {
    throw new Error(`--milestone "${milestone}" is not vX.Y.Z`);
  }
  // A full SHA, never a branch name: `main` moves, and the Release must land
  // on the commit the ledger verified.
  if (!/^[0-9a-f]{40}$/.test(mergeSha)) {
    throw new Error(`--merge-sha "${mergeSha}" is not a full 40-hex SHA`);
  }
  if (!/^https:\/\/\S+$/.test(ledgerUrl)) {
    throw new Error(`--ledger-url "${ledgerUrl}" is not an https URL`);
  }
  // A Release created here always starts from the latest published Release;
  // an override (a typo, a stale value) would publish the wrong range of
  // changes and credits, so it is a preview-only knob.
  if (values.draft && values["previous-tag"] !== undefined) {
    throw new Error("--previous-tag is preview-only");
  }
  return {
    milestone,
    mergeSha,
    mergeBranch,
    ledgerUrl,
    knownIssues: values["known-issue"] ?? [],
    previousTag: values["previous-tag"],
    mode: values.draft ? "draft" : "preview",
  };
}

/**
 * @param {Spawn} spawn
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} [input]
 */
function run(spawn, cmd, args, input) {
  const result = spawn(cmd, args, { encoding: "utf8", input });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed: ${(result.stderr ?? "").trim()}`,
    );
  }
  return (result.stdout ?? "").trim();
}

/**
 * @param {Spawn} spawn
 * @param {string} query
 * @param {Record<string, string | number>} variables
 */
function graphql(spawn, query, variables) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    // -F types a number as Int; -f keeps a cursor or an expression a String.
    args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
  }
  const response = JSON.parse(run(spawn, "gh", args));
  if (response.errors?.length) {
    throw new Error(`gh api graphql: ${JSON.stringify(response.errors)}`);
  }
  return response.data;
}

const MANIFEST_QUERY = `query($expr:String!){repository(owner:"${OWNER}",name:"${NAME}"){object(expression:$expr){... on Tree{entries{name type object{... on Tree{entries{name object{... on Blob{text}}}}}}}}}}`;

/**
 * Every package under `src/` at `sha`, read from GitHub rather than a
 * checkout, so the table describes the commit being released whatever is on
 * disk. The same identities `release-manifest.mjs` reads, in directory order,
 * npm before PyPI.
 *
 * @param {Spawn} spawn
 * @param {string} sha
 * @returns {Package[]}
 */
export function packagesAt(spawn, sha) {
  const tree = graphql(spawn, MANIFEST_QUERY, { expr: `${sha}:src` }).repository
    .object;
  if (!tree?.entries) {
    throw new Error(`no src/ tree at ${sha}`);
  }
  /** @type {Package[]} */
  const npm = [];
  /** @type {Package[]} */
  const pypi = [];
  const dirs = tree.entries
    .filter((/** @type {{ type: string }} */ e) => e.type === "tree")
    .sort(
      (/** @type {{ name: string }} */ a, /** @type {{ name: string }} */ b) =>
        a.name.localeCompare(b.name, "en"),
    );
  for (const dir of dirs) {
    for (const file of dir.object.entries) {
      if (file.name !== "package.json" && file.name !== "pyproject.toml")
        continue;
      const text = file.object?.text;
      if (typeof text !== "string") {
        throw new Error(`src/${dir.name}/${file.name} has no text at ${sha}`);
      }
      const { name, version } =
        file.name === "package.json" ? JSON.parse(text) : readProject(text);
      if (typeof name !== "string" || name === "")
        throw new Error(`src/${dir.name}/${file.name} has no package name`);
      if (typeof version !== "string" || version === "")
        throw new Error(`src/${dir.name}/${file.name} has no version`);
      (file.name === "package.json" ? npm : pypi).push({
        dir: dir.name,
        name,
        version,
        registry: file.name === "package.json" ? "npm" : "PyPI",
      });
    }
  }
  if (npm.length + pypi.length === 0) {
    throw new Error(`no package manifests under src/ at ${sha}`);
  }
  return [...npm, ...pypi];
}

/**
 * The registry URL that answers 200 when this exact version is already
 * published, and 404 when it is not.
 *
 * @param {Package} pkg
 */
export function registryUrl(pkg) {
  return pkg.registry === "npm"
    ? `https://registry.npmjs.org/${pkg.name.replace("/", "%2F")}/${pkg.version}`
    : `https://pypi.org/pypi/${pkg.name}/${pkg.version}/json`;
}

/**
 * Whether this release publishes each package: a version the registry does
 * not have yet is published, one it has is skipped. Any other answer aborts.
 *
 * @param {Package[]} packages
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<CheckedPackage[]>}
 */
export async function checkRegistries(packages, fetchImpl) {
  /** @type {CheckedPackage[]} */
  const checked = [];
  for (const pkg of packages) {
    const url = registryUrl(pkg);
    const response = await fetchImpl(url, { method: "GET" });
    if (response.status !== 200 && response.status !== 404) {
      throw new Error(
        `${pkg.registry} answered HTTP ${response.status} for ${pkg.name}@${pkg.version} (${url}): UNKNOWN, not guessing`,
      );
    }
    checked.push({ ...pkg, published: response.status === 404 });
  }
  return checked;
}

/** @param {CheckedPackage[]} packages */
export function formatPackages(packages) {
  const rows = packages.map(
    (p) =>
      `| \`${p.name}\` | \`${p.version}\` | ${p.registry} | ${p.published ? "**published**" : "unchanged"} |`,
  );
  return [
    "## Packages",
    "",
    "| Package | Version | Registry | In this release |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

const PR_LINE = new RegExp(
  `^\\* .* in https://github\\.com/${REPO}/pull/(\\d+)\\s*$`,
);

/**
 * Split GitHub's generated body into its PR entries and its trailer (the
 * `## New Contributors` block and the `**Full Changelog**` line, kept
 * verbatim). Headings, blank lines and HTML comments are dropped; any other
 * line throws, so a format change on GitHub's side cannot silently drop a PR.
 *
 * @param {string} body
 * @returns {{ entries: Entry[], trailer: string }}
 */
export function parseGenerated(body) {
  /** @type {Entry[]} */
  const entries = [];
  const seen = new Set();
  /** @type {string[]} */
  const contributors = [];
  let changelog = "";
  let inContributors = false;
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (/^#{2,3} /.test(line)) {
      inContributors = line === "## New Contributors";
      continue;
    }
    if (line === "" || /^<!--.*-->$/.test(line)) continue;
    if (line.startsWith("**Full Changelog**")) {
      changelog = line;
      continue;
    }
    if (inContributors && line.startsWith("* ")) {
      contributors.push(line);
      continue;
    }
    const match = PR_LINE.exec(line);
    if (!match) {
      throw new Error(`unrecognized line in the generated notes: ${line}`);
    }
    const pr = Number(match[1]);
    if (seen.has(pr)) continue;
    seen.add(pr);
    entries.push({ pr, line });
  }
  const trailer = [
    contributors.length
      ? `## New Contributors\n\n${contributors.join("\n")}`
      : "",
    changelog,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { entries, trailer };
}

/**
 * The package directories a PR's files fall under, of those given.
 *
 * @param {string[]} files
 * @param {Set<string>} dirs
 * @returns {string[]}
 */
export function dirsTouched(files, dirs) {
  const touched = new Set();
  for (const file of files) {
    const match = /^src\/([^/]+)\//.exec(file);
    if (match && dirs.has(match[1])) touched.add(match[1]);
  }
  return [...touched].sort();
}

/**
 * @param {Spawn} spawn
 * @param {number} pr
 * @returns {string[]}
 */
export function filesOf(spawn, pr) {
  const out = run(spawn, "gh", [
    "api",
    "--paginate",
    `repos/${REPO}/pulls/${pr}/files`,
    "--jq",
    // A rename's source is in previous_filename: a file moved out of a
    // server's directory still changed that server.
    ".[] | .filename, (.previous_filename // empty)",
  ]);
  return out === "" ? [] : out.split("\n");
}

/**
 * One section per published package, in table order, then Repository with
 * every entry no published section took. Each entry lands somewhere.
 *
 * @param {Entry[]} entries
 * @param {CheckedPackage[]} packages
 * @param {Map<number, string[]>} touched PR → package directories it changes
 * @returns {Section[]}
 */
export function bucket(entries, packages, touched) {
  const published = packages.filter((p) => p.published);
  /** @type {Section[]} */
  const sections = published.map((p) => ({
    heading: `## ${p.name} ${p.version}`,
    entries: entries.filter((e) => (touched.get(e.pr) ?? []).includes(p.dir)),
  }));
  const placed = new Set(sections.flatMap((s) => s.entries.map((e) => e.pr)));
  const rest = entries.filter((e) => !placed.has(e.pr));
  if (rest.length)
    sections.push({ heading: REPOSITORY_HEADING, entries: rest });
  return sections;
}

/**
 * Issue numbers a PR body closes by keyword — GitHub's nine closing keywords,
 * with its optional colon. A bare `#N` only, so a cross-repo `owner/repo#N`
 * is not mistaken for one of ours.
 *
 * @param {string | null | undefined} body
 */
export function closingKeywordIssues(body) {
  const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)\b/gi;
  return [...proseOf(body ?? "").matchAll(pattern)].map((m) => Number(m[1]));
}

/**
 * The text with every place GitHub ignores a closing keyword blanked out:
 * HTML comments (PR templates leave `<!-- Closes #… -->` behind), fenced
 * code, inline code and blockquotes. Four-space indented code is left alone:
 * telling it from an indented list continuation needs a full Markdown parser,
 * and masking a real `Closes` line would lose a credit. A keyword quoted in
 * any of those does not close the issue, so it must not credit its author either.
 *
 * @param {string} body
 */
export function proseOf(body) {
  return (
    body
      .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
      // A closing fence is the opening fence's character, at least as many,
      // and nothing after it but spaces or tabs; anything else is content.
      .replace(
        /^ {0,3}((`|~)\2{2,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1\2*[ \t]*$|(?![\s\S]))/gm,
        " ",
      )
      .replace(/(`+)[\s\S]*?\1/g, " ")
      .replace(/^ {0,3}>.*$/gm, " ")
  );
}

const CLOSING_QUERY = `query($n:Int!,$after:String){repository(owner:"${OWNER}",name:"${NAME}"){pullRequest(number:$n){body closingIssuesReferences(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{number repository{nameWithOwner}}}}}}`;

/**
 * Every issue of this repo one PR closes: manual links (paginated) + body
 * keywords.
 *
 * @param {Spawn} spawn
 * @param {number} pr
 * @returns {Set<number>}
 */
export function issuesClosedBy(spawn, pr) {
  const numbers = new Set();
  let body;
  let after;
  for (;;) {
    /** @type {Record<string, string | number>} */
    const variables = after === undefined ? { n: pr } : { n: pr, after };
    const pull = graphql(spawn, CLOSING_QUERY, variables).repository
      .pullRequest;
    if (!pull) {
      throw new Error(`PR #${pr} not found`);
    }
    body ??= pull.body;
    const refs = pull.closingIssuesReferences;
    for (const node of refs.nodes) {
      if (node.repository.nameWithOwner === REPO) numbers.add(node.number);
    }
    if (!refs.pageInfo.hasNextPage) break;
    after = refs.pageInfo.endCursor;
  }
  for (const n of closingKeywordIssues(body)) numbers.add(n);
  return numbers;
}

const AUTHOR_QUERY = `query($n:Int!){repository(owner:"${OWNER}",name:"${NAME}"){issueOrPullRequest(number:$n){__typename ... on Issue{author{login __typename}}}}}`;

/**
 * The login to credit for issue `n`, or null when there is nobody to credit:
 * the number is a PR rather than an issue, or the author is a bot or a
 * deleted account.
 *
 * @param {Spawn} spawn
 * @param {number} n
 * @returns {string | null}
 */
export function creditableAuthor(spawn, n) {
  const node = graphql(spawn, AUTHOR_QUERY, { n }).repository
    .issueOrPullRequest;
  if (!node) {
    throw new Error(`#${n} not found`);
  }
  if (node.__typename !== "Issue") return null;
  return node.author?.__typename === "User" ? node.author.login : null;
}

/**
 * True for a maintainer, false for a community member; throws otherwise.
 *
 * @param {Spawn} spawn
 * @param {string} login
 */
export function isMaintainer(spawn, login) {
  const permission = run(spawn, "gh", [
    "api",
    `repos/${REPO}/collaborators/${login}/permission`,
    "--jq",
    ".permission",
  ]);
  if (MAINTAINER_PERMISSIONS.has(permission)) return true;
  if (COMMUNITY_PERMISSIONS.has(permission)) return false;
  throw new Error(`unexpected permission "${permission}" for @${login}`);
}

/**
 * Community reporter → the issues of theirs the listed PRs close.
 *
 * @param {Spawn} spawn
 * @param {number[]} pulls
 * @returns {Map<string, number[]>}
 */
export function collectReporters(spawn, pulls) {
  const issues = new Set();
  for (const pr of pulls) {
    for (const n of issuesClosedBy(spawn, pr)) issues.add(n);
  }
  /** @type {Map<string, number[]>} */
  const reporters = new Map();
  /** @type {Map<string, boolean>} */
  const maintainer = new Map();
  for (const n of [...issues].sort((a, b) => a - b)) {
    const login = creditableAuthor(spawn, n);
    if (login === null) continue;
    if (!maintainer.has(login)) {
      maintainer.set(login, isMaintainer(spawn, login));
    }
    if (maintainer.get(login)) continue;
    const list = reporters.get(login) ?? [];
    list.push(n);
    reporters.set(login, list);
  }
  return reporters;
}

/**
 * One line per person, most issues first, then by name; "" when nobody.
 *
 * @param {Map<string, number[]>} reporters
 */
export function formatThanks(reporters) {
  if (reporters.size === 0) return "";
  const lines = [...reporters]
    .sort(
      ([a, ia], [b, ib]) =>
        ib.length - ia.length ||
        a.localeCompare(b, "en", { sensitivity: "base" }),
    )
    .map(
      ([login, nums]) => `* @${login} (${nums.map((n) => `#${n}`).join(", ")})`,
    );
  return `## Thanks for helping us improve\n\n${THANKS_LEAD_IN}\n\n${lines.join("\n")}`;
}

/** @param {Section} section */
export function formatSection(section) {
  const changed = section.entries.length
    ? section.entries.map((e) => e.line).join("\n")
    : "No pull request in this range changed this package's directory.";
  return `${section.heading}\n\n### What's Changed\n\n${changed}`;
}

/** @param {string[]} knownIssues */
export function formatKnownIssues(knownIssues) {
  if (knownIssues.length === 0) return "";
  const heading = knownIssues.length === 1 ? "Known issue" : "Known issues";
  return `## ${heading}\n\n${knownIssues.join("\n\n")}`;
}

/**
 * @param {{ packages: string, sections: string[], trailer: string, mergeBranch: string, ledgerUrl: string, knownIssues: string[], thanks: string }} parts
 */
export function assembleNotes({
  packages,
  sections,
  trailer,
  mergeBranch,
  ledgerUrl,
  knownIssues,
  thanks,
}) {
  return (
    [
      packages,
      ...sections,
      trailer,
      `Release ledger: [${mergeBranch}](${ledgerUrl})`,
      formatKnownIssues(knownIssues),
      thanks,
    ]
      .filter(Boolean)
      .join("\n\n") + "\n"
  );
}

/**
 * @param {string[]} [argv]
 * @param {{ spawn?: Spawn, fetch?: typeof fetch }} [deps]
 * @returns {Promise<string>} the notes
 */
export async function main(
  argv = process.argv.slice(2),
  { spawn = spawnSync, fetch: fetchImpl = globalThis.fetch } = {},
) {
  const args = parseNotesArgs(argv);

  // When the tag already exists, GitHub ignores target_commitish (and
  // `--target`) in favor of the tag's commit, so the generated range and the
  // draft could describe a commit other than --merge-sha. Refuse in every
  // mode, before anything is generated.
  const existing = run(spawn, "gh", [
    "api",
    `repos/${REPO}/git/matching-refs/tags/${args.milestone}`,
    "--jq",
    ".[].ref",
  ]).split("\n");
  if (existing.includes(`refs/tags/${args.milestone}`)) {
    throw new Error(
      `tag ${args.milestone} already exists: GitHub would use its commit, not ${args.mergeSha}`,
    );
  }

  if (args.mode === "draft") {
    // release.yml only checks that the tagged commit is on main; refuse here
    // first, before a draft exists that someone could publish.
    const status = run(spawn, "gh", [
      "api",
      `repos/${REPO}/compare/main...${args.mergeSha}`,
      "--jq",
      ".status",
    ]);
    if (status !== "identical" && status !== "behind") {
      throw new Error(
        `${args.mergeSha} is not on main (compare status "${status}"): merge the milestone PR first`,
      );
    }
    // A second draft under the same tag is one more draft to publish by
    // mistake: edit the existing one, or delete it, instead.
    const tags = run(spawn, "gh", [
      "api",
      "--paginate",
      `repos/${REPO}/releases`,
      "--jq",
      ".[].tag_name",
    ]).split("\n");
    if (tags.includes(args.milestone)) {
      throw new Error(
        `a Release (or draft) tagged ${args.milestone} already exists`,
      );
    }
  }

  // The previous release is the latest PUBLISHED Release, asked of GitHub
  // rather than sorted out of the tag list: this repo's tags mix date stamps,
  // milestone names and older per-package tags, and no sort orders them.
  const previousTag =
    args.previousTag ??
    run(spawn, "gh", [
      "release",
      "view",
      "--repo",
      REPO,
      "--json",
      "tagName",
      "--jq",
      ".tagName",
    ]);
  if (!previousTag) {
    throw new Error("no previous published Release found");
  }
  console.error(`release notes: ${previousTag} → ${args.milestone}`);

  const packages = await checkRegistries(
    packagesAt(spawn, args.mergeSha),
    fetchImpl,
  );

  const { entries, trailer } = parseGenerated(
    run(spawn, "gh", [
      "api",
      `repos/${REPO}/releases/generate-notes`,
      "-f",
      `tag_name=${args.milestone}`,
      "-f",
      `target_commitish=${args.mergeSha}`,
      "-f",
      `previous_tag_name=${previousTag}`,
      "--jq",
      ".body",
    ]),
  );
  console.error(`bucketing ${entries.length} PRs by server`);
  const dirs = new Set(packages.map((p) => p.dir));
  /** @type {Map<number, string[]>} */
  const touched = new Map();
  for (const { pr } of entries) {
    touched.set(pr, dirsTouched(filesOf(spawn, pr), dirs));
  }

  const sections = bucket(entries, packages, touched).map(formatSection);
  console.error(
    `crediting reporters of issues closed by ${entries.length} PRs`,
  );
  const thanks = formatThanks(
    collectReporters(
      spawn,
      entries.map((e) => e.pr),
    ),
  );
  const notes = assembleNotes({
    packages: formatPackages(packages),
    sections,
    trailer,
    mergeBranch: args.mergeBranch,
    ledgerUrl: args.ledgerUrl,
    knownIssues: args.knownIssues,
    thanks,
  });

  if (args.mode === "preview") {
    process.stdout.write(notes);
    console.error("preview only — nothing created; re-run with --draft");
    return notes;
  }
  const url = run(
    spawn,
    "gh",
    [
      "release",
      "create",
      args.milestone,
      "--repo",
      REPO,
      "--target",
      args.mergeSha,
      "--title",
      args.milestone,
      "--notes-file",
      "-",
      "--draft",
    ],
    notes,
  );
  console.error(
    `draft created: ${url} — review it, then publish it (this starts release.yml)`,
  );
  return notes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((/** @type {Error} */ error) => {
    console.error(`release-notes: ${error.message}`);
    process.exitCode = 1;
  });
