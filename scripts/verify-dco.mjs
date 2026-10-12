#!/usr/bin/env node
// Guard: every commit a branch adds carries a DCO signoff (#4919).
//
// The repo adopted the Developer Certificate of Origin on #4861, and the plan
// was to enforce it with the probot DCO app. The app never ran here (the org
// turned it off; the Inspector lost its check the same way, inspector#2566),
// so this is the check we own instead. It applies the app's rule:
//
//   - every commit in the range carries a `Signed-off-by: Name <email>`
//     trailer whose name AND email match the commit's author or its
//     committer. The name is compared exactly, the email ignoring case.
//     Git reads the trailers (`%(trailers)`), the same parser `git commit -s`
//     and `git interpret-trailers` use, so only the message's trailer block
//     counts: a `Signed-off-by:` line quoted in the body, or written as the
//     subject, is not a signoff;
//   - merge commits are exempt, and so are bot-authored commits (an author
//     email of the form `[<id>+]<name>[bot]@users.noreply.github.com`, which
//     is how GitHub records every app's commits).
//
// One unsigned commit fails the run, and the report names each one and the
// `git rebase --signoff` repair.
//
// The range is `<base>..<head>`, by default `origin/v2/main..HEAD`, which is
// what `local:gate` checks: the commits about to be pushed. CI's `dco.yml`
// passes the pull request's base and head SHAs instead, so a PR is checked
// against what it actually adds.
//
// The bot exemption trusts the author email, which anyone can set. So can
// the trailer itself: a signoff is a statement, not a signature, and the app
// that this replaces checked no more than this does.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The range's default base: the branch every v2 PR targets. */
export const DEFAULT_BASE = "origin/v2/main";

const IDENTITY = /^(.*?)\s*<([^<>]*)>$/;
const BOT_EMAIL = /^(?:\d+\+)?[^@\s]+\[bot\]@users\.noreply\.github\.com$/i;

// Fields are separated by US (0x1f) and, under `git log -z`, commits by NUL.
// The signoffs are git's own trailer values (folded lines unfolded), one per
// RS (0x1e). The message comes last, so a stray separator in it cannot shift
// a field.
const LOG_FORMAT =
  "%H%x1f%P%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f" +
  "%(trailers:key=Signed-off-by,valueonly,unfold,separator=%x1e)%x1f%B";

/**
 * Pure: the identity in one `Signed-off-by:` value, or `null` when it has no
 * `<email>`.
 *
 * @param {string} value
 * @returns {{ name: string, email: string } | null}
 */
export function parseIdentity(value) {
  const m = IDENTITY.exec(value.trim());
  return m ? { name: m[1], email: m[2].trim() } : null;
}

/**
 * Pure: the commits in `git log -z --format=<LOG_FORMAT>` output.
 *
 * @param {string} stdout
 */
export function parseLog(stdout) {
  return stdout
    .split("\0")
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const fields = record.replace(/^\n/, "").split("\x1f");
      const [sha, parents, an, ae, cn, ce, signoffs] = fields;
      return {
        sha,
        parents: parents.split(" ").filter(Boolean),
        author: { name: an, email: ae },
        committer: { name: cn, email: ce },
        signoffs: signoffs.split("\x1e").filter((v) => v.trim() !== ""),
        message: fields.slice(7).join("\x1f"),
      };
    });
}

const sameIdentity = (a, b) =>
  a.name.trim() === b.name.trim() &&
  a.email.trim().toLowerCase() === b.email.trim().toLowerCase();

const show = (id) => `${id.name} <${id.email}>`;

/**
 * Pure: why a commit fails the DCO rule, or `null` when it passes or is
 * exempt.
 *
 * @param {ReturnType<typeof parseLog>[number]} commit
 * @returns {string | null}
 */
