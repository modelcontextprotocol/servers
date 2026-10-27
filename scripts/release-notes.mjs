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
//   Release ledger: [<branch>](<url>)   right under the table, so what was
//                                    published and the evidence behind it are
//                                    read together, not below every PR list
//   ## <package> <version>           one per PUBLISHED package, with its
//     ### What's Changed             PRs
//   ## Repository                    every PR left over (CI, docs, skills, a
//                                    server whose version did not change), so
//                                    no PR in the generated list is dropped
//   ## New Contributors / Full Changelog   GitHub's own trailer, verbatim
//   ## Known issues                  only when passed in: a maintainer's call
//   ## Thanks for helping us improve one release-wide list of the community
//                                    members whose issues the PRs close and
//                                    whose advisories it fixes, laid out as
//                                    the Inspector's release notes are, then
//                                    the contributors whose prototypes ship
//
// The PR list is GitHub's generated one (`releases/generate-notes`, what the
// UI's button uses) from the latest PUBLISHED Release to the merge commit. A
// PR is bucketed by the files it changes: `src/<dir>/` is that directory's
// package. Thanks credits each closed issue's author; maintainers
// (admin/maintain/write), bots and deleted accounts are never credited.
// GitHub adds everyone `@`-mentioned in a release body to its Contributors
// strip, so that section is what puts the reporters there.
//
// Two kinds of credit never come from an issue's author, and were once pasted
// in by hand, which is how v2.0.0 published without its Thanks (#5250):
//
// * An advisory's fix ships from its private fork with no public issue, so
//   each `--advisory GHSA-…` is read for its credits (a draft works: notes are
//   drafted before advisories publish). Declined credits, bots and
//   maintainers are dropped; a credit still pending acceptance is listed and
//   flagged, since the reporter may yet decline it.
// * An outside PR is closed and its author credited on an issue (Harvest), so
//   each `--thank "@login (#ref), <what>"` is a line of the prototype
//   paragraph. Which issues carry such a credit is a reading, not a lookup,
//   so the preview lists every credit note a maintainer left on the
//   milestone's closed issues that names a non-maintainer, marking those no
//   `--thank` names yet.
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
export const ADVISORY_LEAD_IN =
  "This release addresses vulnerabilities reported by these community members. Thank you for taking the time to report them:";
export const MIXED_LEAD_IN =
  "This release addresses issues and vulnerabilities reported by these community members. Thank you for taking the time to report them:";
const POLICY_LINK = `[issues, not pull requests](https://github.com/${REPO}/blob/v2/main/CONTRIBUTING.md)`;
export const REPOSITORY_HEADING = "## Repository";

