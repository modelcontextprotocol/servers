#!/usr/bin/env node
// Durable guard for `.claude/skills/**/SKILL.md`.
//
// Ported from the MCP Inspector's `scripts/verify-skills.mjs` (#4863). A
// `inspector#N` reference in these comments is that repo's issue or PR, kept
// because it is where the reasoning was worked out; a bare `#N` is this repo's.
//
// `AGENTS.md` is loaded in full on every turn, so its rules are unconditionally
// present. A skill is conditional — its body loads only when it is invoked — so
// if a skill stops being reachable we lose behavior SILENTLY, and nothing in the
// normal workflow surfaces that. This is the check that does.
//
// What it asserts, cheapest first:
//   1. Every SKILL.md's frontmatter parses the way Claude Code parses it. This
//      is the whole-class failure: malformed YAML (or a fence that is not the
//      first line) loads the body with EMPTY metadata, so `/name` still works —
//      a manual spot check passes — while the description the model matches
//      against is gone and the skill never auto-fires again.
//   2. Every skill declares its invocation mode explicitly, so the set that has
//      to fire on its own is knowable by reading the files rather than inferred.
//   3. Every model-invoked skill has committed eval cases, including negatives.
//      Cases are run by `npm run skills:eval`, which needs the Claude CLI and is
//      therefore NOT in the gate; the cases existing is what this checks.
//   4. The skill LISTING stays inside its recorded character budget. Claude Code
//      truncates the listing when it overflows, dropping the least-invoked
//      entries first — which are exactly the model-invoked skills.
//
// It additionally runs `claude plugin validate` when the local CLI is exactly
// the pinned version. That is the authoritative parse, but it cannot be a
// requirement here: the CLI is absent in CI and on many contributors' machines,
// and a guard that skips itself wherever it actually runs is worse than one that
// reimplements the check. `verify:skills:cli` is the guaranteed run of it.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeSpawnArgs, probeClaudeVersion } from "./lib/claude-cli.mjs";
import { rootReachesScript, scriptChainRuns } from "./lib/npm-scripts.mjs";
import { parse as parseYaml } from "yaml";
import {
  formatClaudeVersion,
  isPinnedVersion,
  parseClaudeVersion,
  PINNED_CLI_VERSION,
  parseSkill,
  validateEvalCases,
  listingCost,
  LISTING_BUDGET,
} from "./lib/skill-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SKILLS_DIR = path.join(ROOT, ".claude", "skills");

/** Directory names under `.claude/skills` that contain a SKILL.md. */
export function skillDirs(
  dir,
  { readdir = readdirSync, stat = statSync } = {},
) {
  return readdir(dir)
    .filter((n) => !n.startsWith("."))
    .filter((n) => stat(path.join(dir, n)).isDirectory())
    .sort();
}

/**
 * Whether a shell script invokes exactly `command`.
 *
 * A substring test is not enough, and my own justification for one was wrong:
 * it accepts a LONGER script name (`npm run verify:skills:cli:disabled`) and a
 * script merely named by another command (`echo npm run verify:skills:cli`),
 * either of which would let the real validator be removed while this guard
 * stayed green (Copilot).
 *
 * So the script is split on the separators that start a new command, and a
 * segment must equal the invocation exactly. That is precise for the commands
 * this guard checks, which take no arguments; a command that did would need
 * prefix matching with an argument boundary instead.
 *
 * Splitting is on `\n`, `;` and `&&` only — deliberately NOT on `|` or a bare
 * `&`. `||` is the failure-masking form, and both of its shapes must be
 * rejected: `npm run X || true` swallows a rejection so CI stays green, and
 * `true || npm run X` never runs the validator at all (Copilot). Leaving `||`
 * inside the segment means the segment does not equal the invocation, so both
 * are refused without special-casing either.
 *
 * @param {string} script A step's `run:` block.
 * @param {string} command e.g. `npm run verify:skills:cli`.
 */
export function runsCommand(script, command) {
  return script
    .split(/\n|;|&&/)
    .map((segment) => segment.trim())
    .some((segment) => segment === command);
}

/**
 * Whether an Actions boolean-ish value means "yes".
 *
 * YAML gives `true`, but a workflow may equally write `"true"` — and an
 * expression (`${{ … }}`) is unevaluable here, so it is treated as masking on
 * the same conservative principle the `if:` checks use.
 *
 * @param {unknown} value
 */
