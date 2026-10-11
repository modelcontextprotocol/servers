// Tests for `verify-main-source.mjs` (#5119): the arguments and the report,
// the guard end to end against throwaway repositories shaped like the
// release flow, a merge PR from a branch pushed off `v2/main` passes, as does
// one `v2/main` has since moved past; a branch with a commit of its own, or a
// merge of `v2/main` into something else, fails. Last, the properties of
// `main-source.yml` its safety rests on. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import {
  DEFAULT_SOURCE,
  MAX_LISTED,
  formatReport,
  parseArgs,
  verifyMainSource,
} from "./verify-main-source.mjs";

test("parseArgs: --head is required, --source defaults to origin/v2/main", () => {
  assert.deepEqual(parseArgs(["--head", "abc"]), {
    source: DEFAULT_SOURCE,
    head: "abc",
  });
  assert.deepEqual(parseArgs(["--source", "v2/main", "--head", "abc"]), {
    source: "v2/main",
    head: "abc",
  });
  assert.throws(() => parseArgs([]), /--head is required/);
  assert.throws(() => parseArgs(["--head"]), /--head needs a revision/);
  assert.throws(() => parseArgs(["abc"]), /unknown argument/);
});

test("formatReport: names the commits, caps the list, and says where the change belongs", () => {
  const commits = Array.from(
    { length: MAX_LISTED + 3 },
    (_, i) => `${String(i).padStart(7, "0")} commit ${i}`,
  );
  const out = formatReport({ source: "origin/v2/main", head: "abc", commits });
  assert.match(
    out,
    new RegExp(
      `abc carries ${MAX_LISTED + 3} commits that origin/v2/main does not`,
    ),
  );
  assert.match(out, /0000000 commit 0/);
  assert.doesNotMatch(out, new RegExp(`commit ${MAX_LISTED}\\b`));
  assert.match(out, /… and 3 more/);
  assert.match(out, /pure merge of `v2\/main`/);
  assert.match(
    formatReport({ source: "s", head: "h", commits: ["1234567 one"] }),
    /carries 1 commit that s does not/,
  );
});

