// What the three issue-filing sweeps share (#4874): `dependency-refresh.mjs`,
// `dependabot-alerts.mjs` and `sdk-watch.mjs`. Ported from the MCP
// Inspector, where each sweep carried its own copy of these helpers; here
// they live once, because two copies of the trust rule or the milestone pick
// are worse than one (`AGENTS.md`, Maintenance rules).
//
// Five things live here:
//
//  1. **The labels every sweep issue carries**, and the trust rule built on
//     them. This repository is public, so a marker in an issue body is not
//     evidence on its own: anyone can open an issue whose body starts with any
//     string. A marker counts only on an issue the automation wrote, which
//     means its author normalizes onto `github-actions` AND it carries `chore`
//     and `dependencies`, labels an outsider cannot set (the issue forms apply
//     `bug` or `enhancement`). The Inspector learned the login half the hard
//     way: the same account has three spellings, and one it did not normalize
//     cost three duplicate issues on three nights (inspector#2377).
//  2. **The milestone pick**: the open milestone with the nearest due date.
//     `AGENTS.md` requires every created issue to carry one; an undated bucket
//     cannot be the nearest, so it is dropped rather than sorted last (jq
//     sorts `null` first, which is why this is not a `--jq` expression).
//  3. **The server scope label** for a path under `src/<server>/`.
//  4. **`cell`**, escaping a value for a Markdown table. Backslashes are
//     escaped before pipes: escaping only the pipe is the incomplete
//     sanitization CodeQL flagged in the Inspector's copies (inspector#2542).
//  5. **The writer**, the one place a sweep writes to the tracker. Every
//     create, edit and comment goes through it, so `--dry-run` is a property
//     of the writer rather than a branch in each sweep: a dry run reads what
//     it must (alerts, milestones, existing issues) and prints each payload it
//     would have sent, labels and milestone included, and writes nothing.
//
// ⚠️ **No sweep writes to the project board.** Board #43 is an org project,
// and `GITHUB_TOKEN` cannot hold `organization projects: write`. The Inspector
// shipped board-write code reading a `PROJECT_TOKEN` secret that never
// existed, so it never ran (inspector#2547). Here a sweep files the issue
// labeled and milestoned, and `issue-triage` boards it: its pass 1 moves an
// unboarded issue that already has a milestone straight into `Todo`. Boarding
// from the workflows waits on a GitHub App credential (#5061).

import { spawnSync } from "node:child_process";

/** The branch this repo ships from, and the one each sweep checks out. */
export const TARGET_BRANCH = "v2/main";

/** The account the workflows' `GITHUB_TOKEN` writes as, normalized. */
export const AUTOMATION_LOGIN = "github-actions";

/** Labels on every sweep issue. `chore` and `dependencies` need write access. */
export const SWEEP_LABELS = ["v2", "chore", "dependencies"];

/** The two labels the trust rule reads; `v2` is applied by an issue form. */
const TRUST_LABELS = ["chore", "dependencies"];

/** The servers a path can be scoped to, by their directory under `src/`. */
export const SERVERS = [
  "everything",
  "filesystem",
  "memory",
  "sequentialthinking",
  "fetch",
  "git",
  "time",
];

/**
 * One login, whichever way `gh` or the REST API spells it:
 * `github-actions[bot]` (REST), `github-actions` (older `gh`), and
 * `app/github-actions` (newer `gh`). `/` is not legal in a username, so
 * stripping the `app/` prefix lets no human account normalize onto the bot.
 *
 * @param {string | null | undefined} login
 * @returns {string}
 */
