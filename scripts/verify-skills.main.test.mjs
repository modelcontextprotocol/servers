// Fixture-level tests for `verify-skills`'s orchestration (inspector#2163, Copilot).
//
// `skill-manifest.test.mjs` covers the parsers; this covers `main()` — that the
// guard actually *reports* what those parsers find, and exits nonzero when it
// does. Without it, the mandatory gate could stop enforcing its checks while
// every parser test stayed green, which is the same "a gate that stops gating"
// failure the sibling guards' `*.main.test.mjs` suites exist to prevent.
//
// Each case builds a throwaway skills directory and runs the real script
// against it via the directory argument. Run via `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MIN_POSITIVE_CASES } from "./lib/skill-manifest.mjs";

import {
  checkWiring,
  ciRunsUnconditionally,
  EMPTY_SKILLS_BOOTSTRAP,
  emptySkillsVerdict,
  GUARDS_WORKFLOW,
  runsCommand,
  WIRING_ALLOWANCES,
} from "./verify-skills.mjs";
import { GATE_LEASE_WRAPPER, scriptChainRuns } from "./lib/npm-scripts.mjs";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "verify-skills.mjs",
);

/**
 * Build a skills directory.
 *
 * @param {Record<string, {skill?: string, evals?: string}>} skills
 */
function fixture(skills) {
  const root = mkdtempSync(path.join(tmpdir(), "verify-skills-"));
  for (const [name, { skill, evals }] of Object.entries(skills)) {
    const dir = path.join(root, name);
    mkdirSync(dir, { recursive: true });
    if (skill !== undefined) writeFileSync(path.join(dir, "SKILL.md"), skill);
    if (evals !== undefined) {
      mkdirSync(path.join(dir, "evals"), { recursive: true });
      writeFileSync(path.join(dir, "evals", "evals.json"), evals);
    }
  }
  return root;
}

function run(dir) {
  const res = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
  return { code: res.status, out: (res.stdout ?? "") + (res.stderr ?? "") };
}

const byName = (name, extra = "") =>
  `---\nname: ${name}\ndescription: A description.\ndisable-model-invocation: true\n${extra}---\n\nBody\n`;

const modelInvoked = (name) =>
  `---\nname: ${name}\ndescription: A description.\ndisable-model-invocation: false\n---\n\nBody\n`;

// Clears the same MIN_POSITIVE_CASES floor the real eval files must, so this
// fixture keeps meaning "well-formed" as that floor moves.
const goodEvals = (name) =>
  JSON.stringify([
    ...Array.from({ length: MIN_POSITIVE_CASES }, (_, i) => ({
      prompt: `fires ${i}`,
      expect: name,
    })),
    { prompt: "does not", expect: null },
  ]);

test("passes a well-formed directory", () => {
  const dir = fixture({
    alpha: { skill: byName("alpha") },
    beta: { skill: modelInvoked("beta"), evals: goodEvals("beta") },
  });
  const { code, out } = run(dir);
  assert.equal(code, 0, out);
  assert.match(out, /2 skills, 1 model-invoked \(beta\)/);
  rmSync(dir, { recursive: true, force: true });
});

test("fails an empty or missing directory", () => {
  const empty = mkdtempSync(path.join(tmpdir(), "verify-skills-empty-"));
  assert.match(run(empty).out, /no skills found/);
  assert.equal(run(empty).code, 1);
  assert.equal(run(path.join(empty, "nope")).code, 1);
  rmSync(empty, { recursive: true, force: true });
});

test("fails a skill directory with no SKILL.md", () => {
  const dir = fixture({ alpha: {} });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /alpha: no SKILL\.md/);
  rmSync(dir, { recursive: true, force: true });
});

