// Tests for the no-test-retries guard (#4871). `findRetries` is table-driven,
// one case per spelling and the near-misses that must not match; `main` runs
// against a throwaway tree, so the file filter, the vacuous-pass refusal and
// the exit status are covered too. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findRetries, main } from "./verify-no-test-retries.mjs";

const rulesOf = (file, text) => findRetries(file, text).map((f) => f.rule);

/** A schema-valid workflow around one step's keys (indented eight spaces). */
const step = (keys) =>
  `on: push\njobs:\n  build:\n    steps:\n      -\n${keys}\n`;

const cases = [
  // Vitest
  ["src/a/vitest.config.ts", "  test: { retry: 2 },", ["vitest-retry-option"]],
  [
    "src/a/__tests__/x.test.ts",
    'it("x", { retry: 3 }, fn)',
    ["vitest-retry-option"],
  ],
  ["src/a/__tests__/x.test.ts", "  retry : 1,", ["vitest-retry-option"]],
  [
    "src/a/vitest.config.ts",
    '  test: { "retry": 2 },',
    ["vitest-retry-option"],
  ],
  [
    "src/a/vitest.config.ts",
    "  test: { 'retry': 2 },",
    ["vitest-retry-option"],
  ],
  [
    "src/a/vitest.config.ts",
    '  test: { ["retry"]: 2 },',
    ["vitest-retry-option"],
  ],
  [
    "src/a/vitest.config.ts",
    "  test: { [ `retry` ]: 2 },",
    ["vitest-retry-option"],
  ],
  [
    "src/a/package.json",
    '"test": "vitest run --retry=2"',
    ["vitest-retry-flag"],
  ],
  ["package.json", '"test": "vitest run --retry 2"', ["vitest-retry-flag"]],
  // A workflow step
  [
    ".github/workflows/typescript.yml",
    step("        run: npx vitest run --retry=2"),
    ["workflow-retry-flag"],
  ],
  [
    ".github/workflows/python.yml",
    step("        run: uv run pytest --reruns 3"),
    ["workflow-retry-flag"],
  ],
  [
    // A folded scalar: Actions joins these lines into one command.
    ".github/workflows/python.yml",
    step("        run: >\n          uv run pytest\n          --reruns 3"),
    ["workflow-retry-flag"],
  ],
  [
    // A literal block: two commands, and the flag is not the runner's.
    ".github/workflows/python.yml",
    step("        run: |\n          uv run pytest\n          curl --retry 3 x"),
    [],
  ],
  [
    ".github/workflows/release.yml",
    step("        run: curl --retry 3 https://example.com"),
    [],
  ],
  [
    // A step name runs nothing.
    ".github/workflows/python.yml",
    step(
      "        name: pytest --reruns 3 is forbidden\n        run: uv run pytest",
    ),
    [],
  ],
  // pytest
  [
    "src/b/pyproject.toml",
    'dev = ["pytest-rerunfailures>=14"]',
    ["pytest-rerun-plugin"],
  ],
  ["src/b/pyproject.toml", 'dev = ["flaky>=3"]', ["pytest-rerun-plugin"]],
  [
    "src/b/pyproject.toml",
    'dev = ["pytest-retry>=1.6"]',
    ["pytest-rerun-plugin"],
  ],
  ["src/b/pyproject.toml", 'addopts = "--retries 2"', ["pytest-reruns-flag"]],
  ["src/b/pyproject.toml", "retries = 2", ["pytest-reruns-flag"]],
  ["src/b/pyproject.toml", "max_retries = 2", []],
  ["src/b/tests/test_x.py", "@pytest.mark.retries(2)", ["pytest-flaky-marker"]],
  [
    "src/b/tests/test_x.py",
    "pytestmark = pytest.mark.flaky(reruns=2)",
    ["pytest-flaky-marker"],
  ],
  [
    "src/b/tests/test_x.py",
    "pytest.param(1, marks=pytest.mark.retries(2)),",
    ["pytest-flaky-marker"],
  ],
  [
    ".github/workflows/python.yml",
    step("        run: uv run pytest --retries 2"),
    ["workflow-retry-flag"],
  ],
  ["src/b/uv.lock", 'name = "pytest-rerunfailures"', ["pytest-rerun-plugin"]],
  ["src/b/pyproject.toml", 'addopts = "--reruns 3"', ["pytest-reruns-flag"]],
  [
    "src/b/tests/test_x.py",
    "@pytest.mark.flaky(reruns=3)",
    ["pytest-flaky-marker"],
  ],
  ["src/b/tests/test_x.py", "@flaky", ["pytest-flaky-marker"]],
  // Near-misses: none of these declares a retry.
  [
    "src/a/__tests__/x.test.ts",
    "// would complete it, retry, hit the same error",
    [],
  ],
  ["src/a/lib.ts", "const maxRetry: number = 3;", []],
  ["src/a/lib.ts", 'const o = { "maxRetry": 3, "retryAfter": 1 };', []],
  ["src/a/lib.ts", "options.retry = 2;", []],
  ["src/a/lib.ts", "client.retry: nope", []],
  ["src/b/server.py", "retry: int = 3", []],
  ["src/b/tests/test_x.py", "def test_flaky_network(): ...", []],
  ["src/a/README.md", "retry: 3", []],
  ["src/a/package.json", '"description": "retry logic"', []],
];

for (const [file, text, rules] of cases) {
  test(`${file}: ${text}`, () => {
    assert.deepEqual(rulesOf(file, text), rules);
  });
}

test("a flag on a continuation line is found", () => {
  const found = findRetries(
    ".github/workflows/python.yml",
    step(
      [
        "        run: |",
        "          uv run pytest \\",
        "            -q \\",
        "            --reruns 3",
        "          echo done",
      ].join("\n"),
    ),
  );
  // Reported at the step's `run:` line: a block scalar is one region.
  assert.deepEqual(
    found.map((f) => [f.rule, f.line, f.text]),
    [["workflow-retry-flag", 6, "uv run pytest -q --reruns 3"]],
  );
});

test("a finding carries its file, line and the offending text", () => {
  const [finding] = findRetries(
    "src/a/vitest.config.ts",
    "export default {\n  test: { retry: 2 },\n};",
  );
  assert.equal(finding.file, "src/a/vitest.config.ts");
  assert.equal(finding.line, 2);
  assert.equal(finding.text, "test: { retry: 2 },");
});

function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), "no-retries-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return { root, list: () => Object.keys(files) };
}

test("main passes a tree with no retries", (t) => {
  const { root, list } = fixture(t, {
    "src/a/vitest.config.ts": "export default { test: {} };",
    "src/a/README.md": "retry: 3",
  });
  const log = t.mock.method(console, "log", () => {});
  assert.equal(main(root, list), 0);
  assert.match(log.mock.calls[0].arguments[0], /OK \(1 files/);
});

test("main fails a tree with a retry, naming the file and line", (t) => {
  const { root, list } = fixture(t, {
    "src/a/vitest.config.ts": "export default {\n  test: { retry: 2 },\n};",
  });
  const error = t.mock.method(console, "error", () => {});
  assert.equal(main(root, list), 1);
  assert.match(
    error.mock.calls[0].arguments[0],
    /src\/a\/vitest\.config\.ts:2 {2}\[vitest-retry-option\]/,
  );
});

test("main refuses to pass when there is nothing to check", (t) => {
  const { root, list } = fixture(t, { "src/a/README.md": "x" });
  const error = t.mock.method(console, "error", () => {});
  assert.equal(main(root, list), 1);
  assert.match(error.mock.calls[0].arguments[0], /vacuously/);
});
