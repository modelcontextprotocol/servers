#!/usr/bin/env node
// Guard: no test is allowed to retry (#4871).
//
// A retry turns a test that fails some of the time into a test that passes,
// and the pre-push gate is the only thing between that test and `v2/main`. A
// race, a leaked port, a timeout too tight for a loaded machine: each is a
// defect in the test or the code, and a retry reports it as green. So the rule
// is that a red run stays red, and whoever sees it fixes the cause.
//
// Adapted from the retry half of the MCP Inspector's `verify:test-timeouts`.
// That guard also resolves every Vitest project's wall-clock budgets against a
// shared table; the budget machinery is sized for six Vitest projects and a
// browser, so it is not ported (docs/agent-guidance-inception.md §2). Only the
// no-retry assertion is.
//
// It reads SOURCE rather than resolving each Vitest config, for two reasons.
// A retry can be declared in more places than the config (a test's own
// options, a CLI flag in an npm script, a pytest plugin), and one scan sees
// all of them. And it covers both languages with one mechanism, without
// needing either toolchain installed. The cost is that it matches spellings,
// not semantics, so the patterns below are the ones each runner documents:
//
//   Vitest   `retry:` in a config or a test's options; `--retry` on the CLI
//   pytest   the `pytest-rerunfailures` / `flaky` plugins, their `--reruns`
//            flag, and the `@pytest.mark.flaky` / `@flaky` decorators
//
// A match inside a comment or an ordinary string is still a match: this guard
// cannot parse two languages, and a false positive costs one reworded comment
// while a false negative costs the rule. A finding names the file and line.
//
// Scope: tracked files under `src/`, plus every `package.json` (root included)
// and every workflow for the CLI flags (`npx vitest --retry=2` in a step would
// otherwise pass both this guard and the workflow guard). Build output is never tracked, so it never appears.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * The spellings of a retry, each with the files it applies to.
 * The Vitest option is matched as an object key in each way one can be
 * written: bare (`retry:`), quoted (`"retry":`) and computed (`["retry"]:`).
 * The bare form is anchored on a non-identifier character before it so that a
 * property named `maxRetry:` or a member access like `client.retry:` is not
 * read as the option.
 */
export const RULES = [
  {
    id: "vitest-retry-option",
    files: /\.(?:[cm]?[jt]s|[jt]sx)$/,
    pattern: /(?<![\w$.])(?:retry|(["'`])retry\1|\[\s*(["'`])retry\2\s*\])\s*:/,
    why: "Vitest's `retry` option",
  },
  {
    id: "vitest-retry-flag",
    files: /(?:^|\/)package\.json$/,
    pattern: /--retry\b/,
    why: "Vitest's `--retry` flag",
  },
  {
    // Tied to the runner's name on the same line: `--retry` alone is also a
    // curl flag, which a workflow may use legitimately.
    id: "workflow-retry-flag",
    files: /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/,
    pattern: /\b(?:vitest|pytest)\b.*--(?:retry|reruns|force-flaky)\b/,
    why: "a test runner's retry flag in a workflow",
  },
  {
    id: "pytest-rerun-plugin",
    files: /(?:^|\/)(?:pyproject\.toml|uv\.lock)$/,
    pattern: /\b(?:pytest-rerunfailures|flaky)\b/,
    why: "a pytest rerun plugin",
  },
  {
    id: "pytest-reruns-flag",
    files: /(?:^|\/)(?:pyproject\.toml|pytest\.ini|setup\.cfg|tox\.ini)$/,
    pattern: /--reruns\b|--force-flaky\b/,
    why: "pytest's rerun flag",
  },
  {
    id: "pytest-flaky-marker",
    files: /\.py$/,
    pattern: /@(?:pytest\.mark\.)?flaky\b/,
    why: "pytest's flaky marker",
  },
];

/**
 * Pure: the retry declarations in one file's text.
 *
 * @param {string} file repo-relative POSIX path
 * @param {string} text
 * @returns {{ file: string, line: number, rule: string, why: string, text: string }[]}
 */
export function findRetries(file, text) {
  const rules = RULES.filter((r) => r.files.test(file));
  if (rules.length === 0) return [];
  const findings = [];
  text.split("\n").forEach((lineText, index) => {
    for (const rule of rules) {
      if (rule.pattern.test(lineText))
        findings.push({
          file,
          line: index + 1,
          rule: rule.id,
          why: rule.why,
          text: lineText.trim(),
        });
    }
  });
  return findings;
}

/** Tracked files the rules could apply to, as repo-relative POSIX paths. */
function trackedFiles(root) {
  const res = spawnSync(
    "git",
    ["ls-files", "-z", "--", "src", "package.json", ".github/workflows"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.error) throw res.error;
  if (res.status !== 0)
    throw new Error(`git ls-files exited ${res.status}: ${res.stderr.trim()}`);
  return res.stdout.split("\0").filter(Boolean);
}

/**
 * @param {string} [root]
 * @param {(root: string) => string[]} [list] the file lister; a test seam
 * @returns {number} the exit code
 */
export function main(root = repoRoot, list = trackedFiles) {
  const files = list(root).filter((f) => RULES.some((r) => r.files.test(f)));
  // Deny-by-default: a lister that returns nothing (a moved `src/`, a broken
  // pathspec) would otherwise pass as "no retries anywhere".
  if (files.length === 0) {
    console.error(
      "verify:no-test-retries — found no files to check, so the guard would pass vacuously.",
    );
    return 1;
  }
  const findings = files.flatMap((file) =>
    findRetries(file, readFileSync(path.join(root, file), "utf8")),
  );
  if (findings.length > 0) {
    console.error(
      `verify:no-test-retries — ${findings.length} retry declaration(s):\n` +
        findings
          .map((f) => `  ${f.file}:${f.line}  [${f.rule}]  ${f.why}: ${f.text}`)
          .join("\n") +
        "\n\nA retry turns a test that sometimes fails into one that passes. Remove it and" +
        "\nfix what makes the test fail: a race is fixed with fake timers or an awaited" +
        "\ncondition, a port collision with a port the OS hands out.",
    );
    return 1;
  }
  console.log(
    `verify:no-test-retries — OK (${files.length} files, no test retries declared)`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main());