export function normalizeLogin(login) {
  return String(login ?? "")
    .toLowerCase()
    .replace(/^app\//, "")
    .replace(/\[bot\]$/, "");
}

/**
 * The author half of the trust rule. `is_bot` is absent on some `gh`
 * versions, so only an explicit `false` disqualifies.
 *
 * @param {{author?: {login?: string, is_bot?: boolean}}} issue
 * @returns {boolean}
 */
export function hasSweepAuthor(issue) {
  return (
    normalizeLogin(issue?.author?.login) === AUTOMATION_LOGIN &&
    issue?.author?.is_bot !== false
  );
}

/**
 * The label half of the trust rule.
 *
 * @param {{labels?: Array<{name?: string}>}} issue
 * @returns {boolean}
 */
export function hasSweepLabels(issue) {
  const names = new Set((issue?.labels ?? []).map((l) => l?.name));
  return TRUST_LABELS.every((label) => names.has(label));
}

/**
 * Was this issue filed by a sweep, rather than merely shaped like one?
 *
 * @param {{author?: {login?: string, is_bot?: boolean}, labels?: Array<{name?: string}>}} issue
 * @returns {boolean}
 */
export function isSweepAuthored(issue) {
  return hasSweepAuthor(issue) && hasSweepLabels(issue);
}

/**
 * Was this comment written by the automation? Takes the REST shape
 * (`user.login`, `user.type`).
 *
 * @param {{user?: {login?: string, type?: string}}} comment
 * @returns {boolean}
 */
export function isAutomationComment(comment) {
  return (
    normalizeLogin(comment?.user?.login) === AUTOMATION_LOGIN &&
    comment?.user?.type !== "User"
  );
}

/**
 * Report issues that carry a sweep's marker and both trust labels but whose
 * author does not normalize onto `AUTOMATION_LOGIN`. That combination needs
 * write access, so an outsider cannot produce it: it is the signature of a
 * login spelling `normalizeLogin` does not know, which silently disables
 * every suppression the marker drives. Reported rather than thrown, so a
 * cosmetic rename upstream does not take the sweep down.
 *
 * @param {Array<{author?: {login?: string}, body?: string, labels?: Array<{name?: string}>}>} issues
 * @param {(body: string | undefined) => unknown} parseMarker
 * @param {string} sweep the sweep's name, for the message
 * @param {(msg: string) => void} [warn]
 * @returns {string[]} the unrecognized logins
 */
export function warnOnUnrecognizedAuthors(
  issues,
  parseMarker,
  sweep,
  warn = console.warn,
) {
  const unrecognized = [
    ...new Set(
      (issues ?? [])
        .filter(
          (i) =>
            !hasSweepAuthor(i) &&
            hasSweepLabels(i) &&
            parseMarker(i?.body) !== null,
        )
        .map((i) => String(i?.author?.login ?? "")),
    ),
  ];
  if (unrecognized.length > 0) {
    warn(
      `${sweep}: ⚠️ issues carry this sweep's marker and labels but an author that does not ` +
        `normalize onto "${AUTOMATION_LOGIN}": ${unrecognized.map((l) => JSON.stringify(l)).join(", ")}. ` +
        "They are ignored, so the sweep may refile them; teach `normalizeLogin` the spelling.",
    );
  }
  return unrecognized;
}

/**
 * The open milestone with the nearest due date, or `null` when none is dated.
 *
 * @param {Array<{title: string, state?: string, due_on?: string | null}>} milestones
 * @returns {string | null}
 */
export function pickMilestone(milestones) {
  const dated = (milestones ?? []).filter(
    (m) => (m.state ?? "open") === "open" && m.due_on,
  );
  if (dated.length === 0) return null;
  return dated.sort((a, b) => a.due_on.localeCompare(b.due_on))[0].title;
}

/**
 * The `server-<name>` label for a path inside one server, else `null`.
 *
 * @param {string} file a repo-relative path, e.g. `src/time/uv.lock`
 * @returns {string | null}
 */
export function scopeLabel(file) {
  const match = /^src\/([^/]+)\//.exec(file);
  return match && SERVERS.includes(match[1]) ? `server-${match[1]}` : null;
}

/**
 * Escape a value for a Markdown table cell: backslashes first, then pipes.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function cell(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

/** `--dry-run` anywhere in argv. */
export function isDryRun(argv = process.argv.slice(2)) {
  return argv.includes("--dry-run");
}

/**
 * Run `gh`, throwing on a spawn failure (a missing binary) but not on a
 * non-zero exit, which the caller interprets.
 *
 * @param {typeof spawnSync} spawn
 * @param {string[]} args
 * @param {string} [input] stdin, for `--body-file -`
 */
export function gh(spawn, args, input) {
  const result = spawn("gh", args, {
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
  });
  if (result.error) throw result.error;
  return result;
}

/**
 * Run `gh` and parse its JSON stdout, throwing on any failure.
 *
 * @param {typeof spawnSync} spawn
 * @param {string[]} args
 */
export function ghJson(spawn, args) {
  const result = gh(spawn, args);
  if (result.status !== 0) {
    throw new Error(
      `gh ${args.slice(0, 2).join(" ")} failed: ${(result.stderr ?? "").trim()}`,
    );
  }
  return JSON.parse(result.stdout || "null");
}

/**
 * The milestone a new sweep issue takes.
 *
 * @param {string} repo
 * @param {typeof spawnSync} spawn
 * @returns {string | null}
 */
export function currentMilestone(repo, spawn) {
  return pickMilestone(
    ghJson(spawn, ["api", `repos/${repo}/milestones?state=open&per_page=100`]),
  );
}

/**
 * Every issue a sweep wrote, open and closed by default, read by LABEL rather
 * than by searching for the marker: a label listing does not depend on how
 * the search index treats an HTML comment, and the marker is parsed
 * client-side by the caller. `gh issue list` caps at `--limit`, so a full
 * page is treated as truncated and fails the run: an issue the lookup cannot
 * see is one the sweep would file a duplicate of.
 *
 * @param {string} repo
 * @param {typeof spawnSync} spawn
 * @param {{state?: "open" | "all", parseMarker: (body: string | undefined) => unknown, sweep: string, warn?: (msg: string) => void}} options
 * @returns {Array<{number: number, title: string, body: string, state: string, author: object, labels: object[]}>}
 */
export function sweepIssues(
  repo,
  spawn,
  { state = "all", parseMarker, sweep, warn = console.warn },
) {
  const LIMIT = 500;
  const issues = ghJson(spawn, [
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    state,
    "--label",
    "dependencies",
    "--json",
    "number,title,body,state,author,labels",
    "--limit",
    String(LIMIT),
  ]);
  if (!Array.isArray(issues)) {
    throw new Error(`${sweep}: the issue listing was not a list`);
  }
  if (issues.length >= LIMIT) {
    throw new Error(
      `${sweep}: the issue listing hit its limit of ${LIMIT}, so it may be truncated; refusing to file against a partial view`,
    );
  }
  warnOnUnrecognizedAuthors(issues, parseMarker, sweep, warn);
  return issues.filter(isSweepAuthored);
}

/**
 * Every comment on an issue, whole and with its author, through the REST
 * endpoint (`--slurp`, since `gh` concatenates one array per page otherwise).
 *
 * @param {string} repo
 * @param {number} number
 * @param {typeof spawnSync} spawn
 * @returns {Array<{body: string, user: {login: string, type: string}}>}
 */
export function issueComments(repo, number, spawn) {
  const pages = ghJson(spawn, [
    "api",
    "--paginate",
    "--slurp",
    `repos/${repo}/issues/${number}/comments?per_page=100`,
  ]);
  return (pages ?? []).flat();
}

/**
 * The one place a sweep writes. With `dryRun`, each call prints the payload it
 * would have sent and returns a placeholder; nothing reaches `gh`.
 *
 * Bodies go through `--body-file -` on stdin, so a body is never parsed as a
 * flag and never meets an argv length limit.
 *
 * @param {{repo: string, spawn?: typeof spawnSync, dryRun?: boolean, sweep: string, log?: (line: string) => void}} options
 */
export function issueWriter({
  repo,
  spawn = spawnSync,
  dryRun = false,
  sweep,
  log = console.log,
}) {
  const show = (action, fields, body) => {
    log(`--- ${sweep} dry run: would ${action} ---`);
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) log(`${key}: ${value}`);
    }
    if (body !== undefined) log(`body:\n${body}`);
    log(`--- end ---`);
  };
  const run = (args, body, what) => {
    const result = gh(spawn, args, body);
    if (result.status !== 0) {
      throw new Error(`${what} failed: ${(result.stderr ?? "").trim()}`);
    }
    return (result.stdout ?? "").trim();
  };

  return {
    dryRun,
    /**
     * @param {{title: string, labels: string[], milestone: string | null, body: string}} issue
     * @returns {{url: string | null, number: number | null}}
     */
    create({ title, labels, milestone, body }) {
      if (dryRun) {
        show(
          "create an issue",
          {
            repo,
            title,
            labels: labels.join(", "),
            milestone: milestone ?? "(none: triage places it in Incoming)",
          },
          body,
        );
        return { url: null, number: null };
      }
      const args = ["issue", "create", "--repo", repo, "--title", title];
      for (const label of labels) args.push("--label", label);
      if (milestone) args.push("--milestone", milestone);
      args.push("--body-file", "-");
      const url = run(args, body, "gh issue create");
      const number = Number(url.split("/").pop());
      if (!Number.isInteger(number)) {
        throw new Error(`could not read an issue number out of "${url}"`);
      }
      return { url, number };
    },
    /**
     * @param {number} number
     * @param {{title?: string, body: string}} change
     */
    edit(number, { title, body }) {
      if (dryRun) {
        show(`edit #${number}`, { title }, body);
        return;
      }
      const args = ["issue", "edit", String(number), "--repo", repo];
      if (title !== undefined) args.push("--title", title);
      args.push("--body-file", "-");
      run(args, body, "gh issue edit");
    },
    /**
     * @param {number} number
     * @param {string} body
     */
    comment(number, body) {
      if (dryRun) {
        show(`comment on #${number}`, {}, body);
        return;
      }
      run(
        [
          "issue",
          "comment",
          String(number),
          "--repo",
          repo,
          "--body-file",
          "-",
        ],
        body,
        "gh issue comment",
      );
    },
  };
}
