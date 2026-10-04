/**
 * The local-gate-out-of-CI guard and the job-timeout guard (#4871), in two
 * halves each.
 *
 * The table-driven half pins one case per rule the parser encodes, including
 * the negative cases, which matter most here: a guard that also rejected a
 * step merely *named* after the gate, or a comment about it, would be "fixed"
 * by deleting it, taking the real protection with it.
 *
 * The second half runs the guards over the repository's ACTUAL workflow files
 * and root manifest. That is the assertion #4871 asks for: it fails the moment
 * a workflow invokes a `local:*` script, a job loses its `timeout-minutes`, or
 * `local:gate` stops being exactly the lease wrapper around its stages.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  VIOLATION,
  extractExecutableRegions,
  findJobsWithoutTimeout,
  findWorkflowViolations,
  formatWorkflowViolations,
  workflowCommands,
} from "./workflow-gate.mjs";
import {
  GATE_LEASE_WRAPPER,
  reachableScripts,
  scriptChainRuns,
} from "./npm-scripts.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const workflowDir = join(repoRoot, ".github", "workflows");

/**
 * A minimal but SCHEMA-VALID workflow around some step YAML. The walk is
 * structural, so a bare `- run: …` fragment sits in no job and no step and is
 * correctly invisible; a table built out of fragments would assert nothing.
 */
const workflow = (steps, jobExtra = []) =>
  [
    "on: push",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
    ...jobExtra,
    "    steps:",
    steps,
  ].join("\n");

describe("findWorkflowViolations", () => {
  const LOCAL = [VIOLATION.LOCAL_SCRIPT];
  const cases = [
    {
      name: "an inline run of the gate",
      text: workflow("      - run: npm run local:gate"),
      rules: LOCAL,
    },
    {
      name: "the gate's inner stages script",
      text: workflow("      - run: npm run local:gate:stages"),
      rules: LOCAL,
    },
    {
      name: "a block scalar",
      text: workflow("      - run: |\n          npm run local:gate"),
      rules: LOCAL,
    },
    {
      name: "a block scalar whose indicator carries a comment",
      text: workflow(
        "      - run: | # why this step exists\n          npm run local:gate",
      ),
      rules: LOCAL,
    },
    {
      name: "a command reached through a YAML alias",
      text: workflow(
        ["      - name: &cmd npm run local:gate", "        run: *cmd"].join(
          "\n",
        ),
      ),
      rules: LOCAL,
    },
    {
      name: "an action input that carries the command",
      text: workflow("      - with:\n          args: npm run local:gate"),
      rules: LOCAL,
    },
    {
      name: "a step-level custom shell template",
      text: workflow(
        "      - shell: npm run local:gate && bash {0}\n        run: echo hi",
      ),
      rules: LOCAL,
    },
    {
      name: "a job-level default shell template",
      text: workflow("      - run: echo hi", [
        "    defaults:",
        "      run:",
        "        shell: npm run local:gate && bash {0}",
      ]),
      rules: LOCAL,
    },
    {
      name: "a job-level env value",
      text: workflow("      - run: echo hi", [
        "    env:",
        "      TASK: npm run local:gate",
      ]),
      rules: LOCAL,
    },
    {
      name: "a name built from a workflow expression",
      text: workflow("      - run: npm run local:${{ matrix.task }}"),
      rules: LOCAL,
    },
    {
      name: "a name built from an expression that itself contains braces",
      text: workflow(
        "      - run: npm run local:${{ format('{0}', matrix.task) }}",
      ),
      rules: LOCAL,
    },
    {
      name: "a name built from a shell variable",
      text: workflow("      - run: npm run local:$TASK"),
      rules: LOCAL,
    },
    {
      name: "two invocations in one script are two findings",
      text: workflow(
        "      - run: |\n          npm run local:gate\n          npm run local:other",
      ),
      rules: [...LOCAL, ...LOCAL],
    },
    // The negatives: none of these executes a local script.
    {
      name: "the checks CI is meant to run",
      text: workflow(
        "      - run: npm run validate:guards\n      - run: npm run verify:skills:cli\n      - run: npm run smoke",
      ),
      rules: [],
    },
    {
      name: "a step name that mentions the gate",
      text: workflow(
        "      - name: Explain why local:gate stays local\n        run: npm run validate",
      ),
      rules: [],
    },
    {
      name: "a YAML comment that mentions the gate",
      text: workflow(
        "      # npm run local:gate is the pre-push gate, never run here\n      - run: npm run validate",
      ),
      rules: [],
    },
    {
      name: "a shell comment inside a run block",
      text: workflow(
        "      - run: |\n          # local:gate runs this too\n          npm run validate",
      ),
      rules: [],
    },
    {
      name: "a workflow input whose default documents the gate",
      text: [
        "on:",
        "  workflow_dispatch:",
        "    inputs:",
        "      env:",
        "        description: mirrors npm run local:gate",
        "        default: npm run local:gate",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: npm run validate",
      ].join("\n"),
      rules: [],
    },
    {
      name: "a word that merely ends in `local`",
      text: workflow("      - run: echo nonlocal:thing"),
      rules: [],
    },
  ];

  for (const { name, text, rules } of cases) {
    it(name, () => {
      const found = findWorkflowViolations(text, "case.yml");
      assert.deepEqual(
        found.map((f) => f.rule),
        rules,
        formatWorkflowViolations(found),
      );
    });
  }

  it("reports the line a finding came from", () => {
    const [finding] = findWorkflowViolations(
      workflow("      - run: npm run local:gate"),
      "typescript.yml",
    );
    assert.equal(finding.line, 6);
    assert.equal(finding.file, "typescript.yml");
    assert.equal(finding.match, "local:gate");
  });

  it("names the file in a parse error, rather than a placeholder", () => {
    assert.throws(
      () => findWorkflowViolations("jobs:\n  - a\n  b: c\n", "typescript.yml"),
      /could not parse typescript\.yml/,
    );
  });
});