function isTruthy(value) {
  if (value === undefined || value === false) return false;
  return value !== "false";
}

/**
 * Whether a workflow's `on:` includes an event that fires for ordinary changes.
 *
 * `on:` takes three shapes — a bare string, a list, or a map of event names.
 * Note the YAML 1.1 `on` → `true` pitfall does not apply here: the `yaml`
 * package parses to the 1.2 core schema, where the key stays the string `on`.
 *
 * @param {unknown} on
 */
function triggersOnPush(on) {
  const events =
    typeof on === "string"
      ? [on]
      : Array.isArray(on)
        ? on
        : on !== null && typeof on === "object"
          ? Object.keys(on)
          : [];
  return events.some((e) => e === "push" || e === "pull_request");
}

/**
 * Whether the workflow has a step that runs `command` on every push.
 *
 * Four things must hold, and the guard has needed each one added in turn:
 * the WORKFLOW must fire on a push or pull_request (one switched to `on:
 * release` still contains the step but never runs it on a PR), the JOB must be
 * unconditional, so must the STEP, and neither may carry `continue-on-error` —
 * a step whose failure cannot fail the job asserts nothing, so a rejected skill
 * would leave the workflow green (Copilot).
 *
 * Deliberately conservative: a job or step carrying **any** `if:` is skipped.
 * This guard cannot evaluate an Actions expression, and the property being
 * asserted is "CI validates the skills on a PR" — which a conditional step does
 * not establish. Over-strictness costs a false failure that is obvious to fix;
 * under-strictness costs a guard that reports green while nothing runs.
 *
 * @param {string} workflowText
 * @param {string} command
 * @returns {boolean}
 */
export function ciRunsUnconditionally(workflowText, command) {
  let doc;
  try {
    doc = parseYaml(workflowText);
  } catch {
    return false;
  }
  if (!triggersOnPush(doc?.on)) return false;

  const jobs = doc?.jobs;
  if (jobs === null || typeof jobs !== "object") return false;

  for (const job of Object.values(jobs)) {
    if (job === null || typeof job !== "object") continue;
    if ("if" in job || isTruthy(job["continue-on-error"])) continue;
    const steps = Array.isArray(job.steps) ? job.steps : [];
    for (const step of steps) {
      if (step === null || typeof step !== "object") continue;
      if ("if" in step || isTruthy(step["continue-on-error"])) continue;
      if (typeof step.run === "string" && runsCommand(step.run, command))
        return true;
    }
  }
  return false;
}

/**
 * The workflow holding the `root-guards` job, which is where CI runs the skill
 * gates. This repo has no `main.yml`; the TypeScript workflow already fires on
 * every push and pull request, so the root-level guards live beside it (#4863).
 */
export const GUARDS_WORKFLOW = path.join(
  ".github",
  "workflows",
  "typescript.yml",
);

/**
 * TEMPORARY allowances for wiring links whose other end does not exist yet.
 *
 * `checkWiring` asserts npm-script links that this repo could not all satisfy
 * on the day the skills harness landed, because the scripts at their far end
 * are built by later sub-issues of #4858. One remains:
 *
 *   - `local:gate` reaching `verify:skills:cli` — #4871 adds `local:gate`.
 *
 * (The root `validate` reaching `verify:format-coverage` had one too; #4864
 * built both ends and removed it, so that link is now enforced strictly.)
 *
 * An allowance is deliberately narrow: it excuses its link only while
 * `pendingScript` is ABSENT from the root manifest. The moment the issue that
 * builds that script adds it, the allowance stops excusing anything and
 * `checkWiring` reports it as stale instead — so the later PR cannot land
 * without wiring the link and deleting its entry here, and an allowance can
 * never mask a link that was wired and then broken.
 *
 * @type {ReadonlyArray<{ link: "local-gate-cli", pendingScript: string, removedBy: string }>}
 */
export const WIRING_ALLOWANCES = [
  { link: "local-gate-cli", pendingScript: "local:gate", removedBy: "#4871" },
];

