#!/usr/bin/env node
// Trigger eval for the model-invoked skills in `.claude/skills` (inspector#2163).
//
// Ported from the MCP Inspector (#4863); `inspector#N` references are that
// repo's issues and PRs, a bare `#N` is this repo's.
//
// `verify:skills` asserts a skill is well-formed and that its cases exist. This
// runs them: each prompt is executed headless in a FRESH session and we assert
// on whether the Skill tool fired with the expected skill.
//
// Seeing a skill fire once tells us Claude found it, not that it finds it
// reliably — the measurement is a hit rate over repeated fresh sessions. It
// needs negative cases too: a skill that fires on everything is a context
// regression, and it is the failure nobody notices by hand. `verify:skills`
// requires both.
//
// NOT part of `validate`, `local:gate`, or CI, and that is a decision rather
// than an omission. A trigger eval cannot be a gate: it spends metered model
// calls on every push, the measurement IS a hit rate over samples so it is
// non-deterministic by construction, and it goes red on a rate limit or an
// expired token — failures unrelated to the diff, whose first consequence is
// that people stop trusting the gate. Run it when adding a skill or editing a
// model-invoked skill's description.
//
// The cost of that split, stated plainly: neither `verify:skills` nor the
// authoritative `claude plugin validate` CI step can detect a well-formed skill
// whose description simply never matches anything. Both check structure.
// Closing that would need a deterministic trigger oracle, which does not exist.
//
// Usage:
//   npm run skills:eval                        # every model-invoked skill's cases
//   npm run skills:eval -- pr-flow             # one skill's cases
//   npm run skills:eval -- pr-flow issue-create  # several skills' cases
//   RUNS=5 THRESHOLD=0.8 npm run skills:eval
//   AGENT=copilot npm run skills:eval          # the same cases, driven through GitHub Copilot
//
// Two agents, measured separately (inspector#2397). Some maintainers work with
// the GitHub Copilot CLI, which discovers project skills from `.claude/skills/`
// as well as `.github/skills/` (verified in the Inspector on 1.0.85: `copilot
// skill list` shows all ten of its skills). Discovery is not triggering, though, so the same
// committed cases run through `copilot` when `AGENT=copilot`. One invocation
// measures ONE agent and says which in every heading: a Copilot rate and a
// Claude rate come from different models behind different harnesses, so they
// are never folded into one number, for the same reason first-move and
// hand-off cases are not.
//
// Two kinds of case, measured and reported separately (inspector#2204). A `expect` case
// is a FIRST-MOVE measurement: one turn, does the model reach for the skill
// before anything else. A `chain` case is a HAND-OFF measurement: many turns,
// does loading skill A actually lead the model to load skill B. The two numbers
// are not comparable — a hand-off is a second-hop load that only happens once
// the run has established it needs one — so they never share a column.

import { spawn } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cliSpawnArgs, probeCliVersion } from "./lib/claude-cli.mjs";
import {
  isChainCase,
  parseClaudeVersion,
  parseSkill,
  validateEvalCases,
} from "./lib/skill-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = path.join(ROOT, ".claude", "skills");

const THRESHOLD = Number(process.env.THRESHOLD ?? 0.8);
// A hand-off is a harder thing to hit than a first move, and what counts as
// acceptable is a separate judgement rather than one inherited from a number
// tuned for the other measurement. 0.5 is the weakest claim worth asserting —
// the pointer is taken more often than not — and it is a floor on useful
// reliability for a SECOND-HOP load, not a claim that 0.8 is unreachable. One
// well-shaped pointer has cleared 0.8 outright: the committed `testing` ->
// `test-servers` cases measured 33% (RUNS=3) when `testing` merely classified
// which work belonged to `test-servers`, and 100%/100% (RUNS=5) once inspector#2247
// reshaped that into an imperative step. That is ONE pointer over ONE edit that
// moved wording and placement together, so read it as an existence proof that
// the ceiling is above 0.8 — not as a general property of "well-shaped"
// pointers, and not as grounds for raising this floor (Copilot, inspector#2264). (An intermediate build of that change
// measured 100%/80%. That is NOT an example of clearing a 0.8 bar — this
// threshold is compared strictly, so 80% would fail one — but it is worth
// knowing as the residual noise still present at RUNS=5.) What 0.5 buys
// is a column that still separates an adequate pointer from a broken one — a
// hand-off is a noisier measurement than a first move, so a bar set where a
// STRONG pointer sits would mark both red.
// A reshaped pointer therefore raises the ceiling those cases reach, not the
// floor a *new* hand-off case should be judged against.
//
// It is compared STRICTLY, unlike the first-move threshold. "More often than
// not" is `> 0.5`, and an inclusive compare passes exactly half the samples
// whenever RUNS is even — 2/4 would report a pass the stated criterion does not
// license (Copilot). A consequence worth knowing: a strict bound of 1.0 can
// never be met, so it is rejected below rather than silently failing every case.
const CHAIN_THRESHOLD = Number(process.env.CHAIN_THRESHOLD ?? 0.5);
const RUNS = Number(process.env.RUNS ?? 3);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);