describe("extractExecutableRegions", () => {
  it("descends the executable paths and skips the metadata beside them", () => {
    const regions = extractExecutableRegions(
      [
        "on: push",
        "jobs:",
        "  build:",
        "    steps:",
        "      - name: local:gate is local-only",
        "        env:",
        "          PORT: 3001",
        "        run: npm run smoke",
      ].join("\n"),
    );
    // The step `name:` is absent, and the two executable values are not.
    // Order follows the walk (a step's `run` before its `env`), not the file.
    assert.deepEqual(
      regions.map((r) => [r.kind, r.text.trim()]),
      [
        ["run", "npm run smoke"],
        ["env", "PORT: 3001"],
      ],
    );
  });

  it("throws on a workflow it cannot parse, rather than finding nothing", () => {
    assert.throws(
      () => extractExecutableRegions("jobs:\n  - a\n  b: c\n", "broken.yml"),
      /could not parse broken\.yml/,
    );
  });
});

describe("findJobsWithoutTimeout", () => {
  const job = (...lines) =>
    ["on: push", "jobs:", "  build:", ...lines].join("\n");
  const steps = ["    runs-on: ubuntu-latest", "    steps:", "      - run: x"];
  const cases = [
    { name: "a job with a timeout", extra: ["    timeout-minutes: 10"], n: 0 },
    {
      name: "a timeout given as an expression",
      extra: ["    timeout-minutes: ${{ matrix.minutes }}"],
      n: 0,
    },
    { name: "a job with none", extra: [], n: 1 },
    { name: "a zero timeout", extra: ["    timeout-minutes: 0"], n: 1 },
    { name: "an empty timeout", extra: ["    timeout-minutes:"], n: 1 },
    {
      name: "a quoted number, which Actions does not read as one",
      extra: ['    timeout-minutes: "10"'],
      n: 1,
    },
  ];
  for (const { name, extra, n } of cases) {
    it(name, () => {
      const found = findJobsWithoutTimeout(job(...extra, ...steps), "c.yml");
      assert.equal(found.length, n, formatWorkflowViolations(found));
      for (const f of found) assert.equal(f.rule, VIOLATION.NO_TIMEOUT);
    });
  }

  it("exempts a reusable-workflow call, which cannot carry the key", () => {
    assert.deepEqual(
      findJobsWithoutTimeout(job("    uses: ./.github/workflows/x.yml")),
      [],
    );
  });

  it("names the job and its line", () => {
    const [finding] = findJobsWithoutTimeout(job(...steps), "python.yml");
    assert.equal(finding.match, "build");
    assert.equal(finding.line, 3);
    assert.equal(finding.file, "python.yml");
  });

  it("throws on a workflow it cannot parse", () => {
    assert.throws(
      () => findJobsWithoutTimeout("jobs:\n  - a\n  b: c\n", "broken.yml"),
      /could not parse broken\.yml/,
    );
  });
});

