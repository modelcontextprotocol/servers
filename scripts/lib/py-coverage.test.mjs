/**
 * Unit tests for scripts/lib/py-coverage.mjs (#4855), the per-file check
 * behind `npm run coverage:py`. Run with `node --test` — no `uv` or Python
 * needed: each case is a hand-built coverage.py JSON report.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  THRESHOLD,
  checkReport,
  describeFailures,
  formatPercent,
  formatTable,
  measure,
  readCoverageReport,
} from "./py-coverage.mjs";

const scratch = mkdtempSync(path.join(tmpdir(), "py-coverage-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A file entry shaped like coverage.py's JSON report. */
function entry(coveredLines, statements, coveredBranches, branches) {
  return {
    summary: {
      covered_lines: coveredLines,
      num_statements: statements,
      covered_branches: coveredBranches,
      num_branches: branches,
      percent_covered: 0, // coverage.py's blended figure; deliberately unused
    },
  };
}

const report = (files) => ({ meta: { branch_coverage: true }, files });

describe("THRESHOLD", () => {
  it("is 90", () => assert.equal(THRESHOLD, 90));
});

describe("measure", () => {
  it("passes exactly at the threshold", () => {
    assert.equal(measure(9, 10).ok, true);
    assert.equal(measure(90, 100).ok, true);
  });

  it("fails just below it, with no rounding up", () => {
    // 89.96%: a rounded display would read 90.0.
    const m = measure(8996, 10000);
    assert.equal(m.ok, false);
    assert.equal(formatPercent(m.percent), "89.9");
  });

  it("counts a dimension with nothing to measure as 100%", () => {
    assert.deepEqual(measure(0, 0), {
      covered: 0,
      total: 0,
      percent: 100,
      ok: true,
    });
  });

  it("takes the threshold as a parameter", () => {
    assert.equal(measure(5, 10, 50).ok, true);
    assert.equal(measure(4, 10, 50).ok, false);
  });
});