// End to end, against a real repository: `main` and `v2` stand in for `main`
// and `origin/v2/main`, sharing a root.

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), "verify-main-source-"));
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Ada Lovelace",
    GIT_AUTHOR_EMAIL: "ada@example.com",
    GIT_COMMITTER_NAME: "Ada Lovelace",
    GIT_COMMITTER_EMAIL: "ada@example.com",
  };
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: dir, env, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("commit", "-q", "--allow-empty", "-m", "root");
  git("switch", "-q", "-c", "v2");
  git("commit", "-q", "--allow-empty", "-m", "v2 work");
  return {
    dir,
    git,
    check: (head) => verifyMainSource({ source: "v2", head, cwd: dir }),
    done: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("verifyMainSource: a release branch pushed from v2 passes", (t) => {
  const r = repo();
  t.after(r.done);
  r.git("branch", "release", "v2");
  const { code, output } = r.check("release");
  assert.equal(code, 0, output);
  assert.match(output, /release is on v2/);
});

test("verifyMainSource: a head v2 has since moved past still passes", (t) => {
  const r = repo();
  t.after(r.done);
  r.git("branch", "release", "v2");
  r.git("commit", "-q", "--allow-empty", "-m", "later v2 work");
  assert.equal(r.check("release").code, 0);
});

test("verifyMainSource: a branch with a commit of its own fails, naming it", (t) => {
  const r = repo();
  t.after(r.done);
  r.git("switch", "-q", "-c", "topic", "v2");
  r.git("commit", "-q", "--allow-empty", "-m", "sneaky fix");
  const sha = r.git("rev-parse", "--short", "HEAD");
  const { code, output } = r.check("topic");
  assert.equal(code, 1);
  assert.match(output, /topic carries 1 commit that v2 does not/);
  assert.ok(output.includes(`${sha} sneaky fix`), output);
  assert.doesNotMatch(output, /v2 work/);
});

test("verifyMainSource: a branch cut from main fails", (t) => {
  const r = repo();
  t.after(r.done);
  r.git("switch", "-q", "-c", "hotfix", "main");
  r.git("commit", "-q", "--allow-empty", "-m", "hotfix");
  const { code, output } = r.check("hotfix");
  assert.equal(code, 1);
  assert.match(output, /hotfix carries 1 commit/);
});

test("verifyMainSource: v2 merged into another branch fails, merge commit and all", (t) => {
  const r = repo();
  t.after(r.done);
  r.git("switch", "-q", "-c", "mixed", "main");
  r.git("commit", "-q", "--allow-empty", "-m", "side work");
  r.git("merge", "-q", "--no-ff", "--no-edit", "v2");
  const { code, output } = r.check("mixed");
  assert.equal(code, 1);
  assert.match(output, /mixed carries 2 commits/);
  assert.match(output, /side work/);
});

test("verifyMainSource: an unresolvable source or head fails and says so", (t) => {
  const r = repo();
  t.after(r.done);
  const noSource = verifyMainSource({
    source: DEFAULT_SOURCE,
    head: "HEAD",
    cwd: r.dir,
  });
  assert.equal(noSource.code, 1);
  assert.match(noSource.output, /cannot resolve origin\/v2\/main\. Fetch it/);
  const noHead = r.check("no-such-branch");
  assert.equal(noHead.code, 1);
  assert.match(noHead.output, /cannot resolve no-such-branch\.$/);
});

test("verifyMainSource: run as a script, a bad argument exits 2", () => {
  const r = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, "verify-main-source.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--head is required/);
});

// The workflow's safety rests on properties of its YAML; pin them, so an edit
// that would run the PR's code, or stop wiring the guard, fails here.
const workflow = parse(
  readFileSync(
    path.join(import.meta.dirname, "..", ".github/workflows/main-source.yml"),
    "utf8",
  ),
);
const job = workflow.jobs["main-source"];

test("main-source.yml: runs main's copy, on PRs into main only, read-only", () => {
  assert.deepEqual(Object.keys(workflow.on), ["pull_request_target"]);
  assert.deepEqual(workflow.on.pull_request_target.branches, ["main"]);
  assert.ok(workflow.on.pull_request_target.types.includes("edited"));
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(job.permissions, undefined);
  assert.deepEqual(Object.keys(workflow.jobs), ["main-source"]);
  assert.equal(job.name, "Source is v2/main");
  assert.ok(job["timeout-minutes"]);
});

test("main-source.yml: checks out main, never the PR, and fetches the PR as objects only", () => {
  const checkout = job.steps.filter((s) =>
    /actions\/checkout/.test(s.uses ?? ""),
  );
  assert.equal(checkout.length, 1);
  assert.equal(checkout[0].with?.ref, undefined);
  assert.equal(checkout[0].with?.repository, undefined);
  assert.equal(checkout[0].with["persist-credentials"], false);
  const runs = job.steps.map((s) => s.run ?? "").join("\n");
  const refspec = '"+refs/pull/${PR_NUMBER}/head:refs/remotes/pr/head"';
  assert.ok(runs.includes(refspec), "the PR head is fetched");
  // Past that fetch, nothing names the PR's ref, or switches to, installs or
  // executes a tree.
  const rest = runs.replace(refspec, "");
  assert.doesNotMatch(rest, /pr\/head|refs\/pull/);
  assert.doesNotMatch(rest, /git (checkout|switch|reset|worktree)|npm |npx /);
  // No step reads a secret; expressions reach the shell only through env.
  for (const step of job.steps) {
    assert.doesNotMatch(JSON.stringify(step), /secrets\./);
    assert.doesNotMatch(step.run ?? "", /\$\{\{/);
  }
});

test("main-source.yml: hands the event's head SHA to the guard", () => {
  const step = job.steps.find((s) =>
    /verify-main-source\.mjs/.test(s.run ?? ""),
  );
  assert.ok(step, "a step runs the guard");
  assert.equal(step.env.HEAD_SHA, "${{ github.event.pull_request.head.sha }}");
  assert.match(step.run, /--head "\$HEAD_SHA"/);
  assert.doesNotMatch(step.run, /--source/);
});
