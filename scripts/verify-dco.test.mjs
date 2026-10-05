// Tests for `verify-dco.mjs` (#4919): the pure signoff rule and its
// exemptions, the log parser and the arguments, then the guard end to end
// against throwaway repositories, including the repair it prints. Run via
// `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_BASE,
  findUnsigned,
  parseArgs,
  parseLog,
  parseSignoffs,
  signoffProblem,
  verifyDco,
} from "./verify-dco.mjs";

const ada = { name: "Ada Lovelace", email: "ada@example.com" };
const bob = { name: "Bob Builder", email: "bob@example.com" };

const commit = (over = {}) => ({
  sha: "a".repeat(40),
  parents: ["b".repeat(40)],
  author: ada,
  committer: ada,
  message: "Fix a thing\n\nSigned-off-by: Ada Lovelace <ada@example.com>\n",
  ...over,
});

test("parseSignoffs: reads every trailer, any key case", () => {
  assert.deepEqual(
    parseSignoffs(
      "x\n\nsigned-off-by: Ada Lovelace <ada@example.com>\n" +
        "Signed-off-by:Bob Builder  <bob@example.com>  \n",
    ),
    [ada, bob],
  );
});

test("parseSignoffs: a line that only mentions the trailer is not one", () => {
  assert.deepEqual(
    parseSignoffs("Explain Signed-off-by: Ada <ada@example.com> inline\n"),
    [],
  );
  assert.deepEqual(parseSignoffs("Signed-off-by: Ada Lovelace\n"), []);
});

test("signoffProblem: a signoff matching the author passes", () => {
  assert.equal(signoffProblem(commit()), null);
});

test("signoffProblem: a signoff matching only the committer passes", () => {
  assert.equal(
    signoffProblem(
      commit({
        author: bob,
        message: "x\n\nSigned-off-by: Ada Lovelace <ada@example.com>\n",
      }),
    ),
    null,
  );
});

test("signoffProblem: the email is compared ignoring case", () => {
  assert.equal(
    signoffProblem(
      commit({ message: "x\n\nSigned-off-by: Ada Lovelace <ADA@Example.com>" }),
    ),
    null,
  );
});

test("signoffProblem: no trailer fails", () => {
  assert.equal(
    signoffProblem(commit({ message: "Fix a thing\n" })),
    "has no Signed-off-by trailer",
  );
});

test("signoffProblem: the name and the email must both match", () => {
  for (const message of [
    "x\n\nSigned-off-by: Ada L <ada@example.com>",
    "x\n\nSigned-off-by: Ada Lovelace <ada@elsewhere.com>",
    "x\n\nSigned-off-by: Bob Builder <bob@example.com>",
  ]) {
    assert.match(
      signoffProblem(commit({ message })),
      /matches neither its author \(Ada Lovelace <ada@example\.com>\) nor its committer/,
      message,
    );
  }
});

test("signoffProblem: merge commits are exempt", () => {
  assert.equal(
    signoffProblem(
      commit({ parents: ["b".repeat(40), "c".repeat(40)], message: "Merge" }),
    ),
    null,
  );
});

test("signoffProblem: bot-authored commits are exempt", () => {
  for (const email of [
    "49699333+dependabot[bot]@users.noreply.github.com",
    "github-actions[bot]@users.noreply.github.com",
  ])
    assert.equal(
      signoffProblem(
        commit({ author: { name: "bot", email }, message: "Bump\n" }),
      ),
      null,
      email,
    );
});

test("signoffProblem: a bot name with a human email is not exempt", () => {
  assert.equal(
    signoffProblem(
      commit({
        author: { name: "helper[bot]", email: "me@example.com" },
        message: "x\n",
      }),
    ),
    "has no Signed-off-by trailer",
  );
});

test("parseLog: reads NUL-separated records, message last", () => {
  const rec = (sha, parents, msg) =>
    [sha, parents, "A", "a@x", "C", "c@x", msg].join("\x1f");
  const commits = parseLog(
    rec("1".repeat(40), "p1", "one\n\nbody \x1f kept\n") +
      "\0" +
      rec("2".repeat(40), "p1 p2", "merge\n") +
      "\0",
  );
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0].author, { name: "A", email: "a@x" });
  assert.deepEqual(commits[0].committer, { name: "C", email: "c@x" });
  assert.equal(commits[0].message, "one\n\nbody \x1f kept\n");
  assert.deepEqual(commits[1].parents, ["p1", "p2"]);
});

