#!/usr/bin/env node
/**
 * The Python coverage gate (#4855): runs each Python server's suite under
 * coverage and fails any file below 90% on lines or on branches.
 *
 *   node scripts/coverage-py.mjs            # every server under src/ with a pyproject.toml
 *   node scripts/coverage-py.mjs fetch      # just the named ones
 *   npm run coverage:py [-- <server> …]     # the root entry point
 *
 * Per server, in its own directory: a locked sync, then
 * `uv run --frozen pytest --cov --cov-report=term-missing --cov-report=json`,
 * which prints coverage.py's own missing-lines report and writes
 * `coverage.json`; then the per-file check in `lib/py-coverage.mjs` reads that
 * file. What is measured is each server's `[tool.coverage.run]` in its
 * `pyproject.toml` (`branch = true`, `source` = its package), so this script
 * names no paths of its own.
 *
 * Coverage is its own command, not a flag on the fast `uv run pytest` loop or
 * a step of `validate:py`: instrumented runs are slower, and a per-file floor
 * is a verdict on a finished change, not on each edit.
 *
 * Shaped like `validate-py.mjs`, whose discovery and runner it reuses: servers
 * are discovered rather than listed, a server stops at its first failing step,
 * and the run carries on to the next server so one run reports every verdict.
 * CI calls the same script with one server per matrix leg.
 *
 * A stale `coverage.json` is deleted before each run, so a run that dies
 * before writing a new one fails as "not written" instead of being judged on
 * an old report.
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  THRESHOLD,
  checkReport,
  describeFailures,
  formatTable,
  readCoverageReport,
} from "./lib/py-coverage.mjs";
import { discoverServers, runCommand, selectServers } from "./validate-py.mjs";

/** The report the coverage step writes, relative to the server directory. */
export const REPORT = "coverage.json";

/** What runs in each server before the report is checked, in order. */
export const STEPS = [
  { name: "sync", argv: ["uv", "sync", "--locked", "--all-extras", "--dev"] },
  {
    name: "pytest --cov",
    argv: [
      "uv",
      "run",
      "--frozen",
      "pytest",
      "--cov",
      "--cov-report=term-missing",
      "--cov-report=json",
    ],
  },
];

/**
 * @typedef {{
 *   server: string,
 *   failedStep?: string,
 *   detail?: string,
 *   failures?: string[],
 * }} ServerResult
 */

/**
 * Run each server's steps, then check its report. A server's run stops at
 * its first failing step; the next server runs either way.
 * @param {{
 *   servers: string[],
 *   srcDir: string,
 *   steps?: typeof STEPS,
 *   run?: (argv: string[], cwd: string) => { ok: boolean, detail?: string },
 *   readReport?: (file: string) => { report: unknown } | { error: string },
 *   removeReport?: (file: string) => void,
 *   threshold?: number,
 *   log?: (line: string) => void,
 * }} options
 * @returns {ServerResult[]}
 */
export function coverServers({
  servers,
  srcDir,
  steps = STEPS,
  run = runCommand,
  readReport = readCoverageReport,
  removeReport = (file) => rmSync(file, { force: true }),
  threshold = THRESHOLD,
  log = console.log,
}) {
  /** @type {ServerResult[]} */
  const results = [];
  for (const server of servers) {
    const cwd = path.join(srcDir, server);
    const reportPath = path.join(cwd, REPORT);
    removeReport(reportPath);
    results.push(
      coverOne({
        server,
        cwd,
        reportPath,
        steps,
        run,
        readReport,
        threshold,
        log,
      }),
    );
  }
  return results;
}

/**
 * @param {{
 *   server: string,
 *   cwd: string,
 *   reportPath: string,
 *   steps: typeof STEPS,
 *   run: (argv: string[], cwd: string) => { ok: boolean, detail?: string },
 *   readReport: (file: string) => { report: unknown } | { error: string },
 *   threshold: number,
 *   log: (line: string) => void,
 * }} options
 * @returns {ServerResult}
 */
function coverOne({
  server,
  cwd,
  reportPath,
  steps,
  run,
  readReport,
  threshold,
  log,
}) {
  for (const step of steps) {
    log(`\n[coverage:py] ${server}: ${step.name}`);
    const outcome = run(step.argv, cwd);
    if (!outcome.ok) {
      return { server, failedStep: step.name, detail: outcome.detail };
    }
  }
  log(`\n[coverage:py] ${server}: per-file check`);
  const read = readReport(reportPath);
  if ("error" in read) {
    return { server, failedStep: "per-file check", detail: read.error };
  }
  const checked = checkReport(read.report, threshold);
  if ("error" in checked) {
    return { server, failedStep: "per-file check", detail: checked.error };
  }
  for (const line of formatTable(checked.verdicts, threshold)) log(line);
  const failures = describeFailures(checked.verdicts, threshold);
  if (failures.length > 0) {
    return {
      server,
      failedStep: "per-file check",
      detail: `${failures.length} below ${threshold}%`,
      failures,
    };
  }
  return { server };
}

/**
 * The summary lines and the exit code the results imply. Every file and
 * dimension below the threshold is named, under its server.
 * @param {ServerResult[]} results
 * @returns {{ lines: string[], exitCode: number }}
 */
export function summarize(results) {
  const lines = [];
  for (const r of results) {
    if (r.failedStep === undefined) {
      lines.push(`  PASS  ${r.server}`);
      continue;
    }
    lines.push(
      `  FAIL  ${r.server} — ${r.failedStep}${r.detail ? ` (${r.detail})` : ""}`,
    );
    for (const failure of r.failures ?? []) {
      lines.push(`          src/${r.server}/${failure}`);
    }
  }
  const exitCode = results.some((r) => r.failedStep !== undefined) ? 1 : 0;
  return { lines, exitCode };
}

function main() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const srcDir = path.join(repoRoot, "src");
  const selection = selectServers(
    process.argv.slice(2),
    discoverServers(srcDir),
  );
  if ("error" in selection) {
    console.error(`[coverage:py] ${selection.error}`);
    return 2;
  }
  const results = coverServers({ servers: selection.servers, srcDir });
  const { lines, exitCode } = summarize(results);
  console.log(["\n[coverage:py] summary", ...lines].join("\n"));
  if (exitCode !== 0 && results.some((r) => r.failures)) {
    console.log(
      `\n[coverage:py] Every file must reach ${THRESHOLD}% on lines and on branches. Add tests for the missing lines above;` +
        " mark only genuinely unreachable code with `# pragma: no cover  # <reason>`, and never lower the gate.",
    );
  }
  return exitCode;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
