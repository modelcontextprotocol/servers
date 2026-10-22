// Tests for `session-instructions-check.mjs` (#5167): the pure report, then
// the check end to end against throwaway repositories with a local bare
// `origin`, so the fetch runs for real without the network. Run via
// `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import {
  BASE,
  MAX_NAMED,
  checkSession,
  report,
} from "./session-instructions-check.mjs";

const SHA = "0123456789abcdef".repeat(2) + "01234567";
const fresh = {
  fetched: true,
  baseSha: SHA,
  stale: false,
  changed: [],
  primary: false,
};

test("report: fresh, in a worktree, prints one confirming line", () => {
  assert.deepEqual(report(fresh), [
    `session-instructions-check: AGENTS.md and .claude/ match ${BASE} (01234567).`,
  ]);
});

test("report: stale names what changed and says to stop", () => {
  const [line] = report({
    ...fresh,
    stale: true,
    changed: ["AGENTS.md", ".claude/skills/release/SKILL.md"],
  });
  assert.match(line, /^STALE: /);
  assert.match(
    line,
    /changed AGENTS\.md, \.claude\/skills\/release\/SKILL\.md since/,
  );
  assert.match(line, /Stop, and ask for a session started in a worktree/);
});

test("report: a long list of changed paths is summarized", () => {
  const changed = Array.from({ length: MAX_NAMED + 3 }, (_, i) => `f${i}`);
  const [line] = report({ ...fresh, stale: true, changed });
  assert.match(line, new RegExp(`f${MAX_NAMED - 1} and 3 more since`));
  assert.doesNotMatch(line, new RegExp(`f${MAX_NAMED},`));
});

test("report: an unresolvable base is UNKNOWN, not fresh", () => {
  const lines = report({ ...fresh, fetched: false, baseSha: null });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /could not fetch/);
  assert.match(lines[1], /is UNKNOWN/);
});

test("report: the primary checkout adds a note", () => {
  const lines = report({ ...fresh, primary: true });
  assert.equal(lines.length, 2);
  assert.match(lines[1], /started in the primary checkout/);
});

// End to end, against real repositories.

const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Ada Lovelace",
  GIT_AUTHOR_EMAIL: "ada@example.com",
  GIT_COMMITTER_NAME: "Ada Lovelace",
  GIT_COMMITTER_EMAIL: "ada@example.com",
};

/**
 * A bare `origin` with a `v2/main` holding AGENTS.md and a skill, a primary
 * clone of it (`work`), and a scratch clone (`upstream`) that pushes new
 * commits to `origin` behind the primary's back.
 */
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "session-check-"));
  const at =
    (dir) =>
    (...args) => {
      const r = spawnSync("git", args, { cwd: dir, env, encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
  const origin = path.join(root, "origin.git");
  at(root)("init", "-q", "--bare", "-b", "v2/main", origin);

  const upstream = path.join(root, "upstream");
  at(root)("clone", "-q", origin, upstream);
  const up = at(upstream);
  up("switch", "-q", "-c", "v2/main");
  const write = (dir, file, text) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  write(upstream, "AGENTS.md", "rules v1\n");
  write(upstream, ".claude/skills/release/SKILL.md", "release v1\n");
  write(upstream, "README.md", "readme v1\n");
  up("add", "-A");
  up("commit", "-q", "-m", "initial");
  up("push", "-q", "origin", "v2/main");

  const work = path.join(root, "work");
  at(root)("clone", "-q", "-b", "v2/main", origin, work);

  /** Commit `file` on origin's v2/main without touching `work`. */
  const advance = (file, text) => {
    write(upstream, file, text);
    up("add", "-A");
    up("commit", "-q", "-m", `change ${file}`);
    up("push", "-q", "origin", "v2/main");
  };
  return {
    work,
    git: at(work),
    write: (file, text) => write(work, file, text),
    advance,
    done: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("checkSession: a primary checkout at origin/v2/main is fresh, with the primary note", (t) => {
  const s = setup();
  t.after(s.done);
  const lines = checkSession({ cwd: s.work });
  assert.match(lines[0], /match origin\/v2\/main/);
  assert.match(lines[1], /started in the primary checkout/);
});

test("checkSession: the fetch finds an instruction change made behind the checkout's back", (t) => {
  const s = setup();
  t.after(s.done);
  s.advance(".claude/skills/release/SKILL.md", "release v2\n");
  const lines = checkSession({ cwd: s.work });
  assert.match(
    lines[0],
    /^STALE: .*changed \.claude\/skills\/release\/SKILL\.md since/,
  );
});

test("checkSession: without the fetch, the same change goes unseen", (t) => {
  const s = setup();
  t.after(s.done);
  s.advance("AGENTS.md", "rules v2\n");
  const lines = checkSession({ cwd: s.work, fetch: false });
  assert.match(lines[0], /match origin\/v2\/main/);
});

test("checkSession: a change outside the instructions is not stale", (t) => {
  const s = setup();
  t.after(s.done);
  s.advance("README.md", "readme v2\n");
  assert.match(checkSession({ cwd: s.work })[0], /match origin\/v2\/main/);
});

test("checkSession: a fresh worktree is fresh, with no primary note", (t) => {
  const s = setup();
  t.after(s.done);
  s.advance("AGENTS.md", "rules v2\n");
  s.git("fetch", "-q", "origin", "v2/main");
  const wt = path.join(s.work, "..", "wt");
  s.git("worktree", "add", "-q", "--detach", wt, "origin/v2/main");
  const lines = checkSession({ cwd: wt });
  assert.equal(lines.length, 1, lines.join("\n"));
  assert.match(lines[0], /match origin\/v2\/main/);
});

test("checkSession: a HEAD with no history in common with v2/main is stale", (t) => {
  const s = setup();
  t.after(s.done);
  s.git("switch", "-q", "--orphan", "unrelated");
  s.git("commit", "-q", "--allow-empty", "-m", "unrelated root");
  assert.match(
    checkSession({ cwd: s.work })[0],
    /^STALE: .*changed \(no common history with HEAD\) since/,
  );
});

test("checkSession: a branch's own instruction edits are not stale; v2/main's are", (t) => {
  const s = setup();
  t.after(s.done);
  s.git("switch", "-q", "-c", "v2/docs/1-rules");
  s.write("AGENTS.md", "rules v1, edited on the branch\n");
  s.git("commit", "-q", "-am", "edit the rules");
  assert.match(checkSession({ cwd: s.work })[0], /match origin\/v2\/main/);

  s.advance(".claude/skills/release/SKILL.md", "release v2\n");
  assert.match(checkSession({ cwd: s.work })[0], /^STALE: /);
});

test("checkSession: no origin/v2/main is UNKNOWN", (t) => {
  const s = setup();
  t.after(s.done);
  s.git("remote", "remove", "origin");
  const lines = checkSession({ cwd: s.work });
  assert.match(lines[0], /could not fetch/);
  assert.match(lines[1], /is UNKNOWN/);
});