/**
 * Turns a hand-off case gets.
 *
 * `--max-turns 1` is what makes a first-move case a first-move case, so a
 * chained case needs a budget wide enough for the run to establish that it
 * needs the second skill. inspector#2204 measured the `testing` -> `test-servers`
 * hand-off going 9-12 tool calls without reaching it; a budget under that
 * cannot distinguish "the hand-off does not fire" from "the run was cut short".
 */
const CHAIN_MAX_TURNS = Number(process.env.CHAIN_MAX_TURNS ?? 14);

/** The agent CLIs this eval can drive. `claude` is the default. */
export const AGENTS = ["claude", "copilot"];
const AGENT = process.env.AGENT ?? "claude";

/** Collect the committed cases for every model-invoked skill (optionally one). */
/**
 * Collect the committed cases, and the set of skill names that are OURS.
 *
 * `only` narrows which cases run, but it must NOT narrow `ours`: a negative
 * case means "no skill of this repo fired", so excluding the repo's other
 * model-invoked skills from that set would let `skills:eval -- testing` score a
 * `local-dev` invocation as foreign and pass a negative case it should fail
 * (Copilot). Every model-invoked skill is inspected; `only` is applied when
 * enqueueing.
 *
 * A name that matches no model-invoked skill is a hard error rather than an
 * empty run: a typo would otherwise enqueue nothing and the eval would report a
 * green 0/0, which reads exactly like a clean pass of the skill you meant.
 *
 * Collection is two passes. A hand-off case names other skills, and its links
 * are checked against the repo's model-invoked set — which is only complete
 * once every directory has been parsed. Validating inside the first pass would
 * make the check depend on directory order: `test-servers` sorts before
 * `testing`, so a chain through `testing` would be rejected as unknown purely
 * because of where the alphabet put it.
 *
 * @param {string | string[] | undefined} only One or more skill names.
 * @param {string} [skillsDir]
 * @returns {{ cases: object[], ours: Set<string> }}
 */