export function signoffProblem(commit) {
  if (commit.parents.length > 1) return null;
  if (BOT_EMAIL.test(commit.author.email.trim())) return null;
  if (commit.signoffs.length === 0) return "has no Signed-off-by trailer";
  const identities = [commit.author, commit.committer];
  const signers = commit.signoffs.map(parseIdentity).filter(Boolean);
  if (signers.some((s) => identities.some((id) => sameIdentity(s, id))))
    return null;
  return (
    `is signed off by ${commit.signoffs.join(", ")}, which matches ` +
    `neither its author (${show(commit.author)}) nor its committer ` +
    `(${show(commit.committer)})`
  );
}

/**
 * Pure: the failing commits, oldest first.
 *
 * @param {ReturnType<typeof parseLog>} commits newest first, as `git log` gives them
 */
export function findUnsigned(commits) {
  return commits
    .map((commit) => ({ commit, problem: signoffProblem(commit) }))
    .filter((f) => f.problem !== null)
    .reverse();
}

/**
 * Pure: the report for failing commits, with the repair.
 *
 * @param {ReturnType<typeof findUnsigned>} findings
 * @param {string} mergeBase the SHA to rebase onto
 */
export function formatReport(findings, mergeBase) {
  const subject = (c) => c.message.split("\n")[0];
  const lines = findings.map(
    ({ commit, problem }) =>
      `  ${commit.sha.slice(0, 12)} "${subject(commit)}" ${problem}`,
  );
  const n = findings.length;
  return [
    `verify:dco: ${n} commit${n === 1 ? "" : "s"} without a valid DCO signoff:`,
    ...lines,
    "",
    "Every commit needs a `Signed-off-by: Name <email>` trailer matching its",
    "author or committer (commit with `git commit -s`). To sign off the",
    "commits already made, rewrite them and force-push:",
    "",
    `  git rebase --signoff ${mergeBase.slice(0, 12)}`,
    "  git push --force-with-lease",
    "",
    "`--signoff` signs each commit as you (git config user.name/user.email).",
  ].join("\n");
}

/**
 * Pure: `--base <rev>` and `--head <rev>`, each optional.
 *
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const opts = { base: DEFAULT_BASE, head: "HEAD" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== "--base" && flag !== "--head")
      throw new Error(`unknown argument: ${flag}`);
    const value = argv[++i];
    if (!value) throw new Error(`${flag} needs a revision`);
    opts[flag.slice(2)] = value;
  }
  return opts;
}

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.error) throw r.error;
  return r;
}

/**
 * Check `<base>..<head>` in the repository at `cwd`.
 *
 * @returns {{ code: number, output: string }}
 */
export function verifyDco({ base, head, cwd }) {
  for (const rev of [base, head]) {
    if (
      git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], cwd).status
    )
      return {
        code: 1,
        output:
          `verify:dco: cannot resolve ${rev}.` +
          (rev === DEFAULT_BASE
            ? " Fetch it (`git fetch origin v2/main`), or name another base with --base."
            : ""),
      };
  }
  const mb = git(["merge-base", base, head], cwd);
  if (mb.status)
    return {
      code: 1,
      output: `verify:dco: ${base} and ${head} share no history.`,
    };
  const log = git(
    ["log", "-z", `--format=${LOG_FORMAT}`, `${base}..${head}`],
    cwd,
  );
  if (log.status)
    return { code: 1, output: `verify:dco: git log failed:\n${log.stderr}` };
  const commits = parseLog(log.stdout);
  const findings = findUnsigned(commits);
  if (findings.length > 0)
    return { code: 1, output: formatReport(findings, mb.stdout.trim()) };
  const n = commits.length;
  return {
    code: 0,
    output: `verify:dco: ${n} commit${n === 1 ? "" : "s"} in ${base}..${head}, all signed off or exempt.`,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`verify:dco: ${e.message}`);
    process.exit(2);
  }
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const { code, output } = verifyDco({ ...opts, cwd: repoRoot });
  (code === 0 ? console.log : console.error)(output);
  process.exit(code);
}
