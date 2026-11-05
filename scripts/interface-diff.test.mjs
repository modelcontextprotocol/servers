// Tests for the MCP interface diff (#4860, every server since #5428). The pure
// halves are exercised here: the argument parser, which servers a run covers,
// the start command each build is probed with, the verdict drawn from
// `mcp-server-diff`'s JSON (the one thing that decides whether the gate and
// the CI job fail), and the report. Building a base and probing two servers is
// what `npm run interface-diff` itself does as a gate stage, so it is not
// repeated here; which servers a change selects is
// `lib/interface-diff-servers.test.mjs`. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseServers,
  classify,
  fenceFor,
  main,
  parseArgs,
  renderReport,
  startCommand,
} from "./interface-diff.mjs";
import { SERVERS } from "./lib/interface-diff-servers.mjs";

const counts = { tools: 13, prompts: 4, resources: 7, resourceTemplates: 2 };
const cliJson = (result) =>
  JSON.stringify({ timestamp: "t", results: [result], summary: {} });

const defaults = {
  base: null,
  reportDir: null,
  servers: [],
  all: false,
  list: false,
};

test("parseArgs reads every flag, in either spelling", () => {
  assert.deepEqual(parseArgs([]), defaults);
  assert.deepEqual(parseArgs(["--base", "abc", "--report-dir", "out"]), {
    ...defaults,
    base: "abc",
    reportDir: "out",
  });
  assert.deepEqual(parseArgs(["--base=v1.0.0", "--report-dir=a=b"]), {
    ...defaults,
    base: "v1.0.0",
    reportDir: "a=b",
  });
  assert.deepEqual(parseArgs(["--server", "git", "--server=time", "--list"]), {
    ...defaults,
    servers: ["git", "time"],
    list: true,
  });
  assert.deepEqual(parseArgs(["--all"]), { ...defaults, all: true });
});

test("parseArgs refuses an unknown flag or server, or a missing value", () => {
  assert.throws(() => parseArgs(["--fail-on-diff"]), /unknown argument/);
  assert.throws(() => parseArgs(["--base"]), /--base needs a value/);
  assert.throws(() => parseArgs(["--base="]), /--base needs a value/);
  assert.throws(() => parseArgs(["--server"]), /--server needs a value/);
  // A typo must not read as "nothing to diff".
  assert.throws(() => parseArgs(["--server", "evrything"]), /unknown server/);
  assert.throws(() => parseArgs(["--list=yes"]), /--list takes no value/);
  assert.throws(
    () => parseArgs(["--all", "--server", "git"]),
    /cannot be combined/,
  );
});

test("chooseServers: --all and --server need no history; bare selects by change", () => {
  const noHistory = () => {
    throw new Error("read the history");
  };
  assert.deepEqual(
    chooseServers({ ...defaults, all: true }, noHistory).map((s) => s.server),
    SERVERS.map((s) => s.name),
  );
  // The table's order, whatever order they were named in.
  assert.deepEqual(
    chooseServers({ ...defaults, servers: ["time", "fetch"] }, noHistory),
    [
      { server: "fetch", language: "py", reason: "it was named (`--server`)" },
      { server: "time", language: "py", reason: "it was named (`--server`)" },
    ],
  );
  assert.deepEqual(
    chooseServers(defaults, () => ({
      changedFiles: ["src/memory/index.ts", "README.md"],
      baseLock: null,
      headLock: null,
    })).map((s) => s.server),
    ["memory"],
  );
});

test("startCommand launches each build from its own root, with its arguments", () => {
  const byName = (n) => SERVERS.find((s) => s.name === n);
  const dir = "node_modules/.cache/x/scratch/s";
  assert.equal(
    startCommand(byName("everything"), "", dir),
    "node src/everything/dist/index.js stdio",
  );
  assert.equal(
    startCommand(byName("filesystem"), "node_modules/.cache/x/base", dir),
    `node node_modules/.cache/x/base/src/filesystem/dist/index.js ${dir}`,
  );
  // A Python head reads the synced environment; it never builds one.
  assert.equal(
    startCommand(byName("git"), "", dir),
    `uv run --frozen --no-sync --project src/git mcp-server-git --repository ${dir}`,
  );
  assert.equal(
    startCommand(byName("time"), "b", dir),
    "uv run --frozen --no-sync --project b/src/time mcp-server-time --local-timezone UTC",
  );
  assert.equal(
    startCommand(byName("sequentialthinking"), "", dir),
    "node src/sequentialthinking/dist/index.js",
  );
});

test("main exits 2 on a bad command line, before building anything", async (t) => {
  // The usage error it prints is expected; keep it out of the test output.
  const error = t.mock.method(console, "error", () => {});
  assert.equal(await main(["--nope"]), 2);
  assert.match(String(error.mock.calls[0]?.arguments[0]), /unknown argument/);
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
      error: "boom",
      diffs: [{ endpoint: "error", diff: "Target probe failed: boom" }],
    }),
  );
  assert.equal(v.status, "error");
  // The context (which build failed) comes from the diffs entry.
  assert.equal(v.error, "Target probe failed: boom");
});

test("output that is not the JSON report is an error, never a pass", () => {
  assert.equal(classify("").status, "error");
  assert.equal(classify("Fatal error: x").status, "error");
  assert.equal(classify("{}").status, "error");
  assert.equal(classify(JSON.stringify({ results: [] })).status, "error");
  assert.equal(classify(JSON.stringify({ results: [{}] })).status, "error");
});

test("a CLI crash before the report carries its stderr as the reason", () => {
  const v = classify("", "Fatal error: Error: spawn node ENOENT");
  assert.equal(v.status, "error");
  assert.match(v.error, /no JSON report[\s\S]*spawn node ENOENT/);
});

test("fenceFor outruns any backticks in the content", () => {
  assert.equal(fenceFor("plain"), "```");
  assert.equal(fenceFor("a ``` b"), "````");
  assert.equal(fenceFor("`````"), "``````");
});

test("the report leads with the verdict and shows each changed part", () => {
  const labels = {
    server: "time",
    base: "`base`",
    head: "`head`",
    reason: "`src/time/x.py` changed",
  };
  assert.match(
    renderReport({ status: "unchanged", diffs: [] }, labels),
    /^## `time`: MCP interface diff\n[\s\S]*Diffed because `src\/time\/x\.py` changed\./,
  );
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
