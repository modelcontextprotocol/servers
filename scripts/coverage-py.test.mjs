/**
 * Unit tests for scripts/coverage-py.mjs (#4855), the runner behind
 * `npm run coverage:py`. No `uv` needed: the command runner, the report
 * reader and the report removal are injected. The per-file check itself is
 * tested in lib/py-coverage.test.mjs.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { REPORT, STEPS, coverServers, summarize } from "./coverage-py.mjs";

const entry = (cl, st, cb, br) => ({
  summary: {
    covered_lines: cl,
    num_statements: st,
    covered_branches: cb,
    num_branches: br,
  },
});

const passing = { files: { "src/pkg/server.py": entry(10, 10, 4, 4) } };
const failing = {
  files: {
    "src/pkg/server.py": entry(5, 10, 4, 4),
    "src/pkg/__main__.py": entry(0, 3, 1, 2),
  },
};

/** Run coverServers with every side effect recorded instead of performed. */
function harness({ runs = {}, reports = {} } = {}) {
  const calls = [];
  const removed = [];
  const results = coverServers({
    servers: Object.keys(reports),
    srcDir: "/repo/src",
    run: (argv, cwd) => {
      const server = path.basename(cwd);
      const step = STEPS.find((s) => s.argv === argv).name;
      calls.push(`${server}: ${step}`);
      return runs[`${server}: ${step}`] ?? { ok: true };
    },
    readReport: (file) => {
      const server = path.basename(path.dirname(file));
      const report = reports[server];
      return report === undefined
        ? { error: `${file} was not written` }
        : { report };
    },
    removeReport: (file) => removed.push(file),
    log: () => {},
  });
  return { results, calls, removed };
}

describe("STEPS", () => {
  it("syncs --locked, then runs pytest under coverage --frozen", () => {
    assert.deepEqual(
      STEPS.map((s) => s.argv.join(" ")),
      [
        "uv sync --locked --all-extras --dev",
        "uv run --frozen pytest --cov --cov-report=term-missing --cov-report=json",
      ],
    );
  });

  it("writes the report the check reads", () => {
    assert.equal(REPORT, "coverage.json");
  });
});

describe("coverServers", () => {
  it("passes a server whose every file clears the gate", () => {
    const { results, calls } = harness({ reports: { fetch: passing } });
    assert.deepEqual(results, [{ server: "fetch" }]);
    assert.deepEqual(calls, ["fetch: sync", "fetch: pytest --cov"]);
  });

  it("removes a stale report before running", () => {
    const { removed } = harness({ reports: { fetch: passing, git: passing } });
    assert.deepEqual(removed, [
      path.join("/repo/src/fetch", REPORT),
      path.join("/repo/src/git", REPORT),
    ]);
  });

  it("names every file and dimension below the gate", () => {
    const { results } = harness({ reports: { time: failing } });
    assert.equal(results[0].failedStep, "per-file check");
    assert.equal(results[0].detail, "3 below 90%");
    assert.deepEqual(results[0].failures, [
      "src/pkg/__main__.py: lines 0.0% (0/3) is below 90%",
      "src/pkg/__main__.py: branches 50.0% (1/2) is below 90%",
      "src/pkg/server.py: lines 50.0% (5/10) is below 90%",
    ]);
  });

  it("stops a server at its first failing step and carries on to the next", () => {
    const { results, calls } = harness({
      reports: { fetch: passing, git: passing, time: failing },
      runs: { "fetch: pytest --cov": { ok: false, detail: "exit 1" } },
    });
    assert.deepEqual(calls, [
      "fetch: sync",
      "fetch: pytest --cov",
      "git: sync",
      "git: pytest --cov",
      "time: sync",
      "time: pytest --cov",
    ]);
    assert.deepEqual(
      results.map((r) => [r.server, r.failedStep]),
      [
        ["fetch", "pytest --cov"],
        ["git", undefined],
        ["time", "per-file check"],
      ],
    );
  });

  it("fails a server whose run wrote no report", () => {
    const { results } = harness({ reports: { fetch: undefined } });
    assert.equal(results[0].failedStep, "per-file check");
    assert.match(results[0].detail, /was not written/);
  });

  it("fails a server whose report measured nothing", () => {
    const { results } = harness({ reports: { fetch: { files: {} } } });
    assert.equal(results[0].failedStep, "per-file check");
    assert.match(results[0].detail, /measured no files/);
  });
});

describe("summarize", () => {
  it("exits 0 when every server passes", () => {
    const { lines, exitCode } = summarize([{ server: "fetch" }]);
    assert.deepEqual(lines, ["  PASS  fetch"]);
    assert.equal(exitCode, 0);
  });

  it("exits 1 and lists each failing file under its server", () => {
    const { lines, exitCode } = summarize([
      { server: "fetch" },
      {
        server: "time",
        failedStep: "per-file check",
        detail: "1 below 90%",
        failures: [
          "src/mcp_server_time/server.py: lines 69.7% (…) is below 90%",
        ],
      },
      { server: "git", failedStep: "sync", detail: "exit 2" },
    ]);
    assert.deepEqual(lines, [
      "  PASS  fetch",
      "  FAIL  time — per-file check (1 below 90%)",
      "          src/time/src/mcp_server_time/server.py: lines 69.7% (…) is below 90%",
      "  FAIL  git — sync (exit 2)",
    ]);
    assert.equal(exitCode, 1);
  });
});