export function collectCases(only, skillsDir = SKILLS_DIR) {
  const wanted =
    only === undefined || only === null
      ? null
      : new Set(Array.isArray(only) ? only : [only]);
  const cases = [];
  const ours = new Set();
  const files = [];
  for (const dir of readdirSync(skillsDir).sort()) {
    const skillFile = path.join(skillsDir, dir, "SKILL.md");
    if (
      !statSync(path.join(skillsDir, dir)).isDirectory() ||
      !existsSync(skillFile)
    )
      continue;
    const skill = parseSkill(dir, readFileSync(skillFile, "utf8"));
    // Skipping a BROKEN skill here would let `skills:eval` run the remaining
    // cases and exit 0 while omitting the very skill that was just broken —
    // reporting a green measurement of a set that quietly shrank (Copilot).
    // Only a well-formed, deliberately name-only skill is skipped.
    if (skill.errors.length > 0) {
      throw new Error(
        `${dir}/SKILL.md does not parse (${skill.errors[0]}). Run \`npm run verify:skills\`.`,
      );
    }
    if (!skill.modelInvoked) continue;
    ours.add(dir);

    const evalsFile = path.join(skillsDir, dir, "evals", "evals.json");
    if (!existsSync(evalsFile)) {
      throw new Error(
        `${dir} is model-invoked but has no evals/evals.json. Run \`npm run verify:skills\`.`,
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(evalsFile, "utf8"));
    } catch (e) {
      throw new Error(
        `${dir}/evals/evals.json is not valid JSON — ${e.message}`,
        { cause: e },
      );
    }
    files.push({ dir, parsed });
  }
  for (const { dir, parsed } of files) {
    const invalid = validateEvalCases(dir, parsed, ours);
    if (invalid.length > 0) {
      throw new Error(`${dir}/evals/evals.json: ${invalid.join("; ")}`);
    }
    if (wanted && !wanted.has(dir)) continue;
    for (const c of parsed) cases.push({ ...c, from: dir });
  }
  if (wanted) {
    const unknown = [...wanted].filter((n) => !ours.has(n));
    if (unknown.length > 0) {
      throw new Error(
        `no model-invoked skill named ${unknown.map((n) => `\`${n}\``).join(", ")} — ` +
          `known: ${[...ours].sort().join(", ")}`,
      );
    }
  }
  return { cases, ours };
}

/**
 * Extract the payloads the `Skill` tool was invoked with from a chunk of
 * `--output-format stream-json` output.
 *
 * Pure and separately tested: everything below spawns a real CLI, so the
 * parsing and the process-outcome handling are unreachable from the happy path
 * of an eval run and would otherwise only ever be exercised by the thing they
 * are supposed to measure.
 *
 * The invocations come back as an ORDERED array, repeats included, rather than
 * a set. A hand-off case asserts that one skill was loaded *after* another, so
 * occurrence order is the observation — and collapsing repeats would make a
 * run that loaded B, then A, then B again indistinguishable from one that never
 * reached B from A (inspector#2204).
 *
 * Each entry also carries the **assistant event** it came from, and that
 * boundary is what makes the order mean something. The model may emit several
 * `tool_use` blocks in one message, and it cannot see the first skill's body
 * until the message after — so two `Skill` calls in the SAME event are
 * concurrent guesses, not a hand-off, however they happen to be ordered inside
 * the array. Flattening the stream and reading position alone would score that
 * as `A` leading to `B` (Copilot); `chainHit` requires a later turn instead.
 *
 * @param {string} text One or more newline-delimited JSON events. A trailing
 *   partial line is ignored, so this can be fed incrementally.
 * @param {number} [turnOffset] Assistant events already seen, so a stream fed
 *   in chunks keeps one monotonic turn count rather than restarting per chunk.
 * @returns {{ invoked: {payload: string, turn: number}[], rest: string,
 *   result: string | null, nextTurn: number }}
 */
export function collectSkillInvocations(text, turnOffset = 0) {
  const lines = text.split("\n");
  const rest = lines.pop() ?? "";
  const invoked = [];
  let result = null;
  let turn = turnOffset;
  for (const line of lines) {
    if (!line.trim()) continue;
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      // A malformed line is noise from the CLI, not an observation.
      continue;
    }
    if (evt?.type === "result") result = evt.subtype ?? null;
    if (evt?.type !== "assistant") continue;
    // One assistant event is one turn: everything inside it was decided at
    // once, before any of its results came back.
    turn++;
    for (const block of evt.message?.content ?? []) {
      if (block?.type !== "tool_use" || block.name !== "Skill") continue;
      // Don't assume the input field's name — match on the whole payload.
      invoked.push({ payload: JSON.stringify(block.input ?? {}), turn });
    }
  }
  return { invoked, rest, result, nextTurn: turn };
}

/**
 * Extract the skills the Copilot CLI's `skill` tool was asked for, from a chunk
 * of `copilot --output-format json` output (inspector#2397).
 *
 * The same contract as `collectSkillInvocations`, over a different event shape.
 * Copilot emits one `assistant.message` per model call, carrying every tool
 * request that call made in `data.toolRequests` — so one such event is one
 * turn, and two `skill` requests inside it are concurrent guesses rather than a
 * hand-off, exactly as for Claude. The terminal event is `{type: "result",
 * exitCode}`; it is reported as `success` for exit 0 and `exit_<code>`
 * otherwise, so `runRejection` classifies both CLIs with one table.
 *
 * A request is counted whether or not the tool then succeeded. That matches
 * the Claude side, which scores the `tool_use` block, and it is what a trigger
 * eval asks: did the model reach for the skill. (Copilot refuses a request
 * for a `disable-model-invocation: true` skill with "Skill not found", and
 * no case here names such a skill.)
 *
 * @param {string} text Newline-delimited JSON events; a trailing partial line
 *   is held back.
 * @param {number} [turnOffset]
 * @returns {{ invoked: {payload: string, turn: number}[], rest: string,
 *   result: string | null, nextTurn: number }}
 */
export function collectCopilotSkillInvocations(text, turnOffset = 0) {
  const lines = text.split("\n");
  const rest = lines.pop() ?? "";
  const invoked = [];
  let result = null;
  let turn = turnOffset;
  for (const line of lines) {
    if (!line.trim()) continue;
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    if (evt?.type === "result") {
      result = evt.exitCode === 0 ? "success" : `exit_${evt.exitCode}`;
    }
    if (evt?.type !== "assistant.message") continue;
    turn++;
    for (const req of evt.data?.toolRequests ?? []) {
      if (req?.name !== "skill") continue;
      invoked.push({ payload: JSON.stringify(req.arguments ?? {}), turn });
    }
  }
  return { invoked, rest, result, nextTurn: turn };
}

/**
 * The skill names one recorded invocation asked for.
 *
 * @param {{payload: string} | string} entry
 * @returns {string[]}
 */
function entryNames(entry) {
  return invokedSkillNames(typeof entry === "string" ? entry : entry.payload);
}

/**
 * Terminal `result` subtypes that mean the session ran to a real conclusion.
 *
 * `error_max_turns` is a SUCCESSFUL observation here, not a failure: with
 * `--max-turns 1`, a run in which the model invokes a skill necessarily hits
 * the limit and the CLI exits 1 — so treating a nonzero exit as failure would
 * reject exactly the runs the eval is trying to count. Verified against the
 * CLI: a firing prompt ends `{subtype: "error_max_turns", num_turns: 2}`.
 */
const CONCLUSIVE_RESULTS = new Set([
  "success",
  "error_max_turns",
  // Copilot has no `--max-turns`; `runPrompt` stops it at the budget itself and
  // records this. It is the same observation as `error_max_turns` (inspector#2397).
  "turn_budget",
]);

/**
 * Whether a finished run produced a usable observation.
 *
 * The failure that matters is the opposite one: an auth error, a rate limit or
 * a missing CLI observes NOTHING, and counting that as "no skill invoked"
 * passes every negative case and reads as a trigger miss on every positive one,
 * so a run that never happened comes back as a plausible hit rate (Copilot).
 * Classifying on the terminal event rather than the exit code separates the two.
 *
 * @param {{ result: string | null, code: number | null }} outcome
 * @returns {string | null} A reason to reject, or null if the run is usable.
 */
export function runRejection({ result, code }) {
  if (result === null) {
    return `produced no terminal \`result\` event (exit ${code})`;
  }
  if (!CONCLUSIVE_RESULTS.has(result)) {
    return `ended \`${result}\` (exit ${code})`;
  }
  return null;
}