describe("checkReport", () => {
  it("passes a report whose every file clears both dimensions", () => {
    const result = checkReport(
      report({
        "src/pkg/server.py": entry(95, 100, 19, 20),
        "src/pkg/__init__.py": entry(10, 10, 2, 2),
      }),
    );
    assert.ok("verdicts" in result);
    assert.deepEqual(
      result.verdicts.map((v) => [v.file, v.ok]),
      [
        ["src/pkg/__init__.py", true],
        ["src/pkg/server.py", true],
      ],
    );
    assert.deepEqual(describeFailures(result.verdicts), []);
  });

  it("fails a file on lines alone, and names the file and the dimension", () => {
    const result = checkReport(
      report({ "src/pkg/server.py": entry(85, 100, 20, 20) }),
    );
    assert.ok("verdicts" in result);
    assert.equal(result.verdicts[0].ok, false);
    assert.deepEqual(describeFailures(result.verdicts), [
      "src/pkg/server.py: lines 85.0% (85/100) is below 90%",
    ]);
  });

  it("fails a file on branches alone, though its lines are at 100%", () => {
    // The case a global or lines-only gate would wave through.
    const result = checkReport(
      report({ "src/pkg/server.py": entry(100, 100, 7, 10) }),
    );
    assert.ok("verdicts" in result);
    assert.deepEqual(describeFailures(result.verdicts), [
      "src/pkg/server.py: branches 70.0% (7/10) is below 90%",
    ]);
  });

  it("checks each file on its own, not the total", () => {
    // Totals: 1050/1100 lines (95.5%), but one file is at 50%.
    const result = checkReport(
      report({
        "src/pkg/big.py": entry(1000, 1000, 0, 0),
        "src/pkg/small.py": entry(50, 100, 0, 0),
      }),
    );
    assert.ok("verdicts" in result);
    assert.deepEqual(describeFailures(result.verdicts), [
      "src/pkg/small.py: lines 50.0% (50/100) is below 90%",
    ]);
  });

  it("names both dimensions when a file fails both", () => {
    const result = checkReport(
      report({ "src/pkg/__main__.py": entry(0, 3, 0, 2) }),
    );
    assert.ok("verdicts" in result);
    assert.deepEqual(describeFailures(result.verdicts), [
      "src/pkg/__main__.py: lines 0.0% (0/3) is below 90%",
      "src/pkg/__main__.py: branches 0.0% (0/2) is below 90%",
    ]);
  });

  it("passes a file with no branches, and an empty file", () => {
    const result = checkReport(
      report({
        "src/pkg/__main__.py": entry(3, 3, 0, 0),
        "src/pkg/empty.py": entry(0, 0, 0, 0),
      }),
    );
    assert.ok("verdicts" in result);
    assert.ok(result.verdicts.every((v) => v.ok));
  });

  for (const [name, meta] of [
    ["branch_coverage: false", { branch_coverage: false }],
    ["no branch_coverage flag", {}],
    ["no meta at all", undefined],
  ]) {
    it(`rejects a report measured without branches (${name})`, () => {
      // coverage.py writes num_branches: 0 for every file when branch = true
      // is missing, which would otherwise count as 100% on branches.
      const result = checkReport({
        ...(meta === undefined ? {} : { meta }),
        files: { "src/pkg/server.py": entry(100, 100, 0, 0) },
      });
      assert.ok("error" in result);
      assert.match(result.error, /not measured with branch coverage/);
      assert.match(result.error, /branch = true/);
    });
  }

  it("rejects a report that measured no files, rather than passing it", () => {
    const result = checkReport(report({}));
    assert.ok("error" in result);
    assert.match(result.error, /measured no files/);
  });

  for (const [name, value] of [
    ["null", null],
    ["an array", []],
    ["a report with no files key", { meta: {} }],
    ["a report whose files is an array", { files: [] }],
  ]) {
    it(`rejects ${name}`, () => {
      const result = checkReport(value);
      assert.ok("error" in result);
      assert.match(result.error, /not a coverage\.py JSON report/);
    });
  }

  it("rejects a report with no branch data, pointing at branch = true", () => {
    const result = checkReport(
      report({
        "src/pkg/server.py": {
          summary: { covered_lines: 10, num_statements: 10 },
        },
      }),
    );
    assert.ok("error" in result);
    assert.match(result.error, /src\/pkg\/server\.py/);
    assert.match(result.error, /branch = true/);
  });

  it("rejects a file entry with no summary", () => {
    const result = checkReport(report({ "src/pkg/server.py": {} }));
    assert.ok("error" in result);
    assert.match(result.error, /no covered_lines\/num_statements/);
  });
});

describe("formatTable", () => {
  it("prints one row per file, marking the failing ones", () => {
    const result = checkReport(
      report({
        "src/pkg/server.py": entry(52, 100, 5, 10),
        "src/pkg/__init__.py": entry(10, 10, 0, 0),
      }),
    );
    assert.ok("verdicts" in result);
    const lines = formatTable(result.verdicts);
    assert.match(lines[0], />= 90% on lines and on branches/);
    assert.match(lines[1], /File\s+Lines\s+Branches/);
    assert.match(
      lines[2],
      /^ok\s+src\/pkg\/__init__\.py\s+100\.0% \(10\/10\)\s+100\.0% \(0\/0\)$/,
    );
    assert.match(
      lines[3],
      /^FAIL\s+src\/pkg\/server\.py\s+52\.0% \(52\/100\)\s+50\.0% \(5\/10\)$/,
    );
  });
});

describe("readCoverageReport", () => {
  it("parses a report from disk", () => {
    const file = path.join(scratch, "coverage.json");
    writeFileSync(file, JSON.stringify(report({ "a.py": entry(1, 1, 0, 0) })));
    const result = readCoverageReport(file);
    assert.ok("report" in result);
    assert.ok("verdicts" in checkReport(result.report));
  });

  it("names a missing report as not written, and why that happens", () => {
    const result = readCoverageReport(path.join(scratch, "absent.json"));
    assert.ok("error" in result);
    assert.match(result.error, /was not written/);
    assert.match(result.error, /pytest-cov/);
  });

  it("rejects a report that is not JSON", () => {
    const file = path.join(scratch, "broken.json");
    writeFileSync(file, "{ not json");
    const result = readCoverageReport(file);
    assert.ok("error" in result);
    assert.match(result.error, /is not valid JSON/);
  });
});