test("findUnsigned: reports failures oldest first", () => {
  const newest = commit({ sha: "1".repeat(40), message: "new\n" });
  const middle = commit({ sha: "2".repeat(40) });
  const oldest = commit({ sha: "3".repeat(40), message: "old\n" });
  assert.deepEqual(
    findUnsigned([newest, middle, oldest]).map((f) => f.commit.sha[0]),
    ["3", "1"],
  );
});

test("parseArgs: defaults, overrides, and refusals", () => {
  assert.deepEqual(parseArgs([]), { base: DEFAULT_BASE, head: "HEAD" });
  assert.deepEqual(parseArgs(["--base", "abc", "--head", "def"]), {
    base: "abc",
    head: "def",
  });
  assert.throws(() => parseArgs(["--base"]), /needs a revision/);
  assert.throws(() => parseArgs(["main..HEAD"]), /unknown argument/);
});

// End to end, against a real repository.

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), "verify-dco-"));
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: ada.name,
    GIT_AUTHOR_EMAIL: ada.email,
    GIT_COMMITTER_NAME: ada.name,
    GIT_COMMITTER_EMAIL: ada.email,
  };
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: dir, env, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("commit", "-q", "--allow-empty", "-s", "-m", "base");
  git("switch", "-q", "-c", "topic");
  return {
    dir,
    git,
    done: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("verifyDco: a signed branch passes, counting its commits", (t) => {
  const r = repo();
  t.after(r.done);
  r.git("commit", "-q", "--allow-empty", "-s", "-m", "one");
  r.git("commit", "-q", "--allow-empty", "-s", "-m", "two");
  const { code, output } = verifyDco({
    base: "main",
    head: "HEAD",
    cwd: r.dir,
  });
  assert.equal(code, 0, output);
  assert.match(output, /2 commits in main\.\.HEAD/);
});

test("verifyDco: an unsigned commit fails, named with the repair, and the repair passes", (t) => {
  const r = repo();
  t.after(r.done);
  r.git("commit", "-q", "--allow-empty", "-s", "-m", "signed");
  r.git("commit", "-q", "--allow-empty", "-m", "forgot to sign");
  const sha = r.git("rev-parse", "HEAD").slice(0, 12);
  const mergeBase = r.git("rev-parse", "main").slice(0, 12);

  const failed = verifyDco({ base: "main", head: "HEAD", cwd: r.dir });
  assert.equal(failed.code, 1);
  assert.match(failed.output, /1 commit without a valid DCO signoff/);
  assert.match(
    failed.output,
    new RegExp(`${sha} "forgot to sign" has no Signed-off-by trailer`),
  );
  assert.doesNotMatch(failed.output, /"signed"/);
  assert.ok(
    failed.output.includes(`git rebase --signoff ${mergeBase}`),
    failed.output,
  );

  // The repair the report prints, run as printed.
  r.git("rebase", "-q", "--signoff", mergeBase);
  const repaired = verifyDco({ base: "main", head: "HEAD", cwd: r.dir });
  assert.equal(repaired.code, 0, repaired.output);
});

test("verifyDco: a merge commit in the range is exempt", (t) => {
  const r = repo();
  t.after(r.done);
  r.git("commit", "-q", "--allow-empty", "-s", "-m", "topic work");
  r.git("switch", "-q", "-c", "side", "main");
  r.git("commit", "-q", "--allow-empty", "-s", "-m", "side work");
  r.git("switch", "-q", "topic");
  r.git("merge", "-q", "--no-ff", "--no-edit", "side");
  const { code, output } = verifyDco({
    base: "main",
    head: "HEAD",
    cwd: r.dir,
  });
  assert.equal(code, 0, output);
});

test("verifyDco: an unresolvable base fails and says how to fix it", (t) => {
  const r = repo();
  t.after(r.done);
  const { code, output } = verifyDco({
    base: DEFAULT_BASE,
    head: "HEAD",
    cwd: r.dir,
  });
  assert.equal(code, 1);
  assert.match(output, /cannot resolve origin\/v2\/main\. Fetch it/);
});
