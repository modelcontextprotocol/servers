// Pins the path by which a version PR opened by automation gets CI (#5110),
// DCO and the Everything diff (#5173).
//
// The Version Packages and Prepare Python Release workflows push their PR
// branches with the workflow token, which starts no workflow (GitHub holds a
// `pull_request` run as `action_required`), so they dispatch `typescript.yml`,
// `python.yml` and `dco.yml` on the branch instead, and Version Packages
// `everything-mcp-diff.yml` too. A dispatched run's checks are left out of the
// status rollup a pull request reads, so each dispatched workflow also mirrors
// its run onto the commit as a status. Both version workflows run only from `v2/main`, so nothing
// exercises this path before a release needs it; if any link here breaks,
// version PRs silently go back to having no visible CI. Each test names the
// link it guards.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");
const workflow = (name) => parse(read(`.github/workflows/${name}`));

// `trigger` is the event the workflow runs on when a person pushes; the
// workflow token's version of that event starts no run, hence the dispatch.
// `pendingChecksNewer`: the pending job, like the result job, stays silent
// when a newer dispatched run exists (#5222); the CI workflows' pending jobs
// do not yet (#5223).
const CI = [
  {
    file: "typescript.yml",
    context: "TypeScript (dispatched)",
    trigger: "push",
  },
  { file: "python.yml", context: "Python (dispatched)", trigger: "push" },
  {
    file: "dco.yml",
    context: "DCO (dispatched)",
    trigger: "pull_request",
    pendingChecksNewer: true,
  },
  {
    file: "everything-mcp-diff.yml",
    context: "Everything diff (dispatched)",
    trigger: "pull_request",
    pendingChecksNewer: true,
  },
];
// The Python stamps touch none of the Everything diff's paths, so its
// `pull_request` run would never have started there.
const VERSION_WORKFLOWS = [
  {
    file: "version-packages.yml",
    job: "version",
    dispatches: [
      "typescript.yml",
      "python.yml",
      "dco.yml",
      "everything-mcp-diff.yml",
    ],
  },
  {
    file: "prepare-python-release.yml",
    job: "prepare",
    dispatches: ["typescript.yml", "python.yml", "dco.yml"],
  },
];

for (const { file, context, trigger } of CI) {
  const wf = workflow(file);
  const jobs = wf.jobs;
  const pending = jobs["dispatch-status-pending"];
  const result = jobs["dispatch-status"];

  test(`${file} runs on ${trigger} and can be dispatched`, () => {
    assert.ok(trigger in wf.on, `${trigger} trigger`);
    assert.ok("workflow_dispatch" in wf.on, "workflow_dispatch trigger");
  });

  test(`${file} reports a dispatched run as pending, then its result`, () => {
    for (const job of [pending, result]) {
      assert.ok(job, "both status jobs exist");
      assert.match(job.if, /github\.event_name == 'workflow_dispatch'/);
      assert.equal(job.permissions.statuses, "write");
      const run = job.steps.map((s) => s.run ?? "").join("\n");
      assert.match(run, /statuses\/\$GITHUB_SHA/);
      assert.ok(run.includes(`context="${context}"`), `context ${context}`);
    }
  });

  test(`${file}'s result job waits on every other job, even after a cancel`, () => {
    const others = Object.keys(jobs).filter((id) => id !== "dispatch-status");
    assert.deepEqual([...result.needs].sort(), others.sort());
    // `always()`: a cancelled run must not leave the status pending.
    assert.match(result.if, /always\(\)/);
    assert.equal(result.permissions.actions, "read");
    const run = result.steps.map((s) => s.run ?? "").join("\n");
    assert.ok(run.includes(`gh run list --workflow ${file}`));
    assert.match(run, /STATE=error/);
  });
}

