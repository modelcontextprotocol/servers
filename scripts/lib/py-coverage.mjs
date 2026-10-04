/**
 * The per-file coverage check for the Python servers (#4855): reads the
 * `coverage.json` that `pytest --cov --cov-report=json` writes, and fails any
 * measured file below the threshold on lines or on branches.
 *
 * Why a script and not coverage.py's own `fail_under`: that setting is
 * **global**. It compares the total across every file, so one well-tested
 * module can carry an untested one over the line. The gate here is per file,
 * the same semantics as the TypeScript servers' per-file Vitest thresholds.
 *
 * Why lines and branches only: those are the dimensions coverage.py measures.
 * It has no native function dimension, and a Python "statement" is what it
 * already counts as a line (`num_statements`), so the TypeScript gate's four
 * dimensions collapse to two here.
 *
 * The semantics, which the unit tests pin:
 *
 *   - Every file in the report is checked; there is no exclude list. Code that
 *     genuinely cannot run is marked at the source with a justified
 *     `# pragma: no cover  # <reason>`, never dropped from the report here.
 *   - A file passes a dimension when `covered / total >= threshold / 100`,
 *     compared exactly in integers, so 89.96% fails rather than rounding up.
 *   - A dimension with nothing to measure (no statements, or no branches)
 *     counts as 100%: there is nothing in it left untested.
 *   - A report that is missing, unreadable, or measured no files at all is a
 *     failure, never a vacuous pass.
 *
 * Pure apart from `readCoverageReport`, so `node --test` covers it without
 * `uv` or Python.
 */
import { readFileSync } from "node:fs";

/** The per-file floor, in percent, on every dimension. */
export const THRESHOLD = 90;

/** The dimensions checked, with the `summary` fields each one reads. */
export const DIMENSIONS = [
  { name: "lines", covered: "covered_lines", total: "num_statements" },
  { name: "branches", covered: "covered_branches", total: "num_branches" },
];

/**
 * @typedef {{ covered: number, total: number, percent: number, ok: boolean }} Measure
 * @typedef {{ file: string, lines: Measure, branches: Measure, ok: boolean }} FileVerdict
 */

/**
 * One dimension of one file. Integer comparison, so no float rounding can
 * turn a failing ratio into a pass.
 * @param {number} covered
 * @param {number} total
 * @param {number} threshold
 * @returns {Measure}
 */
export function measure(covered, total, threshold = THRESHOLD) {
  if (total === 0) return { covered, total, percent: 100, ok: true };
  return {
    covered,
    total,
    percent: (covered / total) * 100,
    ok: covered * 100 >= threshold * total,
  };
}

/**
 * A percentage for display, truncated (never rounded up) to one decimal, so a
 * failing 89.96% is never printed as a passing-looking 90.0.
 * @param {number} percent
 * @returns {string}
 */
export function formatPercent(percent) {
  return (Math.floor(percent * 10) / 10).toFixed(1);
}

/**
 * Check a parsed coverage.py JSON report.
 * @param {unknown} report
 * @param {number} [threshold]
 * @returns {{ verdicts: FileVerdict[] } | { error: string }}
 */
export function checkReport(report, threshold = THRESHOLD) {
  const files =
    report && typeof report === "object" && "files" in report
      ? /** @type {{ files: unknown }} */ (report).files
      : undefined;
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    return { error: "not a coverage.py JSON report (no `files` object)" };
  }
  const names = Object.keys(files).sort();
  if (names.length === 0) {
    return {
      error:
        "the report measured no files; check [tool.coverage.run] source in pyproject.toml",
    };
  }
  /** @type {FileVerdict[]} */
  const verdicts = [];
  for (const file of names) {
    const summary = /** @type {Record<string, unknown>} */ (files)[file]
      ?.summary;
    /** @type {Record<string, Measure>} */
    const measures = {};
    for (const dim of DIMENSIONS) {
      const covered = summary?.[dim.covered];
      const total = summary?.[dim.total];
      if (!Number.isInteger(covered) || !Number.isInteger(total)) {
        return {
          error: `${file}: summary has no ${dim.covered}/${dim.total}${
            dim.name === "branches"
              ? " (is [tool.coverage.run] branch = true set?)"
              : ""
          }`,
        };
      }
      measures[dim.name] = measure(covered, total, threshold);
    }
    verdicts.push({
      file,
      lines: measures.lines,
      branches: measures.branches,
      ok: measures.lines.ok && measures.branches.ok,
    });
  }
  return { verdicts };
}

/**
 * Read and parse a coverage.json file.
 * @param {string} file
 * @returns {{ report: unknown } | { error: string }}
 */
export function readCoverageReport(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    return {
      error:
        code === "ENOENT"
          ? `${file} was not written (is pytest-cov a dev dependency, and did the run reach the report?)`
          : `cannot read ${file}: ${/** @type {Error} */ (err).message}`,
    };
  }
  try {
    return { report: JSON.parse(text) };
  } catch (err) {
    return {
      error: `${file} is not valid JSON: ${/** @type {Error} */ (err).message}`,
    };
  }
}

/**
 * A per-file table: one row per file, a FAIL marker on any row below the
 * threshold.
 * @param {FileVerdict[]} verdicts
 * @param {number} [threshold]
 * @returns {string[]}
 */
export function formatTable(verdicts, threshold = THRESHOLD) {
  const cell = (/** @type {Measure} */ m) =>
    `${formatPercent(m.percent)}% (${m.covered}/${m.total})`;
  const rows = verdicts.map((v) => [
    v.ok ? "ok" : "FAIL",
    v.file,
    cell(v.lines),
    cell(v.branches),
  ]);
  const header = ["", "File", "Lines", "Branches"];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const line = (/** @type {string[]} */ cells) =>
    cells
      .map((c, i) => c.padEnd(widths[i]))
      .join("  ")
      .trimEnd();
  return [
    `Per-file coverage (gate: >= ${threshold}% on lines and on branches)`,
    line(header),
    ...rows.map(line),
  ];
}

/**
 * One message per file and dimension below the threshold, naming both.
 * @param {FileVerdict[]} verdicts
 * @param {number} [threshold]
 * @returns {string[]}
 */
export function describeFailures(verdicts, threshold = THRESHOLD) {
  const messages = [];
  for (const v of verdicts) {
    for (const dim of DIMENSIONS) {
      const m = v[/** @type {"lines" | "branches"} */ (dim.name)];
      if (!m.ok) {
        messages.push(
          `${v.file}: ${dim.name} ${formatPercent(m.percent)}% (${m.covered}/${m.total}) is below ${threshold}%`,
        );
      }
    }
  }
  return messages;
}
