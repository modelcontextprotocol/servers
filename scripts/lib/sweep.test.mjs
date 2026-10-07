// Tests for what the issue-filing sweeps share (#4874): the trust rule a
// marker depends on, the milestone pick, scope labels, table escaping, the
// issue lookup's truncation guard, and the writer, whose dry run must reach
// `gh` for nothing. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SWEEP_LABELS,
  cell,
  currentMilestone,
  gh,
  hasSweepAuthor,
  isAutomationComment,
  isDryRun,
  isSweepAuthored,
  issueComments,
  issueWriter,
  normalizeLogin,
  pickMilestone,
  scopeLabel,
  sweepIssues,
  warnOnUnrecognizedAuthors,
} from "./sweep.mjs";

/** A `spawn` that answers from `reply` and records every call. */
function fakeSpawn(reply = () => ({ status: 0, stdout: "" })) {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, input: opts?.input });
    return { stderr: "", stdout: "", ...reply(cmd, args, opts) };
  };
  return { spawn, calls };
}

const labels = (...names) => names.map((name) => ({ name }));
const bot = { login: "app/github-actions", is_bot: true };

test("normalizeLogin folds every spelling of the Actions bot together", () => {
  for (const login of [
    "github-actions",
    "github-actions[bot]",
    "app/github-actions",
    "GitHub-Actions[bot]",
  ]) {
    assert.equal(normalizeLogin(login), "github-actions");
  }
  assert.equal(normalizeLogin(undefined), "");
});

test("isSweepAuthored needs the bot AND both write-access labels", () => {
  assert.equal(
    isSweepAuthored({
      author: bot,
      labels: labels("v2", "chore", "dependencies"),
    }),
    true,
  );
  assert.equal(
    isSweepAuthored({ author: bot, labels: labels("v2", "chore") }),
    false,
  );
  assert.equal(
    isSweepAuthored({
      author: { login: "someone" },
      labels: labels("chore", "dependencies"),
    }),
    false,
  );
  // A human account that happens to carry the name.
  assert.equal(
    hasSweepAuthor({ author: { login: "github-actions", is_bot: false } }),
    false,
  );
  // `is_bot` absent on some gh versions.
  assert.equal(hasSweepAuthor({ author: { login: "github-actions" } }), true);
});

test("isAutomationComment reads the REST user shape", () => {
  assert.equal(
    isAutomationComment({
      user: { login: "github-actions[bot]", type: "Bot" },
    }),
    true,
  );
  assert.equal(
    isAutomationComment({ user: { login: "github-actions", type: "User" } }),
    false,
  );
  assert.equal(isAutomationComment({ user: { login: "octocat" } }), false);
});