describe("workflowCommands", () => {
  it("collects the scripts a workflow's steps run, and its triggers", () => {
    const cmds = workflowCommands(
      [
        "on:",
        "  push:",
        "  pull_request:",
        "jobs:",
        "  build:",
        "    steps:",
        "      - name: npm run not-a-command",
        "        run: |",
        "          # npm run commented-out",
        "          npm run validate:guards && npm run smoke",
        "      - run: node scripts/validate-py.mjs ${{ matrix.package }}",
        "      - run: node --test scripts/validate-py.test.mjs",
      ].join("\n"),
    );
    assert.deepEqual(cmds, {
      onChange: true,
      npmScripts: ["smoke", "validate:guards"],
      nodeScripts: ["scripts/validate-py.mjs"],
    });
  });

  it("a dispatch-only workflow is not a check on a change", () => {
    for (const on of ["on: workflow_dispatch", "on: [workflow_dispatch]"])
      assert.equal(
        workflowCommands(`${on}\njobs:\n  a:\n    steps:\n      - run: x\n`)
          .onChange,
        false,
      );
    assert.equal(
      workflowCommands("on: push\njobs:\n  a:\n    steps:\n      - run: x\n")
        .onChange,
      true,
    );
  });
});

describe("the gate's name", () => {
  const { scripts } = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );

  it("is `local:gate`, and is exactly the lease wrapper around its stages", () => {
    // Nothing may sit beside the wrapper: a stage placed there would run
    // outside the lease, and the assertions below about what the gate runs
    // could no longer read `local:gate:stages` alone.
    assert.equal(
      scripts["local:gate"],
      `${GATE_LEASE_WRAPPER}npm run local:gate:stages`,
    );
  });

  it("has no npm lifecycle hooks around it", () => {
    // npm runs `pre<name>` and `post<name>` implicitly. A hook on `local:gate`
    // would run outside the lease, and one on `local:gate:stages` would be a
    // stage that the stage list does not show.
    for (const hook of [
      "prelocal:gate",
      "postlocal:gate",
      "prelocal:gate:stages",
      "postlocal:gate:stages",
    ])
      assert.equal(scripts[hook], undefined, `${hook} must not exist`);
  });

  it("checks the install before anything is tested against it", () => {
    assert.match(
      scripts["local:gate:stages"],
      /^npm run verify:install-fresh && /,
    );
  });

  // The stages by name. The CI-parity test under `.github/workflows` derives
  // the same requirement from what the workflows actually run; this list also
  // pins the stage that has no CI counterpart (`verify:install-fresh`), and the
  // root `coverage` (#4854), whose CI legs run each workspace's `coverage`.
  for (const stage of [
    "verify:install-fresh",
    "validate",
    "validate:guards",
    "coverage",
    "validate:py",
    "coverage:py",
    "verify:skills:cli",
    "smoke",
  ]) {
    it(`runs \`${stage}\``, () => {
      assert.ok(
        scriptChainRuns(scripts, "local:gate", stage),
        `local:gate must run ${stage}`,
      );
    });
  }
});

describe(".github/workflows", () => {
  const files = readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f));
  const read = (file) => readFileSync(join(workflowDir, file), "utf8");

  it("has workflow files to check", () => {
    // Deny-by-default: an empty glob would otherwise make the checks below
    // pass vacuously after a rename or a move of the workflow directory.
    assert.ok(
      files.length > 0,
      `no workflow files found in ${workflowDir} — the guards below would pass vacuously`,
    );
  });

  it("never invokes a local-only script", () => {
    const findings = files.flatMap((file) =>
      findWorkflowViolations(read(file), file),
    );
    assert.deepEqual(
      findings,
      [],
      `GitHub CI must not run a local-only script:\n${formatWorkflowViolations(findings)}`,
    );
  });

  it("runs no check on a change that local:gate does not also run", () => {
    // "local:gate runs every check CI runs", derived rather than listed: every
    // npm script and every `scripts/*.mjs` a push/pull-request workflow invokes
    // must be reached by the gate. A check added to CI alone fails here.
    const { scripts } = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    );
    const reached = reachableScripts(scripts, "local:gate");
    const reachedBodies = [...reached].map((n) => scripts[n] ?? "");
    const missing = [];
    let checked = 0;
    for (const file of files) {
      const cmds = workflowCommands(read(file), file);
      if (!cmds.onChange) continue;
      for (const name of cmds.npmScripts) {
        checked += 1;
        if (!reached.has(name)) missing.push(`${file}: npm run ${name}`);
      }
      for (const script of cmds.nodeScripts) {
        checked += 1;
        if (!reachedBodies.some((body) => body.includes(`node ${script}`)))
          missing.push(`${file}: node ${script}`);
      }
    }
    assert.ok(
      checked > 0,
      "found no CI commands, so parity would hold vacuously",
    );
    assert.deepEqual(
      missing,
      [],
      `CI runs these and \`npm run local:gate\` does not. Add each to local:gate:stages:\n  ${missing.join("\n  ")}`,
    );
  });

  it("bounds every job with timeout-minutes", () => {
    const findings = files.flatMap((file) =>
      findJobsWithoutTimeout(read(file), file),
    );
    assert.deepEqual(
      findings,
      [],
      `every CI job needs a timeout:\n${formatWorkflowViolations(findings)}`,
    );
  });
});