/**
 * The skill names a `Skill` tool_use payload actually asked for.
 *
 * Structural rather than substring: matching `"testing"` against the raw JSON
 * counts `{"skill":"not-testing"}` as a hit and inflates the measured rate
 * (Copilot). The field name is still not assumed — every string value in the
 * payload is a candidate, compared by equality.
 *
 * @param {string} payload JSON text as recorded by `collectSkillInvocations`.
 * @returns {string[]}
 */
export function invokedSkillNames(payload) {
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    return [];
  return Object.values(parsed).filter((v) => typeof v === "string");
}

/**
 * Whether one sample satisfies a case.
 *
 * A negative case asserts that no skill **of this repo's** fired. Asserting
 * that nothing fired at all would fail for a contributor who happens to have an
 * unrelated skill in `~/.claude/skills`, or when a bundled skill matches — a
 * false failure about someone else's environment rather than about these
 * skills (Copilot).
 *
 * Turn boundaries are irrelevant here — a first-move case asks only whether a
 * skill fired at all — so this reads the names and ignores the rest.
 *
 * @param {string | null} expect Skill name, or null for a negative case.
 * @param {Iterable<{payload: string} | string>} invoked
 * @param {Set<string> | null} [ours] Repo skill names. Null counts any skill.
 */
export function sampleHit(expect, invoked, ours = null) {
  const names = [...invoked].flatMap(entryNames);
  if (expect === null) {
    return ours === null ? names.length === 0 : !names.some((n) => ours.has(n));
  }
  return names.includes(expect);
}

/**
 * Whether one sample satisfies a hand-off case.
 *
 * The chain has to appear as an ordered SUBSEQUENCE of what fired, not as a
 * prefix and not as a contiguous run. Two reasons, both of which a stricter
 * match gets wrong: the model is free to load an unrelated skill in between,
 * and it may well load something before the chain's first link — neither
 * changes the fact that A led to B, which is the only claim the case makes.
 *
 * Every link after the first must land in a **strictly later assistant turn**
 * than the one before. Position in the stream is not causation: the model can
 * emit several `tool_use` blocks in one message, and it has not seen the first
 * skill's body when it does, so two `Skill` calls in the same turn are parallel
 * guesses that a flat index would happily score as a hand-off (Copilot). This
 * is the whole difference between "B was loaded after A" and "A led to B".
 *
 * The scan stays greedy, which is still correct under that constraint: taking
 * the EARLIEST occurrence of a link can only leave more room for the rest, so
 * no later starting point could succeed where the greedy one fails.
 *
 * Nothing is asserted about foreign skills here, unlike a negative case. A
 * hand-off case names exactly what it wants and a contributor's own
 * `~/.claude/skills` entry firing alongside it says nothing either way.
 *
 * @param {string[]} chain Ordered skill names, ending with the owning skill.
 * @param {Iterable<{payload: string, turn: number}>} invoked
 * @returns {boolean}
 */
export function chainHit(chain, invoked) {
  let want = 0;
  let prevTurn = -Infinity;
  for (const entry of invoked) {
    if (!entryNames(entry).includes(chain[want])) continue;
    // A link in the same turn as the previous one cannot have been caused by
    // it — the model had not seen that skill's body yet.
    if (want > 0 && !(entry.turn > prevTurn)) continue;
    prevTurn = entry.turn;
    want++;
    if (want === chain.length) return true;
  }
  return false;
}

/**
 * Score one sample against whichever kind of case it belongs to.
 *
 * @param {{ expect?: string | null, chain?: string[] }} c
 * @param {Iterable<string>} invoked
 * @param {Set<string> | null} ours
 */