/**
 * Assert the two skill gates are still WIRED, not merely present.
 *
 * A gate that stops being invoked fails silently and every fixture test stays
 * green — which is the same failure the sibling guards' vouch cycle exists to
 * prevent, so this joins it (Copilot). Two distinct links:
 *
 *   - `verify:skills` (this file) must be reachable from the root `validate`.
 *     It cannot detect its own absence, so `verify:format-coverage` vouches for
 *     it and this vouches back — the established cycle.
 *   - `verify:skills:cli` must be in `local:gate` AND in the workflow. That is
 *     the step that actually runs the authoritative validator, and it is
 *     reachable from neither `validate` nor any test, so nothing else would
 *     notice it going missing.
 *
 * The workflow half must find a step that **actually runs on a PR**, which takes
 * two narrowings beyond a text search:
 *
 *   - Executable position. A raw substring match is satisfied by a comment, a
 *     step `name:`, or a workflow input default that merely mentions the
 *     command — so deleting the real step while leaving this docblock's wording
 *     nearby would keep the guard green.
 *   - Unconditional execution. A `run:` inside a release-only job, or behind
 *     `if: false`, is still syntactically a `run:` — so a step moved there
 *     would report as wired while PR CI validated nothing (Copilot). Any `if:`
 *     on the job or the step disqualifies it: this guard cannot evaluate an
 *     expression, and "runs sometimes" is not the property being asserted.
 *
 * The workflow link has no allowance: the `root-guards` job exists from the
 * day this guard does.
 *
 * @param {Record<string, string>} rootScripts
 * @param {string} workflowText
 * @param {typeof WIRING_ALLOWANCES} [allowances] Strict (none) by default;
 *   `main` passes `WIRING_ALLOWANCES`.
 * @returns {string[]} problems
 */
export function checkWiring(rootScripts, workflowText, allowances = []) {
  const problems = [];
  const has = (name) => typeof rootScripts?.[name] === "string";
  const excused = (link) =>
    allowances.some((a) => a.link === link && !has(a.pendingScript));

  for (const a of allowances) {
    if (has(a.pendingScript)) {
      problems.push(
        `\`${a.pendingScript}\` now exists, so the temporary \`${a.link}\` wiring allowance is stale. ` +
          `Wire the link and delete its entry from WIRING_ALLOWANCES in scripts/verify-skills.mjs (${a.removedBy}).`,
      );
    }
  }
  if (!rootReachesScript(rootScripts, "verify:format-coverage")) {
    problems.push(
      "the root `validate` no longer runs `verify:format-coverage` (a sibling guard). Restore it.",
    );
  }
  if (
    !scriptChainRuns(rootScripts, "local:gate", "verify:skills:cli") &&
    !excused("local-gate-cli")
  ) {
    problems.push(
      "`npm run local:gate` no longer runs `verify:skills:cli`, so the authoritative validator never runs locally. Restore it.",
    );
  }
  if (!ciRunsUnconditionally(workflowText, "npm run verify:skills:cli")) {
    problems.push(
      `\`${GUARDS_WORKFLOW}\` has no unconditional step that runs \`npm run verify:skills:cli\`, so the authoritative validator does not run on a PR. Restore it (a step behind an \`if:\`, or in a release-only job, does not count).`,
    );
  }
  return problems;
}

