// Tests for the `everything` interface diff (#4860). The pure halves are
// exercised here: the argument parser, the verdict drawn from
// `mcp-server-diff`'s JSON (the one thing that decides whether the gate and
// the CI job fail), and the report. Building a base and probing two servers is
// what `npm run interface-diff` itself does as a gate stage, so it is not
// repeated here. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  fenceFor,
  main,
  parseArgs,
  renderReport,
} from "./interface-diff.mjs";

const counts = { tools: 13, prompts: 4, resources: 7, resourceTemplates: 2 };
const cliJson = (result) =>
  JSON.stringify({ timestamp: "t", results: [result], summary: {} });

test("parseArgs reads both flags, in either spelling", () => {
  assert.deepEqual(parseArgs([]), { base: null, reportDir: null });
  assert.deepEqual(parseArgs(["--base", "abc", "--report-dir", "out"]), {
    base: "abc",
    reportDir: "out",
  });
  assert.deepEqual(parseArgs(["--base=v1.0.0", "--report-dir=a=b"]), {
    base: "v1.0.0",
    reportDir: "a=b",
  });
});

test("parseArgs refuses an unknown flag or a missing value", () => {
  assert.throws(() => parseArgs(["--fail-on-diff"]), /unknown argument/);
  assert.throws(() => parseArgs(["--base"]), /--base needs a value/);
  assert.throws(() => parseArgs(["--base="]), /--base needs a value/);
});

test("main exits 2 on a bad command line, before building anything", async () => {
  assert.equal(await main(["--nope"]), 2);
});

test("an identical interface is unchanged", () => {
  const v = classify(
    cliJson({
      hasDifferences: false,
      baseCounts: counts,
      targetCounts: counts,
      diffs: [],
    }),
  );
  assert.equal(v.status, "unchanged");
  assert.deepEqual(v.headCounts, counts);
});

test("a difference is a change, not an error", () => {
  const diffs = [{ endpoint: "tools", diff: "- a\n+ b" }];
  const v = classify(
    cliJson({
      hasDifferences: true,
      baseCounts: counts,
      targetCounts: counts,
      diffs,
    }),
  );
  assert.equal(v.status, "changed");
  assert.deepEqual(v.diffs, diffs);
});

test("a probe failure is an error, though the CLI reports it as a difference", () => {
  // mcp-server-diff sets hasDifferences on a failed probe too, and exits 1
  // for both; only the `error` field tells them apart.
  const v = classify(
    cliJson({
      hasDifferences: true,
      error: "Target probe failed: boom",
      diffs: [{ endpoint: "error", diff: "Target probe failed: boom" }],
    }),
  );
  assert.equal(v.status, "error");
  assert.match(v.error, /boom/);
});

test("output that is not the JSON report is an error, never a pass", () => {
  assert.equal(classify("").status, "error");
  assert.equal(classify("Fatal error: x").status, "error");
  assert.equal(classify("{}").status, "error");
  assert.equal(classify(JSON.stringify({ results: [] })).status, "error");
});

test("fenceFor outruns any backticks in the content", () => {
  assert.equal(fenceFor("plain"), "```");
  assert.equal(fenceFor("a ``` b"), "````");
  assert.equal(fenceFor("`````"), "``````");
});

test("the report leads with the verdict and shows each changed part", () => {
  const labels = { base: "`base`", head: "`head`" };
  assert.match(
    renderReport(
      {
        status: "unchanged",
        diffs: [],
        baseCounts: counts,
        headCounts: counts,
      },
      labels,
    ),
    /No interface changes detected[\s\S]*\| Head \| 13 \| 4 \| 7 \| 2 \|/,
  );
  const changed = renderReport(
    {
      status: "changed",
      diffs: [{ endpoint: "tools", diff: "- x ``` y" }],
      baseCounts: counts,
      headCounts: counts,
    },
    labels,
  );
  assert.match(changed, /Interface changes detected/);
  assert.match(changed, /### tools\n\n````diff\n- x ``` y\n````/);
  assert.match(
    renderReport({ status: "error", error: "boom", diffs: [] }, labels),
    /could not run[\s\S]*boom/,
  );
});