test("fails frontmatter that would load with empty metadata", () => {
  // The failure the guard exists for: `/alpha` still works, so a spot check
  // passes, while the description the model matches against is gone.
  const dir = fixture({
    alpha: {
      skill:
        "---\nname: alpha\ndescription: Use this: always\ndisable-model-invocation: true\n---\n",
    },
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /not valid YAML/);
  rmSync(dir, { recursive: true, force: true });
});

test("fails a skill that does not declare its invocation mode", () => {
  const dir = fixture({
    alpha: { skill: "---\nname: alpha\ndescription: d\n---\n" },
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /must be declared explicitly/);
  rmSync(dir, { recursive: true, force: true });
});

test("a hand-off case is checked against the whole model-invoked set", () => {
  // The ordering trap this pins: `zeta` sorts AFTER `beta`, so validating each
  // file as it is read would reject a chain through `zeta` as unknown purely
  // because of where the alphabet put it.
  const withChain = (chain) =>
    JSON.stringify([
      ...JSON.parse(goodEvals("beta")),
      { prompt: "reached the long way", chain },
    ]);

  const ok = fixture({
    beta: { skill: modelInvoked("beta"), evals: withChain(["zeta", "beta"]) },
    zeta: { skill: modelInvoked("zeta"), evals: goodEvals("zeta") },
  });
  const passed = run(ok);
  assert.equal(passed.code, 0, passed.out);
  rmSync(ok, { recursive: true, force: true });

  // A link the model cannot invoke can never fire, so it would score a
  // permanent 0% that reads as a description problem rather than a typo.
  const bad = fixture({
    alpha: { skill: byName("alpha") },
    beta: { skill: modelInvoked("beta"), evals: withChain(["alpha", "beta"]) },
  });
  const failed = run(bad);
  assert.equal(failed.code, 1);
  assert.match(failed.out, /`alpha`, which is not a model-invoked skill/);
  rmSync(bad, { recursive: true, force: true });
});

test("fails a model-invoked skill with no eval cases", () => {
  const dir = fixture({ beta: { skill: modelInvoked("beta") } });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /need committed eval cases/);
  rmSync(dir, { recursive: true, force: true });
});

test("fails eval cases that are unreadable, all-positive, or all-negative", () => {
  for (const [evals, pattern] of [
    ["{ not json", /not valid JSON/],
    [
      JSON.stringify(
        Array.from({ length: MIN_POSITIVE_CASES }, (_, i) => ({
          prompt: `a${i}`,
          expect: "beta",
        })),
      ),
      /no negative case/,
    ],
    // Below the floor is its own failure, distinct from having none at all.
    [
      JSON.stringify([
        { prompt: "a", expect: "beta" },
        { prompt: "b", expect: null },
      ]),
      /needs at least 5 to cover the range/,
    ],
    [JSON.stringify([{ prompt: "a", expect: null }]), /no positive case/],
    [JSON.stringify([{ expect: null }]), /prompt/],
  ]) {
    const dir = fixture({ beta: { skill: modelInvoked("beta"), evals } });
    const { code, out } = run(dir);
    assert.equal(code, 1, out);
    assert.match(out, pattern);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails when the skill listing exceeds its budget", () => {
  // Only model-invoked skills occupy the listing, so the same text behind
  // `disable-model-invocation: true` must NOT trip it.
  const long = "d".repeat(1500);
  const many = {};
  for (let i = 0; i < 4; i++) {
    many[`skill-${i}`] = {
      skill: `---\nname: skill-${i}\ndescription: ${long}\ndisable-model-invocation: false\n---\n`,
      evals: goodEvals(`skill-${i}`),
    };
  }
  const over = fixture(many);
  const { code, out } = run(over);
  assert.equal(code, 1);
  assert.match(out, /over its recorded budget/);
  rmSync(over, { recursive: true, force: true });

  const quiet = {};
  for (let i = 0; i < 4; i++) {
    quiet[`skill-${i}`] = {
      skill: `---\nname: skill-${i}\ndescription: ${long}\ndisable-model-invocation: true\n---\n`,
    };
  }
  const under = fixture(quiet);
  assert.equal(run(under).code, 0);
  rmSync(under, { recursive: true, force: true });
});

test("reports every offender in one pass rather than dying on the first", () => {
  const dir = fixture({
    alpha: {},
    beta: { skill: modelInvoked("beta") },
    gamma: {
      skill:
        "---\nname: wrong-name\ndescription: d\ndisable-model-invocation: true\n---\n",
    },
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /3 problem\(s\)/);
  rmSync(dir, { recursive: true, force: true });
});

// --- wiring vouch -----------------------------------------------------------
//
// The gates cannot detect being unrun, so they vouch for each other — the same
// cycle the sibling guards use. `checkWiring` is the pure half of that, driven
// here with fixture inputs; the other half (`verify:format-coverage` noticing
// `verify:skills` gone from `validate`) lives in that guard.
//
// Three distinct links, each of which would otherwise disappear in silence:
// `verify:skills` reachable from `validate`, `verify:skills:cli` in
// `local:gate`, and `verify:skills:cli` in the workflow.

const WIRED_SCRIPTS = {
  validate: "npm run verify:format-coverage && npm run verify:skills",
  "verify:format-coverage": "node scripts/verify-format-coverage.mjs",
  "verify:skills": "node scripts/verify-skills.mjs",
  "local:gate":
    "npm run validate && npm run verify:skills:cli && npm run coverage",
  "verify:skills:cli": "node scripts/verify-skills-cli.mjs",
};
const WIRED_WORKFLOW =
  "on:\n  push:\njobs:\n  build:\n    steps:\n      - run: npm run verify:skills:cli\n";

test("checkWiring is silent when both gates are wired", () => {
  assert.deepEqual(checkWiring(WIRED_SCRIPTS, WIRED_WORKFLOW), []);
});

test("checkWiring catches a sibling guard dropped from validate", () => {
  const scripts = { ...WIRED_SCRIPTS, validate: "npm run verify:skills" };
  assert.match(
    checkWiring(scripts, WIRED_WORKFLOW).join(),
    /no longer runs `verify:format-coverage`/,
  );
});

test("checkWiring catches the authoritative validator dropped from local:gate", () => {
  const scripts = {
    ...WIRED_SCRIPTS,
    "local:gate": "npm run validate && npm run coverage",
  };
  assert.match(
    checkWiring(scripts, WIRED_WORKFLOW).join(),
    /local:gate` no longer runs `verify:skills:cli`/,
  );
});

test("checkWiring catches the authoritative validator dropped from CI", () => {
  assert.match(
    checkWiring(
      WIRED_SCRIPTS,
      "on:\n  push:\njobs:\n  build:\n    steps:\n      - run: npm run validate\n",
    ).join(),
    /has no unconditional step that runs/,
  );
});

test("checkWiring reports every broken link at once", () => {
  assert.equal(
    checkWiring({ validate: "", "local:gate": "" }, "jobs: {}\n").length,
    3,
  );
});

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoScripts = () =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"))
    .scripts;
const repoWorkflow = () =>
  readFileSync(path.join(REPO_ROOT, GUARDS_WORKFLOW), "utf8");

test("the repository as it stands is wired, under its declared allowances", () => {
  // The live assertion: fixtures can drift from what the repo actually does.
  assert.deepEqual(
    checkWiring(repoScripts(), repoWorkflow(), WIRING_ALLOWANCES),
    [],
  );
});

test("the real verifier passes on the repository as it stands", () => {
  // `main()` itself against the real tree — wiring, the bootstrap allowance and
  // every committed skill together, the way CI's root-guards job runs it.
  const res = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(res.status, 0, (res.stdout ?? "") + (res.stderr ?? ""));
});

// --- temporary allowances (#4863) ---------------------------------------------
//
// Two wiring links and the non-empty skills directory cannot hold on the day
// the harness lands. Each gets an allowance that excuses it only while the
// missing piece is missing, and turns into a failure the moment it arrives —
// so the later PR has to wire the link and delete the allowance.

test("a wiring allowance excuses its link only while the pending script is absent", () => {
  const unwired = {
    validate: "npm run verify:format-coverage",
    "verify:format-coverage": "node scripts/verify-format-coverage.mjs",
    "verify:skills": "node scripts/verify-skills.mjs",
    "verify:skills:cli": "node scripts/verify-skills-cli.mjs",
  };
  assert.deepEqual(checkWiring(unwired, WIRED_WORKFLOW, WIRING_ALLOWANCES), []);
  // Strict by default: the same manifest fails the `local:gate` link without it.
  assert.match(
    checkWiring(unwired, WIRED_WORKFLOW).join(),
    /local:gate` no longer runs `verify:skills:cli`/,
  );
});

test("a wiring allowance goes stale once its pending script exists", () => {
  // #4871 adds `local:gate`; the allowance must then fail the guard until it
  // is deleted, even if the link itself is wired.
  const stale = checkWiring(WIRED_SCRIPTS, WIRED_WORKFLOW, WIRING_ALLOWANCES);
  assert.equal(stale.length, 1, stale.join("\n"));
  assert.match(stale.join(), /`local:gate` now exists.*#4871/);
});

test("the format-coverage link has no allowance any more (#4864)", () => {
  // #4864 built `verify:format-coverage` and removed its temporary allowance,
  // so a root `validate` that stops running it fails even under the
  // allowances that remain.
  const scripts = {
    validate: "npm run verify:skills",
    "verify:skills": "node scripts/verify-skills.mjs",
    "verify:skills:cli": "node scripts/verify-skills-cli.mjs",
  };
  assert.ok(!WIRING_ALLOWANCES.some((a) => a.link === "format-coverage"));
  assert.match(
    checkWiring(scripts, WIRED_WORKFLOW, WIRING_ALLOWANCES).join(),
    /no longer runs `verify:format-coverage`/,
  );
});

test("an allowance never masks a link that exists but is broken", () => {
  // `local:gate` present but not running the validator: the allowance is
  // stale AND the link is reported — it does not excuse a real regression.
  const scripts = {
    "verify:skills:cli": "node scripts/verify-skills-cli.mjs",
    "local:gate": "npm run coverage",
  };
  const problems = checkWiring(scripts, WIRED_WORKFLOW, [
    WIRING_ALLOWANCES.find((a) => a.link === "local-gate-cli"),
  ]);
  assert.match(
    problems.join(),
    /temporary `local-gate-cli` wiring allowance is stale/,
  );
  assert.match(
    problems.join(),
    /local:gate` no longer runs `verify:skills:cli`/,
  );
});

test("the CI link has no allowance", () => {
  assert.match(
    checkWiring(
      {},
      "on:\n  push:\njobs:\n  build:\n    steps:\n      - run: npm run validate\n",
      WIRING_ALLOWANCES,
    ).join(),
    /has no unconditional step that runs/,
  );
});

test("the empty-skills bootstrap allowance passes an empty set, with a note", () => {
  const v = emptySkillsVerdict(0, true);
  assert.equal(v.fatal, undefined);
  assert.equal(v.problem, undefined);
  assert.match(v.note, /bootstrap allowance/);
});

test("without the allowance an empty set is still fatal", () => {
  assert.match(emptySkillsVerdict(0, false).fatal, /no skills found/);
  assert.deepEqual(emptySkillsVerdict(3, false), {});
});

test("the bootstrap allowance goes stale once a skill exists", () => {
  assert.match(
    emptySkillsVerdict(1, true).problem,
    /EMPTY_SKILLS_BOOTSTRAP allowance is stale/,
  );
});

test("the bootstrap allowance is only declared while the skill set is empty", () => {
  // The live half: the committed flag and the committed tree agree. Whichever
  // PR adds the first skill must flip it, and this is the test that says so.
  const dir = path.join(REPO_ROOT, ".claude", "skills");
  const hasSkills =
    existsSync(dir) &&
    readdirSync(dir).some(
      (n) => !n.startsWith(".") && statSync(path.join(dir, n)).isDirectory(),
    );
  assert.equal(EMPTY_SKILLS_BOOTSTRAP, !hasSkills);
});

test("checkWiring is not satisfied by a mention outside an executable step", () => {
  // A raw substring match would pass on any of these while CI ran nothing —
  // including on a step whose NAME describes the check it no longer performs,
  // which is exactly how a wiring guard goes quietly vacuous.
  const mentions = [
    "# npm run verify:skills:cli\non:\n  push:\njobs:\n  build:\n    steps:\n      - run: npm run validate\n",
    "on:\n  push:\njobs:\n  build:\n    steps:\n      - name: npm run verify:skills:cli\n        run: npm run validate\n",
    "on:\n  push:\n  workflow_dispatch:\n    inputs:\n      cmd:\n        default: npm run verify:skills:cli\njobs:\n  build:\n    steps:\n      - run: npm run validate\n",
  ];
  for (const workflow of mentions) {
    assert.match(
      checkWiring(WIRED_SCRIPTS, workflow).join(),
      /has no unconditional step that runs/,
      `should not count: ${workflow.split("\n")[0]}`,
    );
  }
});

test("checkWiring accepts the command inside a multi-line run step", () => {
  const workflow =
    "on:\n  push:\njobs:\n  build:\n    steps:\n      - run: |\n          npm run validate\n          npm run verify:skills:cli\n";
  assert.deepEqual(checkWiring(WIRED_SCRIPTS, workflow), []);
});

test("ciRunsUnconditionally requires a step that runs on every push", () => {
  const C = "npm run verify:skills:cli";
  const wired =
    "on:\n  push:\njobs:\n  build:\n    steps:\n      - run: npm run verify:skills:cli\n";
  assert.equal(ciRunsUnconditionally(wired, C), true);

  // A multi-line `run:` block is the obvious way to over-correct; it counts.
  assert.equal(
    ciRunsUnconditionally(
      "on:\n  push:\njobs:\n  build:\n    steps:\n      - run: |\n          npm run validate\n          npm run verify:skills:cli\n",
      C,
    ),
    true,
  );
});

test("ciRunsUnconditionally rejects a step that only runs sometimes", () => {
  const C = "npm run verify:skills:cli";
  // Both are syntactically `run:` steps, so an executable-position check alone
  // reports them as wired while PR CI validates nothing.
  const releaseOnly =
    "on:\n  push:\njobs:\n  publish:\n    if: github.event_name == 'release'\n    steps:\n      - run: npm run verify:skills:cli\n";
  const stepGated =
    "on:\n  push:\njobs:\n  build:\n    steps:\n      - if: false\n        run: npm run verify:skills:cli\n";
  assert.equal(ciRunsUnconditionally(releaseOnly, C), false);
  assert.equal(ciRunsUnconditionally(stepGated, C), false);
});

test("ciRunsUnconditionally is not satisfied by an unrelated or absent command", () => {
  const C = "npm run verify:skills:cli";
  // `verify:skills` must not satisfy a search for `verify:skills:cli`.
  assert.equal(
    ciRunsUnconditionally(
      "on:\n  push:\njobs:\n  build:\n    steps:\n      - run: npm run verify:skills\n",
      C,
    ),
    false,
  );
  assert.equal(ciRunsUnconditionally("not: yaml: at: all:", C), false);
  assert.equal(ciRunsUnconditionally("on: push\n", C), false);
});

test("the repository's workflow runs the validator unconditionally", () => {
  assert.equal(
    ciRunsUnconditionally(repoWorkflow(), "npm run verify:skills:cli"),
    true,
  );
  // And the fast guard beside it. Since #4864 the root-guards job runs it as
  // part of the root's `validate:guards`, so assert that link end to end: the
  // workflow runs `validate:guards` unconditionally, and that chain reaches
  // `verify:skills`.
  assert.equal(
    ciRunsUnconditionally(repoWorkflow(), "npm run validate:guards"),
    true,
  );
  assert.ok(scriptChainRuns(repoScripts(), "validate:guards", "verify:skills"));
});

test("runsCommand matches an exact invocation, not a substring", () => {
  const C = "npm run verify:skills:cli";
  for (const script of [
    C,
    `npm run validate && ${C}`,
    `npm run validate\n${C}\n`,
    `${C} ; npm run something`,
  ]) {
    assert.equal(runsCommand(script, C), true, script);
  }
});

test("runsCommand rejects a longer script name or a mere mention", () => {
  // Both would let the real validator be removed while the wiring guard stayed
  // green — the counterexamples to the substring test this replaced.
  const C = "npm run verify:skills:cli";
  for (const script of [
    "npm run verify:skills:cli:disabled",
    "echo npm run verify:skills:cli",
    "npm run verify:skills",
    "npm run verify:skills:cli --silent",
    "",
  ]) {
    assert.equal(runsCommand(script, C), false, script);
  }
});

test("ciRunsUnconditionally inherits the exact-invocation rule", () => {
  const C = "npm run verify:skills:cli";
  assert.equal(
    ciRunsUnconditionally(
      "on:\n  push:\njobs:\n  build:\n    steps:\n      - run: npm run verify:skills:cli:disabled\n",
      C,
    ),
    false,
  );
});

test("ciRunsUnconditionally requires the workflow to fire on ordinary changes", () => {
  const C = "npm run verify:skills:cli";
  const step =
    "jobs:\n  build:\n    steps:\n      - run: npm run verify:skills:cli\n";

  // `on:` takes three shapes, and any of them may name the event.
  assert.equal(ciRunsUnconditionally(`on:\n  push:\n${step}`, C), true);
  assert.equal(ciRunsUnconditionally(`on: push\n${step}`, C), true);
  assert.equal(ciRunsUnconditionally(`on: [push, release]\n${step}`, C), true);
  assert.equal(ciRunsUnconditionally(`on:\n  pull_request:\n${step}`, C), true);

  // A workflow switched to release-only still CONTAINS the step, and an
  // unconditional-step check alone reports it as wired — while no PR ever runs
  // the validator (Copilot).
  assert.equal(
    ciRunsUnconditionally(
      `on:\n  release:\n    types: [published]\n${step}`,
      C,
    ),
    false,
  );
  assert.equal(ciRunsUnconditionally(step, C), false);
});

test("scriptChainRuns follows the chain to a real invocation", () => {
  const T = "verify:skills:cli";
  assert.equal(
    scriptChainRuns(
      { "local:gate": `npm run validate && npm run ${T}` },
      "local:gate",
      T,
    ),
    true,
  );
  // Through an intermediate script, with or without flags on the way.
  assert.equal(
    scriptChainRuns(
      { "local:gate": "npm run validate", validate: `npm run ${T}` },
      "local:gate",
      T,
    ),
    true,
  );
  assert.equal(
    scriptChainRuns(
      { "local:gate": "npm run validate --silent", validate: `npm run ${T}` },
      "local:gate",
      T,
    ),
    true,
  );
});

test("scriptChainRuns looks through the local:gate lease wrapper, and only it", () => {
  // `local:gate` runs its stages under `scripts/gate-lease.mjs` (inspector#2339). The
  // wrapper runs exactly the `npm run …` it is handed, so a vouch sees past
  // it; a wrapper carrying flags, or any other wrapper, still hides the chain.
  const T = "verify:skills:cli";
  const stages = `npm run validate && npm run ${T}`;
  assert.equal(
    scriptChainRuns(
      {
        "local:gate": `${GATE_LEASE_WRAPPER}npm run local:gate:stages`,
        "local:gate:stages": stages,
      },
      "local:gate",
      T,
    ),
    true,
  );
  assert.equal(
    scriptChainRuns(
      { "local:gate": `${GATE_LEASE_WRAPPER}npm run ${T}` },
      "local:gate",
      T,
    ),
    true,
  );
  for (const wrapped of [
    `node scripts/gate-lease.mjs --quiet npm run ${T}`,
    `node scripts/other-wrapper.mjs npm run ${T}`,
  ]) {
    assert.equal(
      scriptChainRuns({ "local:gate": wrapped }, "local:gate", T),
      false,
      wrapped,
    );
  }
});

test("scriptChainRuns is not satisfied by a mention or a longer name", () => {
  // `reachableScripts` extracts any `npm run …` substring, so both of these
  // passed the old check while the validator never ran.
  const T = "verify:skills:cli";
  assert.equal(
    scriptChainRuns(
      { "local:gate": `echo npm run ${T} && npm run coverage` },
      "local:gate",
      T,
    ),
    false,
  );
  assert.equal(
    scriptChainRuns({ "local:gate": `npm run ${T}:disabled` }, "local:gate", T),
    false,
  );
  assert.equal(
    scriptChainRuns({ "local:gate": "npm run coverage" }, "local:gate", T),
    false,
  );
  assert.equal(scriptChainRuns({}, "local:gate", T), false);
});

test("scriptChainRuns terminates on a cyclic script graph", () => {
  assert.equal(
    scriptChainRuns(
      { "local:gate": "npm run a", a: "npm run b", b: "npm run a" },
      "local:gate",
      "verify:skills:cli",
    ),
    false,
  );
});

test("checkWiring rejects a local:gate that only mentions the validator", () => {
  const scripts = {
    ...WIRED_SCRIPTS,
    "local:gate": "echo npm run verify:skills:cli && npm run coverage",
  };
  assert.match(
    checkWiring(scripts, WIRED_WORKFLOW).join(),
    /local:gate` no longer runs `verify:skills:cli`/,
  );
});

test("runsCommand rejects failure-masking and conditional shell forms", () => {
  // `npm run X || true` swallows a rejection so CI stays green; `true || npm
  // run X` never runs the validator. Both are `run:` steps containing the
  // command, so a separator-agnostic split counted them (Copilot).
  const C = "npm run verify:skills:cli";
  for (const script of [`${C} || true`, `true || ${C}`, `${C} | tee log`]) {
    assert.equal(runsCommand(script, C), false, script);
  }
});

test("ciRunsUnconditionally rejects a step whose failure cannot fail the job", () => {
  const C = "npm run verify:skills:cli";
  const head = "on:\n  push:\njobs:\n  build:\n";
  // `continue-on-error` means a rejected skill leaves the workflow green, so
  // the step asserts nothing — on the step or on the whole job.
  assert.equal(
    ciRunsUnconditionally(
      `${head}    steps:\n      - continue-on-error: true\n        run: ${C}\n`,
      C,
    ),
    false,
  );
  assert.equal(
    ciRunsUnconditionally(
      `${head}    steps:\n      - continue-on-error: "true"\n        run: ${C}\n`,
      C,
    ),
    false,
  );
  assert.equal(
    ciRunsUnconditionally(
      `on:\n  push:\njobs:\n  build:\n    continue-on-error: true\n    steps:\n      - run: ${C}\n`,
      C,
    ),
    false,
  );
  // An explicit `false` is the normal case and must still count.
  assert.equal(
    ciRunsUnconditionally(
      `${head}    steps:\n      - continue-on-error: false\n        run: ${C}\n`,
      C,
    ),
    true,
  );
});

test("scriptChainRuns rejects failure-masking chains", () => {
  const T = "verify:skills:cli";
  assert.equal(
    scriptChainRuns({ "local:gate": `npm run ${T} || true` }, "local:gate", T),
    false,
  );
  assert.equal(
    scriptChainRuns({ "local:gate": `true || npm run ${T}` }, "local:gate", T),
    false,
  );
});

test("scriptChainRuns follows npm's implicit pre/post hooks", () => {
  const T = "verify:skills:cli";
  assert.equal(
    scriptChainRuns(
      { "local:gate": "npm run coverage", precoverage: `npm run ${T}` },
      "local:gate",
      T,
    ),
    true,
  );
});

test("scriptChainRuns does not follow a masked intermediate hop (#4895)", () => {
  const T = "verify:skills:cli";
  for (const gate of ["npm run stage || true", "npm run stage | tee log"]) {
    assert.equal(
      scriptChainRuns(
        { "local:gate": gate, stage: `npm run ${T}` },
        "local:gate",
        T,
      ),
      false,
      gate,
    );
  }
  // The unmasked hop is still followed.
  assert.equal(
    scriptChainRuns(
      { "local:gate": "npm run stage", stage: `npm run ${T}` },
      "local:gate",
      T,
    ),
    true,
  );
});