function main(argv = process.argv.slice(2)) {
  // An explicit directory is the seam the fixture tests drive; without it this
  // guard could only ever be exercised against the repo's own (green) skills,
  // so it could stop enforcing anything while every unit test stayed green.
  const override = argv[0];
  const SKILLS_DIR = override ? path.resolve(override) : DEFAULT_SKILLS_DIR;
  const failures = [];

  // Only meaningful against the real repo; a fixture run has no wiring.
  if (!override) {
    const rootScripts = JSON.parse(
      readFileSync(path.join(ROOT, "package.json"), "utf8"),
    ).scripts;
    const workflow = readFileSync(path.join(ROOT, GUARDS_WORKFLOW), "utf8");
    for (const problem of checkWiring(
      rootScripts,
      workflow,
      WIRING_ALLOWANCES,
    )) {
      failures.push(problem);
    }
  }

  if (!existsSync(SKILLS_DIR)) {
    console.error(
      `verify:skills — ${path.relative(ROOT, SKILLS_DIR)} does not exist.`,
    );
    process.exit(1);
  }

  const dirs = skillDirs(SKILLS_DIR);
  // An empty skills directory means the skill set was deleted, and that must
  // fail loudly. (#4863 excused it with a temporary bootstrap allowance until
  // the first skill landed; #4866 added the first skills and removed it.)
  if (dirs.length === 0) {
    console.error("verify:skills — no skills found; the skill set is gone.");
    process.exit(1);
  }

  const parsed = [];
  const evalFiles = [];
  const modelInvokedDirs = new Set();
  for (const dir of dirs) {
    const file = path.join(SKILLS_DIR, dir, "SKILL.md");
    if (!existsSync(file)) {
      failures.push(`${dir}: no SKILL.md`);
      continue;
    }
    const skill = parseSkill(dir, readFileSync(file, "utf8"));
    for (const e of skill.errors) failures.push(`${dir}/SKILL.md: ${e}`);
    if (skill.errors.length > 0) continue;
    parsed.push(skill);

    if (skill.modelInvoked) {
      modelInvokedDirs.add(dir);
      const evalsFile = path.join(SKILLS_DIR, dir, "evals", "evals.json");
      if (!existsSync(evalsFile)) {
        failures.push(
          `${dir}: model-invoked skills need committed eval cases at evals/evals.json`,
        );
        continue;
      }
      let cases;
      try {
        cases = JSON.parse(readFileSync(evalsFile, "utf8"));
      } catch (e) {
        failures.push(`${dir}/evals/evals.json: not valid JSON — ${e.message}`);
        continue;
      }
      evalFiles.push({ dir, cases });
    }
  }

  // Validated after the loop, not inside it: a hand-off case names other
  // skills, and checking those links needs the model-invoked set complete.
  // Inside the loop the check would depend on directory order — `test-servers`
  // sorts before `testing`, so a chain through `testing` would be rejected as
  // unknown purely because of where the alphabet put it.
  // Keyed on the DIRECTORY name, which is what a chain link names and what a
  // skill is addressed by; the frontmatter `name` can be absent or disagree,
  // and either would silently shrink the set a chain is checked against.
  for (const { dir, cases } of evalFiles) {
    for (const e of validateEvalCases(dir, cases, modelInvokedDirs)) {
      failures.push(`${dir}/evals/evals.json: ${e}`);
    }
  }

  const cost = listingCost(parsed);
  if (cost > LISTING_BUDGET) {
    failures.push(
      `this repo contributes ${cost} chars to the skill listing, over its recorded ` +
        `budget of ${LISTING_BUDGET}. Tighten a description, or raise the budget ` +
        "deliberately in scripts/lib/skill-manifest.mjs — but note the real listing " +
        "budget is SHARED with bundled skills and the contributor's own " +
        "~/.claude/skills, none of which is visible from here.",
    );
  }

  if (failures.length > 0) {
    console.error(`verify:skills — ${failures.length} problem(s):\n`);
    for (const f of failures) console.error("  " + f);
    console.error(
      "\nSee AGENTS.md → Maintaining the skills, and docs/skill-authoring.md.",
    );
    process.exit(1);
  }

  const modelInvoked = parsed.filter((s) => s.modelInvoked).map((s) => s.name);
  console.log(
    `verify:skills — OK: ${parsed.length} skills, ${modelInvoked.length} model-invoked ` +
      `(${modelInvoked.join(", ")}); this repo's listing share ${cost}/${LISTING_BUDGET} chars.`,
  );

  if (override) return;

  // The authoritative parse, when it is available — strictly a bonus, and only
  // from the EXACT pinned CLI.
  //
  // Once #4871 builds it, `local:gate` runs this before the pinned
  // `verify:skills:cli` step, so a local CLI on any other version could reject
  // skills that CI's pinned validator accepts — and the gate would exit here,
  // never reaching the reproducible step (Copilot). Accepting merely "new enough"
  // would reintroduce exactly the cross-machine schema drift the pin removes.
  // Anything else is left to `verify:skills:cli`, which fetches the pin.
  const version = probeClaudeVersion(parseClaudeVersion);
  if (!isPinnedVersion(version, PINNED_CLI_VERSION)) {
    console.log(
      `verify:skills — local \`claude\` is ${formatClaudeVersion(version)}, not the ` +
        `pinned ${PINNED_CLI_VERSION}; \`verify:skills:cli\` runs the pinned validator.`,
    );
    return;
  }
  const { command, args, options } = claudeSpawnArgs(
    ["plugin", "validate", ".claude/skills"],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (spawnSync(command, args, options).status !== 0) {
    console.error("\nverify:skills — `claude plugin validate` failed.");
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