// Run a `dispatch-status` (or `-pending`) script with a stub `gh` on PATH. The stub answers
// `gh run list` with the number of newer dispatched runs and records every
// other call, so a test sees exactly which status, if any, the run posts.
function runStatusScript(script, { needs = {}, newer }) {
  const dir = mkdtempSync(path.join(tmpdir(), "dispatch-status-"));
  try {
    const calls = path.join(dir, "calls");
    writeFileSync(calls, "");
    writeFileSync(
      path.join(dir, "gh"),
      [
        "#!/usr/bin/env bash",
        `if [ "$1 $2" = "run list" ]; then echo ${newer}; exit 0; fi`,
        `printf '%s\\n' "$*" >> "${calls}"`,
      ].join("\n"),
    );
    chmodSync(path.join(dir, "gh"), 0o755);
    const result = spawnSync("bash", ["-e", "-c", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}${path.delimiter}${process.env.PATH}`,
        NEEDS: JSON.stringify(needs),
        GITHUB_SHA: "0123abcd",
        GITHUB_RUN_ID: "100",
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_SERVER_URL: "https://github.com",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const posted = readFileSync(calls, "utf8").trim();
    return posted ? posted.match(/state=(\w+)/)?.[1] : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The job's script needs bash and jq, as on the ubuntu runner. Without
// either (Windows, or a machine with no jq), skip rather than fail the gate
// over a missing test prerequisite.
const hasTool = (cmd) => spawnSync(cmd, ["--version"]).status === 0;
const SCRIPT_SKIP =
  process.platform === "win32"
    ? "runs the job's bash script"
    : !hasTool("bash")
      ? "needs bash"
      : !hasTool("jq")
        ? "needs jq, which the job's script calls"
        : false;

const FAILED = { a: { result: "failure" }, b: { result: "cancelled" } };
const PASSED = { a: { result: "success" }, b: { result: "skipped" } };
const CANCELLED = { a: { result: "success" }, b: { result: "cancelled" } };

for (const { file } of CI) {
  const script = workflow(file).jobs["dispatch-status"].steps[0].run;

  // #5178: the newer-run check guarded only the cancellation branch, so a
  // superseded run whose job had already failed posted `failure` over the
  // newer run's status. A superseded run now posts nothing at all.
  test(
    `${file}: a superseded run posts no status, whatever its jobs did`,
    {
      skip: SCRIPT_SKIP,
    },
    () => {
      for (const needs of [FAILED, PASSED, CANCELLED])
        assert.equal(runStatusScript(script, { needs, newer: 1 }), null);
    },
  );

  test(
    `${file}: the latest run posts success, failure or error`,
    {
      skip: SCRIPT_SKIP,
    },
    () => {
      assert.equal(
        runStatusScript(script, { needs: PASSED, newer: 0 }),
        "success",
      );
      assert.equal(
        runStatusScript(script, { needs: FAILED, newer: 0 }),
        "failure",
      );
      assert.equal(
        runStatusScript(script, { needs: CANCELLED, newer: 0 }),
        "error",
      );
    },
  );
}

for (const { file } of CI.filter((c) => c.pendingChecksNewer)) {
  const pending = workflow(file).jobs["dispatch-status-pending"];

  // A superseded run's pending job (a late start, or a re-run, which keeps
  // its run ID) must not reset the newer run's result to pending: its own
  // result job would stay silent and leave it there.
  test(
    `${file}: a superseded run posts no pending status`,
    { skip: SCRIPT_SKIP },
    () => {
      assert.equal(pending.permissions.actions, "read");
      const script = pending.steps[0].run;
      assert.equal(runStatusScript(script, { newer: 1 }), null);
      assert.equal(runStatusScript(script, { newer: 0 }), "pending");
    },
  );
}

for (const { file, job, dispatches } of VERSION_WORKFLOWS) {
  const steps = workflow(file).jobs[job];

  test(`${file} dispatches ${dispatches.join(", ")} on its PR's branch`, () => {
    assert.equal(steps.permissions.actions, "write");
    const run = steps.steps.map((s) => s.run ?? "").join("\n");
    assert.match(run, /gh workflow run "\$workflow" --ref "\$BRANCH"/);
    const loop = run.match(/for workflow in ([^;]+); do/);
    assert.ok(loop, "the dispatch loop");
    assert.deepEqual(loop[1].trim().split(/\s+/), dispatches);
  });
}

// A dispatched DCO run has no pull request, so it falls back to the branch
// tip and the script's default base, and is grouped by its branch: a shared
// group would let one version PR's dispatch cancel the other's.
test("dco.yml checks a dispatched run against origin/v2/main", () => {
  const wf = workflow("dco.yml");
  assert.match(
    wf.concurrency.group,
    /github\.event\.pull_request\.number \|\| github\.ref/,
  );
  const [checkout, , check] = wf.jobs.dco.steps;
  assert.match(checkout.with.ref, /\|\| github\.sha/);
  assert.match(check.env.BASE_SHA, /\|\| 'origin\/v2\/main'/);
  assert.match(check.env.HEAD_SHA, /\|\| github\.sha/);
});

test("RELEASING.md names the statuses a version PR is merged on", () => {
  const releasing = read("RELEASING.md");
  for (const { context } of CI)
    assert.ok(releasing.includes(`\`${context}\``), context);
  assert.doesNotMatch(releasing, /Close and reopen the PR to run CI/);
});
