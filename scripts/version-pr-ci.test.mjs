// Pins the path by which a version PR opened by automation gets CI (#5110).
//
// The Version Packages and Prepare Python Release workflows push their PR
// branches with the workflow token, which starts no workflow, so they
// dispatch `typescript.yml` and `python.yml` on the branch instead. A
// dispatched run's checks are left out of the status rollup a pull request
// reads, so each CI workflow also mirrors a dispatched run onto the commit as
// a status. Both version workflows run only from `v2/main`, so nothing
// exercises this path before a release needs it; if any link here breaks,
// version PRs silently go back to having no visible CI. Each test names the
// link it guards.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");
const workflow = (name) => parse(read(`.github/workflows/${name}`));

const CI = [
  { file: "typescript.yml", context: "TypeScript (dispatched)" },
  { file: "python.yml", context: "Python (dispatched)" },
];
const VERSION_WORKFLOWS = [
  { file: "version-packages.yml", job: "version" },
  { file: "prepare-python-release.yml", job: "prepare" },
];

for (const { file, context } of CI) {
  const wf = workflow(file);
  const jobs = wf.jobs;
  const pending = jobs["dispatch-status-pending"];
  const result = jobs["dispatch-status"];

  test(`${file} runs on push and can be dispatched`, () => {
    assert.ok("push" in wf.on, "push trigger");
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

for (const { file, job } of VERSION_WORKFLOWS) {
  const steps = workflow(file).jobs[job];

  test(`${file} dispatches both CI workflows on its PR's branch`, () => {
    assert.equal(steps.permissions.actions, "write");
    const run = steps.steps.map((s) => s.run ?? "").join("\n");
    assert.match(run, /gh workflow run "\$workflow" --ref "\$BRANCH"/);
    assert.match(run, /for workflow in typescript\.yml python\.yml; do/);
  });
}

test("RELEASING.md names the statuses a version PR is merged on", () => {
  const releasing = read("RELEASING.md");
  for (const { context } of CI)
    assert.ok(releasing.includes(`\`${context}\``), context);
  assert.doesNotMatch(releasing, /Close and reopen the PR to run CI/);
});