test("warnOnUnrecognizedAuthors flags only marker + labels + unknown author", () => {
  const warnings = [];
  const parse = (body) => (body?.startsWith("<!-- m") ? {} : null);
  const found = warnOnUnrecognizedAuthors(
    [
      {
        author: { login: "bots/github-actions" },
        body: "<!-- m -->",
        labels: labels("chore", "dependencies"),
      },
      {
        author: { login: "octocat" },
        body: "<!-- m -->",
        labels: labels("bug"),
      },
      {
        author: bot,
        body: "<!-- m -->",
        labels: labels("chore", "dependencies"),
      },
      {
        author: { login: "x" },
        body: "no marker",
        labels: labels("chore", "dependencies"),
      },
    ],
    parse,
    "test-sweep",
    (msg) => warnings.push(msg),
  );
  assert.deepEqual(found, ["bots/github-actions"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /test-sweep/);
  assert.deepEqual(
    warnOnUnrecognizedAuthors([], parse, "s", () => assert.fail()),
    [],
  );
});

test("pickMilestone takes the nearest DATED open milestone", () => {
  assert.equal(
    pickMilestone([
      { title: "undated", state: "open", due_on: null },
      { title: "later", state: "open", due_on: "2026-12-01T00:00:00Z" },
      { title: "sooner", state: "open", due_on: "2026-10-10T00:00:00Z" },
      { title: "closed", state: "closed", due_on: "2026-01-01T00:00:00Z" },
    ]),
    "sooner",
  );
  assert.equal(pickMilestone([{ title: "undated", due_on: null }]), null);
  assert.equal(pickMilestone(undefined), null);
});

test("scopeLabel names a server only for a path inside one", () => {
  assert.equal(scopeLabel("src/time/uv.lock"), "server-time");
  assert.equal(
    scopeLabel("src/sequentialthinking/package.json"),
    "server-sequentialthinking",
  );
  assert.equal(scopeLabel("package-lock.json"), null);
  assert.equal(scopeLabel("src/unknown/uv.lock"), null);
});

test("cell escapes backslashes before pipes, and folds newlines", () => {
  assert.equal(cell(">= 1.0 || < 0.5"), ">= 1.0 \\|\\| < 0.5");
  assert.equal(cell("a\\|b"), "a\\\\\\|b");
  assert.equal(cell("one\ntwo"), "one two");
});

test("isDryRun reads the flag from argv", () => {
  assert.equal(isDryRun(["--dry-run"]), true);
  assert.equal(isDryRun([]), false);
});

test("gh throws on a spawn error, and passes stdin only when given", () => {
  assert.throws(
    () => gh(() => ({ error: new Error("ENOENT gh") }), ["api", "x"]),
    /ENOENT/,
  );
  const { spawn, calls } = fakeSpawn();
  gh(spawn, ["api", "x"]);
  gh(spawn, ["api", "y"], "body");
  assert.equal(calls[0].input, undefined);
  assert.equal(calls[1].input, "body");
});

test("currentMilestone reads open milestones and fails loudly", () => {
  const { spawn, calls } = fakeSpawn(() => ({
    status: 0,
    stdout: JSON.stringify([
      { title: "v2.0.0", due_on: "2026-10-17T00:00:00Z" },
    ]),
  }));
  assert.equal(currentMilestone("o/r", spawn), "v2.0.0");
  assert.match(calls[0].args[1], /milestones\?state=open/);
  assert.throws(
    () => currentMilestone("o/r", () => ({ status: 1, stderr: "HTTP 500" })),
    /HTTP 500/,
  );
});

test("sweepIssues lists by label, filters to sweep-authored, refuses a full page", () => {
  const issues = [
    {
      number: 1,
      body: "x",
      author: bot,
      labels: labels("chore", "dependencies"),
    },
    {
      number: 2,
      body: "x",
      author: { login: "octocat" },
      labels: labels("chore", "dependencies"),
    },
  ];
  const { spawn, calls } = fakeSpawn(() => ({
    status: 0,
    stdout: JSON.stringify(issues),
  }));
  const found = sweepIssues("o/r", spawn, {
    state: "open",
    parseMarker: () => null,
    sweep: "s",
  });
  assert.deepEqual(
    found.map((i) => i.number),
    [1],
  );
  assert.deepEqual(calls[0].args.slice(0, 2), ["issue", "list"]);
  assert.ok(calls[0].args.includes("dependencies"));
  assert.ok(!calls[0].args.includes("--search"));

  const full = Array.from({ length: 500 }, (_, i) => ({ number: i }));
  assert.throws(
    () =>
      sweepIssues("o/r", () => ({ status: 0, stdout: JSON.stringify(full) }), {
        parseMarker: () => null,
        sweep: "s",
      }),
    /truncated/,
  );
  assert.throws(
    () =>
      sweepIssues("o/r", () => ({ status: 0, stdout: "{}" }), {
        parseMarker: () => null,
        sweep: "s",
      }),
    /not a list/,
  );
});

test("issueComments flattens slurped pages", () => {
  const { spawn } = fakeSpawn(() => ({
    status: 0,
    stdout: JSON.stringify([[{ body: "a" }], [{ body: "b" }]]),
  }));
  assert.deepEqual(
    issueComments("o/r", 7, spawn).map((c) => c.body),
    ["a", "b"],
  );
});

test("issueWriter writes through gh with bodies on stdin", () => {
  const { spawn, calls } = fakeSpawn((cmd, args) =>
    args[1] === "create"
      ? { status: 0, stdout: "https://github.com/o/r/issues/42\n" }
      : { status: 0 },
  );
  const writer = issueWriter({ repo: "o/r", spawn, sweep: "s", log: () => {} });
  const created = writer.create({
    title: "T",
    labels: SWEEP_LABELS,
    milestone: "v2.0.0",
    body: "B",
  });
  assert.deepEqual(created, {
    url: "https://github.com/o/r/issues/42",
    number: 42,
  });
  writer.edit(42, { title: "T2", body: "B2" });
  writer.edit(42, { body: "B3" });
  writer.comment(42, "C");

  assert.deepEqual(calls[0].args, [
    "issue",
    "create",
    "--repo",
    "o/r",
    "--title",
    "T",
    "--label",
    "v2",
    "--label",
    "chore",
    "--label",
    "dependencies",
    "--milestone",
    "v2.0.0",
    "--body-file",
    "-",
  ]);
  assert.equal(calls[0].input, "B");
  assert.ok(calls[1].args.includes("--title"));
  assert.ok(!calls[2].args.includes("--title"));
  assert.deepEqual(calls[3].args.slice(0, 3), ["issue", "comment", "42"]);
  assert.equal(calls[3].input, "C");
});

test("issueWriter create without a milestone omits the flag", () => {
  const { spawn, calls } = fakeSpawn(() => ({
    status: 0,
    stdout: "https://x/issues/3",
  }));
  issueWriter({ repo: "o/r", spawn, sweep: "s" }).create({
    title: "T",
    labels: [],
    milestone: null,
    body: "B",
  });
  assert.ok(!calls[0].args.includes("--milestone"));
});

test("issueWriter surfaces gh failures and unreadable URLs", () => {
  const failing = issueWriter({
    repo: "o/r",
    spawn: () => ({ status: 1, stderr: "label not found" }),
    sweep: "s",
  });
  assert.throws(
    () =>
      failing.create({ title: "T", labels: [], milestone: null, body: "B" }),
    /label not found/,
  );
  assert.throws(() => failing.edit(1, { body: "B" }), /gh issue edit failed/);
  assert.throws(() => failing.comment(1, "C"), /gh issue comment failed/);
  const odd = issueWriter({
    repo: "o/r",
    spawn: () => ({ status: 0, stdout: "something odd" }),
    sweep: "s",
  });
  assert.throws(
    () => odd.create({ title: "T", labels: [], milestone: null, body: "B" }),
    /issue number/,
  );
});

test("a dry-run writer prints every payload and never calls gh", () => {
  const lines = [];
  const writer = issueWriter({
    repo: "o/r",
    spawn: () => assert.fail("a dry run must not spawn"),
    dryRun: true,
    sweep: "s",
    log: (line) => lines.push(line),
  });
  assert.deepEqual(
    writer.create({
      title: "T",
      labels: SWEEP_LABELS,
      milestone: "v2.0.0",
      body: "B",
    }),
    { url: null, number: null },
  );
  writer.create({ title: "T", labels: [], milestone: null, body: "B" });
  writer.edit(5, { title: "T2", body: "B2" });
  writer.comment(5, "C");
  const out = lines.join("\n");
  assert.match(out, /would create an issue/);
  assert.match(out, /labels: v2, chore, dependencies/);
  assert.match(out, /milestone: v2\.0\.0/);
  assert.match(out, /milestone: \(none: triage places it in Incoming\)/);
  assert.match(out, /would edit #5/);
  assert.match(out, /title: T2/);
  assert.match(out, /would comment on #5/);
  assert.match(out, /body:\nC/);
});