export function caseHit(c, invoked, ours) {
  return isChainCase(c)
    ? chainHit(c.chain, invoked)
    : sampleHit(c.expect, invoked, ours);
}

/**
 * The only tools an eval run needs: read the repo, and load a skill.
 *
 * Enumerating what is AVAILABLE rather than only what is denied is the load-
 * bearing half. A deny list cannot bound a 14-turn run, because it only names
 * the tools known when it was written: this checkout configures an HTTP
 * `mcp-docs` server in `.mcp.json`, and a contributor's own MCP servers and
 * plugins add more tools that no list here has ever seen (Copilot). Naming the
 * four the harness actually needs closes that by construction.
 *
 * The list goes to `--tools`, which selects from the built-in set, AND to
 * `--allowedTools`, which pre-approves. The distinction matters and cost us a
 * round: `--allowedTools` grants permission, it does not filter availability,
 * so a tool a user's or a plugin's settings already permit would still have
 * been reachable across those 14 turns (Copilot). `--tools` is the restriction;
 * `--allowedTools` keeps the four from needing a prompt no headless run can
 * answer.
 */
const ALLOWED_TOOLS = ["Read", "Glob", "Grep", "Skill"];

/**
 * Tools no eval run may use, first-move or hand-off.
 *
 * Kept alongside the allow list rather than replaced by it: a deny is
 * unconditional, while an allow list governs which tools are pre-approved, so
 * the two together are stricter than either. A skill may inject `!`-prefixed
 * shell commands on load, and those run BEFORE its content reaches the model —
 * so this is what keeps a measurement from having side effects. It matters
 * more for a hand-off case than a first-move one: `--max-turns 1` was doing
 * much of the containment by itself, and a 14-turn budget removes that
 * (inspector#2204). Hence the agentic and network tools too — `Task` would spawn a
 * subagent whose own tool policy neither flag reaches.
 *
 * MCP servers are dropped outright with `--strict-mcp-config` (and no
 * `--mcp-config`) rather than named here, since their tool names are not
 * knowable from this file. What remains outside all three mechanisms is a
 * contributor's own plugin tools; `--bare` would remove those and skills with
 * them, which would measure nothing.
 *
 * The cost is stated rather than hidden: denying `Bash` also changes the path
 * a run can take toward the second skill, since investigating a repo by hand
 * often starts there. `Read`/`Glob`/`Grep` remain, which is enough to reach a
 * hand-off, but a chained rate is a measurement under this policy and not a
 * prediction of an unrestricted session.
 */
const DISALLOWED_TOOLS = [
  "Bash",
  "Write",
  "Edit",
  "NotebookEdit",
  "Task",
  "Agent",
  "SlashCommand",
  "WebFetch",
  "WebSearch",
  "KillShell",
];

/**
 * The Copilot CLI's equivalents of the three lists above (inspector#2397).
 *
 * Its permission model has the same split Claude's does, under other names:
 * `--available-tools` decides what the model can SEE ("disables all other
 * tools"), while `--allow-tool` / `--deny-tool` only decide approval and
 * "do not expose tools that were filtered out" — so availability is the
 * restriction here too, and the deny patterns are the unconditional second
 * layer. `view`/`glob`/`grep` are Copilot's read tools and `skill` is its
 * skill loader, confirmed from a live run's `toolRequests`.
 *
 * Copilot's deny list takes permission KINDS rather than tool names: `shell`
 * (every shell command), `write` (every file-modifying tool) and `url` (every
 * URL the shell or web-fetch tools would reach). `--disable-builtin-mcps`
 * drops the one MCP server it ships (`github-mcp-server`); it does not read
 * this checkout's `.mcp.json`, and any server a contributor configured is
 * invisible past `--available-tools` anyway.
 */
const COPILOT_AVAILABLE_TOOLS = ["view", "glob", "grep", "skill"];
const COPILOT_DENIED_KINDS = ["shell", "write", "url"];

/**
 * The command line for one headless run of `agent`.
 *
 * @param {string} agent One of `AGENTS`.
 * @param {number} maxTurns
 * @returns {string[]}
 */
export function agentArgs(agent, maxTurns) {
  if (agent === "copilot") {
    return [
      // No `-p`: with none, the CLI reads the prompt from piped stdin, which
      // keeps it out of argv for the same reasons as the Claude run below.
      "--output-format",
      "json",
      "--available-tools",
      COPILOT_AVAILABLE_TOOLS.join(","),
      "--allow-tool",
      COPILOT_AVAILABLE_TOOLS.join(","),
      ...COPILOT_DENIED_KINDS.flatMap((kind) => ["--deny-tool", kind]),
      "--disable-builtin-mcps",
      "--disallow-temp-dir",
      "--no-ask-user",
      // A measurement should run the CLI version it reports, not one it
      // downloaded partway through the suite.
      "--no-auto-update",
    ];
  }
  if (agent !== "claude") throw new Error(`unknown agent \`${agent}\``);
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--max-turns",
    String(maxTurns),
    // Keep the run read-only, across every turn it is given: what the
    // harness needs, minus what it must never do, minus every MCP server
    // this checkout or the contributor happens to configure.
    "--tools",
    ALLOWED_TOOLS.join(","),
    "--allowedTools",
    ALLOWED_TOOLS.join(","),
    "--disallowedTools",
    DISALLOWED_TOOLS.join(","),
    "--strict-mcp-config",
  ];
}