// An advisory id as GitHub mints it, and the advisory states a fix can ship
// from: a triage advisory has not been accepted, and a closed or withdrawn one
// is not a vulnerability this release fixes.
const GHSA_ID = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/;
const SHIPPABLE_ADVISORY_STATES = new Set(["draft", "published"]);
// A credit note a maintainer leaves on an issue: Harvest's "credits its
// author", "Credit for the release notes: …", "Thanks to @x".
const CREDIT_NOTE = /\b(?:credit(?:s|ed|ing)?|thanks to|thank you to)\b/i;

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
      advisory: { type: "string", multiple: true },
      thank: { type: "string", multiple: true },
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
  const advisories = [...new Set(values.advisory ?? [])];
  for (const id of advisories) {
    if (!GHSA_ID.test(id)) {
      throw new Error(`--advisory "${id}" is not a GHSA-xxxx-xxxx-xxxx id`);
    }
  }
  const thanks = values.thank ?? [];
  for (const line of thanks) {
    // One bullet, naming whom it credits first, so the Contributors strip and
    // the discovery check both find them.
    if (!/^@[A-Za-z0-9-]+(?![\w/-])[^\n]*$/.test(line)) {
      throw new Error(
        `--thank "${line}" is not one line starting with @login, as "@login (#ref), <what>"`,
      );
    }
  }
  return {
    milestone,
    mergeSha,
    mergeBranch,
    ledgerUrl,
    knownIssues: values["known-issue"] ?? [],
    advisories,
    thanks,
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
    ? `https://registry.npmjs.org/${pkg.name.replaceAll("/", "%2F")}/${pkg.version}`
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
    if (line === "" || (line.startsWith("<!--") && line.endsWith("-->")))
      continue;
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
 * `isMaintainer`, asked once per login per run, whichever lookup asks first.
 *
 * @param {Spawn} spawn
 * @param {Map<string, boolean>} cache lowercased login → maintainer
 * @param {string} login
 * @returns {boolean}
 */
function maintainerCached(spawn, cache, login) {
  const key = login.toLowerCase();
  let maintainer = cache.get(key);
  if (maintainer === undefined) {
    maintainer = isMaintainer(spawn, login);
    cache.set(key, maintainer);
  }
  return maintainer;
}

/**
 * Community reporter → the issues of theirs the listed PRs close.
 *
 * @param {Spawn} spawn
 * @param {number[]} pulls
 * @param {Map<string, boolean>} [maintainer] shared permission cache
 * @returns {Map<string, number[]>}
 */
export function collectReporters(spawn, pulls, maintainer = new Map()) {
  const issues = new Set();
  for (const pr of pulls) {
    for (const n of issuesClosedBy(spawn, pr)) issues.add(n);
  }
  /** @type {Map<string, number[]>} */
  const reporters = new Map();
  for (const n of [...issues].sort((a, b) => a - b)) {
    const login = creditableAuthor(spawn, n);
    if (login === null) continue;
    if (maintainerCached(spawn, maintainer, login)) continue;
    const list = reporters.get(login) ?? [];
    list.push(n);
    reporters.set(login, list);
  }
  return reporters;
}

/**
 * Community member → the advisories that credit them, in the order given,
 * plus each credit still pending acceptance. The advisory endpoint answers
 * for a draft too, for anyone who can read it, which is whoever drafts the
 * notes.
 *
 * @param {Spawn} spawn
 * @param {string[]} ids
 * @param {Map<string, boolean>} [maintainer] shared permission cache
 * @returns {{ credits: Map<string, string[]>, pending: string[] }}
 */
export function collectAdvisoryCredits(spawn, ids, maintainer = new Map()) {
  /** @type {Map<string, string[]>} */
  const credits = new Map();
  /** @type {string[]} */
  const pending = [];
  for (const id of ids) {
    const advisory = JSON.parse(
      run(spawn, "gh", ["api", `repos/${REPO}/security-advisories/${id}`]),
    );
    if (advisory.ghsa_id !== id) {
      throw new Error(`asked for ${id}, GitHub answered ${advisory.ghsa_id}`);
    }
    if (!SHIPPABLE_ADVISORY_STATES.has(advisory.state)) {
      throw new Error(
        `${id} is ${advisory.state}: only a draft or published advisory has a fix to credit`,
      );
    }
    if (!Array.isArray(advisory.credits_detailed)) {
      throw new Error(`${id} has no credits_detailed list`);
    }
    for (const credit of advisory.credits_detailed) {
      if (credit.state === "declined") continue;
      if (credit.state !== "accepted" && credit.state !== "pending") {
        throw new Error(`unexpected credit state "${credit.state}" on ${id}`);
      }
      const login = credit.user?.login;
      if (credit.user?.type !== "User" || typeof login !== "string") continue;
      if (maintainerCached(spawn, maintainer, login)) continue;
      if (credit.state === "pending") pending.push(`@${login} on ${id}`);
      const list = credits.get(login) ?? [];
      if (!list.includes(id)) list.push(id);
      credits.set(login, list);
    }
  }
  return { credits, pending };
}

/**
 * The lead-in to the prototype paragraph, worded for one contributor or
 * several, and as a continuation when a reporter list comes before it.
 *
 * @param {number} count
 * @param {boolean} following
 */
export function prototypeLeadIn(count, following) {
  return count === 1
    ? `${following ? "And to this contributor" : "Thank you to this contributor"}, whose pull request prototyped a change that ships in this release. Under the repository's ${POLICY_LINK} policy the PR was closed and the change rebuilt by the maintainers, crediting its author on the issue:`
    : `${following ? "And to these contributors" : "Thank you to these contributors"}, whose pull requests prototyped changes that ship in this release. Under the repository's ${POLICY_LINK} policy their PRs were closed and the changes rebuilt by the maintainers, crediting them on the issue:`;
}

/**
 * The Thanks section: reporters of issues and advisories, one line per
 * person with their issues then their advisories, most first, then by name;
 * then the prototype paragraph, one line per `--thank`. "" when nobody.
 *
 * @param {{ reporters?: Map<string, number[]>, advisories?: Map<string, string[]>, thanks?: string[] }} credits
 */
export function formatThanks({
  reporters = new Map(),
  advisories = new Map(),
  thanks = [],
}) {
  /** @type {Map<string, string[]>} */
  const people = new Map();
  for (const [login, nums] of reporters) {
    people.set(
      login,
      nums.map((n) => `#${n}`),
    );
  }
  for (const [login, ids] of advisories) {
    people.set(login, [...(people.get(login) ?? []), ...ids]);
  }
  const parts = [];
  if (people.size) {
    const leadIn =
      reporters.size && advisories.size
        ? MIXED_LEAD_IN
        : advisories.size
          ? ADVISORY_LEAD_IN
          : THANKS_LEAD_IN;
    const lines = [...people]
      .sort(
        ([a, ra], [b, rb]) =>
          rb.length - ra.length ||
          a.localeCompare(b, "en", { sensitivity: "base" }),
      )
      .map(([login, refs]) => `* @${login} (${refs.join(", ")})`);
    parts.push(leadIn, lines.join("\n"));
  }
  if (thanks.length) {
    parts.push(
      prototypeLeadIn(thanks.length, people.size > 0),
      thanks.map((line) => `* ${line}`).join("\n"),
    );
  }
  if (parts.length === 0) return "";
  return ["## Thanks for helping us improve", ...parts].join("\n\n");
}

/**
 * The `@login`s a text names in prose: not in code, a quote or an HTML
 * comment (see `proseOf`), not an email address, and not a scoped package
 * name such as `@modelcontextprotocol/server-memory`.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function mentionsOf(text) {
  const pattern =
    /(?<![\w@./-])@([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})(?![\w/-])/g;
  return [...new Set([...proseOf(text).matchAll(pattern)].map((m) => m[1]))];
}

/** @param {string} out one JSON value per line, as `gh --jq` prints them */
function jsonLines(out) {
  return out === "" ? [] : out.split("\n").map((line) => JSON.parse(line));
}

/**
 * Every credit note a maintainer left on the milestone's closed issues (the
 * issue body or a comment) and the non-maintainers it names: what the person
 * drafting the notes reads to decide each `--thank`. A mention that is not an
 * account (a typo, a team) names nobody, so its 404 is skipped; any other
 * failure aborts, as everywhere else.
 *
 * @param {Spawn} spawn
 * @param {string} milestone
 * @param {Map<string, boolean>} [maintainer] shared permission cache
 * @returns {Array<{ issue: number, url: string, logins: string[] }>}
 */
export function discoverCredits(spawn, milestone, maintainer = new Map()) {
  const number = run(spawn, "gh", [
    "api",
    "--paginate",
    `repos/${REPO}/milestones?state=all&per_page=100`,
    "--jq",
    `.[] | select(.title == ${JSON.stringify(milestone)}) | .number`,
  ]);
  if (!/^\d+$/.test(number)) {
    throw new Error(`no milestone titled ${milestone}`);
  }
  /** @type {Array<{ number: number, url: string, body: string | null, author: string, type: string }>} */
  const issues = jsonLines(
    run(spawn, "gh", [
      "api",
      "--paginate",
      `repos/${REPO}/issues?milestone=${number}&state=closed&per_page=100`,
      "--jq",
      ".[] | select(.pull_request == null) | {number, url: .html_url, body, author: .user.login, type: .user.type}",
    ]),
  ).sort((a, b) => a.number - b.number);
  /** @param {string} login */
  const community = (login) => {
    try {
      return !maintainerCached(spawn, maintainer, login);
    } catch (error) {
      if (/HTTP 404/.test(/** @type {Error} */ (error).message)) return false;
      throw error;
    }
  };
  const notes = [];
  for (const issue of issues) {
    /** @type {Array<{ url: string, body: string | null, author: string, type: string }>} */
    const comments = jsonLines(
      run(spawn, "gh", [
        "api",
        "--paginate",
        `repos/${REPO}/issues/${issue.number}/comments?per_page=100`,
        "--jq",
        ".[] | {url: .html_url, body, author: .user.login, type: .user.type}",
      ]),
    );
    for (const note of [issue, ...comments]) {
      const body = note.body ?? "";
      if (note.type !== "User" || !CREDIT_NOTE.test(proseOf(body))) continue;
      if (!maintainerCached(spawn, maintainer, note.author)) continue;
      const logins = mentionsOf(body).filter(community);
      if (logins.length)
        notes.push({ issue: issue.number, url: note.url, logins });
    }
  }
  return notes;
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
      `Release ledger: [${mergeBranch}](${ledgerUrl})`,
      ...sections,
      trailer,
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
  /** @type {Map<string, boolean>} */
  const maintainer = new Map();
  const reporters = collectReporters(
    spawn,
    entries.map((e) => e.pr),
    maintainer,
  );
  const { credits: advisories, pending } = collectAdvisoryCredits(
    spawn,
    args.advisories,
    maintainer,
  );
  for (const credit of pending) {
    console.error(
      `PENDING advisory credit: ${credit} is not accepted yet; it may still be declined`,
    );
  }
  const thanks = formatThanks({
    reporters,
    advisories,
    thanks: args.thanks,
  });

  if (args.mode === "preview") {
    // The prototype paragraph is only as complete as the --thank flags, so
    // the preview shows every credit on record next to what covers it.
    const thanked = new Set(
      args.thanks.flatMap(mentionsOf).map((l) => l.toLowerCase()),
    );
    const credited = discoverCredits(spawn, args.milestone, maintainer);
    console.error(
      credited.length
        ? `credit notes on ${args.milestone}'s closed issues (each needs a --thank, unless it credits a reporter already listed):`
        : `no credit notes on ${args.milestone}'s closed issues`,
    );
    for (const { issue, url, logins } of credited) {
      const who = logins.map(
        (l) =>
          `@${l} ${thanked.has(l.toLowerCase()) ? "(--thank given)" : "(NO --thank)"}`,
      );
      console.error(`  #${issue} ${url}: ${who.join(", ")}`);
    }
  }

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