/**
 * Stop a child and everything it started.
 *
 * `copilot` is a Node wrapper around a native binary, and SIGTERM to the
 * wrapper does NOT reach the binary: measured on 1.0.85, the native process was
 * still running (and still spending its model call) ten seconds later. So on
 * POSIX a Copilot run is spawned as the leader of its own process group and the
 * whole group is signalled (Copilot). On Windows the CLI runs under `cmd.exe`,
 * where `taskkill /T` takes the tree.
 *
 * @param {{ pid?: number, kill: (signal: string) => unknown }} child
 * @param {string} platform
 * @param {{ spawnFn?: typeof spawn, killProcess?: typeof process.kill }} [io]
 */
export function killTree(
  child,
  platform,
  { spawnFn = spawn, killProcess = process.kill } = {},
) {
  if (child.pid === undefined) return;
  if (platform === "win32") {
    spawnFn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  try {
    killProcess(-child.pid, "SIGTERM");
  } catch {
    // The group is already gone — the run finished as the budget was reached.
  }
}

/**
 * Copilot runs still in flight, so an interrupted eval can stop them.
 *
 * A child in its own process group no longer receives the terminal's Ctrl-C,
 * which is the price of being able to signal the group — so without this, an
 * interrupted suite would leave every in-flight session running unattended.
 */
const liveCopilotRuns = new Set();

/**
 * Stop every Copilot run still in flight.
 *
 * Every way the eval can end early has to come through here: an interrupt, and
 * just as much one sample rejecting — `pool` rejects on the first failure and
 * `main().catch` exits while the other detached groups are still running, and
 * a process exit does not reach them (Copilot).
 *
 * @param {Set<{child: object, platform: string, killFn: Function}>} [runs]
 * @returns {number} How many runs were signalled.
 */
export function stopLiveCopilotRuns(runs = liveCopilotRuns) {
  let n = 0;
  for (const run of runs) {
    run.killFn(run.child, run.platform);
    n++;
  }
  runs.clear();
  return n;
}

/**
 * Drive one fresh session and return the payloads the `Skill` tool was called
 * with.
 *
 * `spawnFn` is injectable so the stream handling and — more importantly — the
 * exit handling are testable. Without a seam here, changing the nonzero branch
 * back to resolving an empty set would leave every test green while the eval
 * silently reported a plausible hit rate for runs that never happened (Copilot).
 *
 * @param {string} prompt
 * @param {{ spawnFn?: typeof spawn, cwd?: string, maxTurns?: number }} [opts]
 * @returns {Promise<{payload: string, turn: number}[]>} Skill invocations, in
 *   the order they fired, each tagged with the assistant turn it came from.
 */
export function runPrompt(
  prompt,
  {
    spawnFn = spawn,
    cwd = ROOT,
    platform = process.platform,
    maxTurns = 1,
    agent = "claude",
    killFn = killTree,
  } = {},
) {
  return new Promise((resolve, reject) => {
    // The prompt goes in on STDIN, not in argv. `claude -p` with piped stdin
    // reads the prompt from it (verified), and that removes two problems at
    // once: on Windows the CLI is a `.cmd` shim, so it can only be started
    // through a shell, and `cmd.exe` would re-parse any prompt containing a
    // metacharacter as syntax (Copilot). It also keeps the prompt out of the
    // process table.
    const { command, args, options } = cliSpawnArgs(
      agent,
      agentArgs(agent, maxTurns),
      {
        cwd,
        stdio: ["pipe", "pipe", "inherit"],
        // Its own process group, so `killTree` can reach the native binary the
        // wrapper starts. Windows has no groups; `taskkill /T` covers it.
        ...(agent === "copilot" && platform !== "win32"
          ? { detached: true }
          : {}),
      },
      platform,
    );
    const p = spawnFn(command, args, options);
    const run = { child: p, platform, killFn };
    if (agent === "copilot") liveCopilotRuns.add(run);
    const collect =
      agent === "copilot"
        ? collectCopilotSkillInvocations
        : collectSkillInvocations;
    // Copilot has no `--max-turns`, so the budget is enforced from outside: once
    // the stream has shown `maxTurns` model calls, the run has made every move
    // it is being scored on, and the rest would only spend metered calls.
    let stopped = false;

    let buf = "";
    const invoked = [];
    let result = null;
    // Carried across chunks so the turn count is monotonic over the whole
    // stream rather than restarting at each read.
    let turnOffset = 0;
    p.stdout.on("data", (chunk) => {
      if (stopped) return;
      const parsed = collect(buf + chunk.toString(), turnOffset);
      buf = parsed.rest;
      turnOffset = parsed.nextTurn;
      for (const entry of parsed.invoked) {
        // A pipe does not preserve event boundaries, so one chunk can carry a
        // model call past the budget — even the whole rest of the run, result
        // included. Scoring is bounded by turn number rather than by when the
        // stop happened to land (Copilot). Claude's own `--max-turns` already
        // bounds its stream.
        if (agent === "copilot" && entry.turn > maxTurns) continue;
        invoked.push(entry);
      }
      if (parsed.result !== null) result = parsed.result;
      if (agent === "copilot" && turnOffset >= maxTurns && result === null) {
        stopped = true;
        result = "turn_budget";
        killFn(p, platform);
      }
    });
    p.on("error", reject);
    p.on("close", (code) => {
      liveCopilotRuns.delete(run);
      const rejection = runRejection({ result, code });
      if (rejection !== null) {
        // An unauthenticated `copilot` answers `--version` fine, then prints
        // its login hint to the stdout this run captures and exits with no
        // events — so the one actionable fact would otherwise be swallowed.
        const hint =
          agent === "copilot" && result === null
            ? " — if it is not signed in, run `copilot` and `/login`, or export COPILOT_GITHUB_TOKEN"
            : "";
        reject(
          new Error(`\`${agent}\` ${rejection}${hint} for prompt: ${prompt}`),
        );
        return;
      }
      resolve(invoked);
    });
    p.stdin?.end(prompt);
  });
}

/**
 * Read `copilot --version` (`GitHub Copilot CLI 1.0.85.`) down to its version.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function parseCopilotVersion(text) {
  return /^GitHub Copilot CLI (\d+\.\d+\.\d+)/m.exec(text)?.[1] ?? null;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/**
 * Whether an env-supplied count is usable as a run, turn or worker count.
 *
 * @param {number} value
 */
export function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Whether a measured rate clears its bar.
 *
 * The comparison differs by case kind, and the difference is the point. A
 * first-move threshold is a floor to reach (`>=` 0.8 means four of five). A
 * chain threshold states "the pointer is taken more often than not", which is
 * strictly `> 0.5` — an inclusive compare would pass 2/4 whenever RUNS is even
 * and report a result the stated criterion does not license (Copilot).
 *
 * @param {number} rate
 * @param {number} threshold
 * @param {boolean} strict
 */
export function passesThreshold(rate, threshold, strict) {
  return strict ? rate > threshold : rate >= threshold;
}

/**
 * Render the whole report, and say how many cases fell short.
 *
 * Extracted and exported so the SEPARATION itself is testable. The acceptance
 * criterion of inspector#2204 is that a hand-off rate is never folded into the
 * first-move headline, and until this was a function that claim had no
 * automated coverage at all: the tests exercised the scorers and the turn
 * budget while the reporting — the thing that could silently merge the two
 * measurements — lived inside `main` where nothing could reach it (Copilot).
 *
 * @param {object[]} cases
 * @param {{c: object, invoked: Iterable<string>}[]} results One per sample.
 * @param {Set<string> | null} ours
 * @param {{threshold: number, chainThreshold: number, chainMaxTurns: number,
 *   agent?: string}} opts
 * @returns {{ lines: string[], failed: number }}
 */
export function formatReport(cases, results, ours, opts) {
  const lines = [];

  const group = (members, heading, threshold, strict) => {
    if (members.length === 0) return 0;
    lines.push("", heading);
    let short = 0;
    for (const c of members) {
      const mine = results.filter((r) => r.c === c);
      const passes = mine.filter((r) => caseHit(c, r.invoked, ours)).length;
      const rate = mine.length === 0 ? 0 : passes / mine.length;
      const ok = mine.length > 0 && passesThreshold(rate, threshold, strict);
      if (!ok) short++;
      const label = isChainCase(c)
        ? c.chain.join(" → ")
        : (c.expect ?? "(no skill)");
      lines.push(
        `${ok ? "PASS" : "FAIL"} ${(rate * 100).toFixed(0).padStart(3)}%  ${label.padEnd(26)} ${c.prompt}`,
      );
    }
    return short;
  };

  const direct = cases.filter((c) => !isChainCase(c));
  const chained = cases.filter(isChainCase);
  // Every heading names the agent, so a Copilot report pasted next to a Claude
  // one cannot be read as the same measurement (inspector#2397).
  const agent = opts.agent ?? "claude";
  const directShort = group(
    direct,
    `First move (1 turn) — ${agent}`,
    opts.threshold,
    false,
  );
  const chainedShort = group(
    chained,
    `Hand-off (${opts.chainMaxTurns} turns) — ${agent}`,
    opts.chainThreshold,
    true,
  );
  const failed = directShort + chainedShort;

  // Two numbers, never one. A hand-off is a second-hop load over many turns and
  // a first-move rate is the model's opening move; summing them would produce a
  // figure that describes neither, and a handful of hand-off cases would
  // quietly move a headline everyone reads as trigger reliability (inspector#2204).
  lines.push("");
  if (direct.length > 0) {
    lines.push(
      `${direct.length - directShort}/${direct.length} ${agent} first-move cases at or above ${opts.threshold * 100}%.`,
    );
  }
  lines.push(
    chained.length === 0
      ? `No ${agent} hand-off cases in this selection.`
      : `${chained.length - chainedShort}/${chained.length} ${agent} hand-off cases above ${opts.chainThreshold * 100}%.`,
  );
  return { lines, failed };
}

async function main() {
  // The chain bar is strict, so 1.0 cannot be cleared by any run and would fail
  // every hand-off case while looking like a trigger problem. NaN and negative
  // values are rejected for the same reason from the other side: `Number("abc")`
  // is NaN, which fails every comparison and prints an `above NaN%` summary,
  // and a negative bar passes every chain unconditionally — both turn an
  // advertised knob into a measurement that quietly means nothing (Copilot).
  if (
    !Number.isFinite(CHAIN_THRESHOLD) ||
    CHAIN_THRESHOLD < 0 ||
    CHAIN_THRESHOLD >= 1
  ) {
    console.error(
      `skills:eval — CHAIN_THRESHOLD must be a number in [0, 1) (got ${process.env.CHAIN_THRESHOLD ?? CHAIN_THRESHOLD}); it is a strict lower bound.`,
    );
    process.exit(1);
  }
  if (!Number.isFinite(THRESHOLD) || THRESHOLD < 0 || THRESHOLD > 1) {
    // The first-move bar is inclusive, so 1.0 is meetable and allowed; the
    // non-finite and negative cases fail the same way as above.
    console.error(
      `skills:eval — THRESHOLD must be a number in [0, 1] (got ${process.env.THRESHOLD ?? THRESHOLD}).`,
    );
    process.exit(1);
  }
  // The turn budget is also Copilot's external stop condition, so a non-numeric
  // value would silently remove the cap on metered calls (`turnOffset >= NaN`
  // is never true); RUNS and CONCURRENCY fail the same quiet way (Copilot,
  // #4895).
  for (const [name, value] of [
    ["CHAIN_MAX_TURNS", CHAIN_MAX_TURNS],
    ["RUNS", RUNS],
    ["CONCURRENCY", CONCURRENCY],
  ]) {
    if (!isPositiveInteger(value)) {
      console.error(
        `skills:eval — ${name} must be a positive integer (got ${process.env[name] ?? value}).`,
      );
      process.exit(1);
    }
  }
  if (!AGENTS.includes(AGENT)) {
    console.error(
      `skills:eval — AGENT must be one of ${AGENTS.join(", ")} (got \`${AGENT}\`).`,
    );
    process.exit(1);
  }
  const version = probeCliVersion(
    AGENT,
    AGENT === "claude" ? parseClaudeVersion : parseCopilotVersion,
  );
  if (version === null) {
    console.error(
      AGENT === "claude"
        ? "skills:eval — no usable `claude` CLI on PATH. This eval needs one."
        : "skills:eval — no usable `copilot` CLI on PATH. Install it with " +
            "`npm install -g @github/copilot` and sign in (`copilot` then " +
            "`/login`, or export COPILOT_GITHUB_TOKEN), then re-run.",
    );
    process.exit(1);
  }

  const { cases, ours } = collectCases(
    process.argv.length > 2 ? process.argv.slice(2) : undefined,
  );
  if (cases.length === 0) {
    console.error("skills:eval — no cases found.");
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      stopLiveCopilotRuns();
      process.exit(130);
    });
  }

  const jobs = cases.flatMap((c) => Array.from({ length: RUNS }, () => c));
  const results = await pool(jobs, CONCURRENCY, async (c) => ({
    c,
    invoked: await runPrompt(c.prompt, {
      maxTurns: isChainCase(c) ? CHAIN_MAX_TURNS : 1,
      agent: AGENT,
    }),
  }));

  const { lines, failed } = formatReport(cases, results, ours, {
    threshold: THRESHOLD,
    chainThreshold: CHAIN_THRESHOLD,
    chainMaxTurns: CHAIN_MAX_TURNS,
    agent: AGENT,
  });
  for (const line of lines) console.log(line);
  process.exit(failed > 0 ? 1 : 0);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((e) => {
    stopLiveCopilotRuns();
    console.error(e.message ?? e);
    process.exit(1);
  });
}
