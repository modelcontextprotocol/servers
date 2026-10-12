/**
 * The guard that keeps the LOCAL pre-push gate out of GitHub CI, and every CI
 * job bounded by a timeout (#4871). Adapted from the MCP Inspector's
 * `scripts/lib/workflow-gate.mjs` (inspector#2146).
 *
 * Two tiers run the same checks and are deliberately not the same command:
 *
 *   - **GitHub CI** (`.github/workflows/**`) runs each check as its own job or
 *     matrix leg, on a fresh install.
 *   - **`npm run local:gate`**, the pre-push gate, runs every one of those
 *     checks on the developer's machine under a machine-wide lease
 *     (`scripts/gate-lease.mjs`), plus `verify:install-fresh`, which only means
 *     something where `node_modules` can be stale.
 *
 * The `local:` script namespace means local-only by construction. A workflow
 * that ran `npm run local:gate` would queue on a lease no other job shares and
 * collapse CI's parallel legs into one serial run; and once CI runs the local
 * gate, "local" stops meaning anything, so the next local-only step (a check
 * that needs the developer's own tools, say) has nowhere to live. Naming the
 * gate `local:gate` removes the *invitation* to add it to a workflow. This
 * removes the *possibility*.
 *
 * WHAT IT FORBIDS, and nothing more: invoking a `local:*` script from a
 * workflow, whether the name is spelled out (`local:gate`) or built from an
 * expression or a shell variable (`local:${{ matrix.task }}`, `local:$TASK`).
 * A name the guard cannot read is treated as a forbidden one rather than waved
 * through. Note the limit: a fully opaque `npm run ${{ matrix.script }}` names
 * no family at all and is not detectable here.
 *
 * The Inspector's version also forbids its non-Chromium browser-engine passes
 * and a `SMOKE_BROWSER` override. This repo has servers, not a browser client,
 * so those rules (and the `lib/headless-browser.mjs` import they needed) are
 * dropped rather than ported.
 *
 * ONLY EXECUTABLE POSITIONS ARE SCANNED, found by parsing the file rather than
 * by matching lines: `run:` scalars (inline and block), a custom `shell:`
 * command template (step-level, and `defaults.run.shell` at workflow and job
 * level), and the values of an `env:`, `container.env:` or `with:` mapping.
 * Everything else in a workflow is metadata that runs nothing, so scanning it
 * produces findings that are simply false: `name: Explain why local:gate stays
 * local` executes nothing. Comments fall out for the same reason, so the two
 * tiers stay documentable in the files that implement one of them.
 *
 * That is a real limit, stated rather than hidden: an execution vector outside
 * those positions (a custom action that reads a script name from somewhere
 * else, say) is not seen.
 *
 * THE TIMEOUT RULE (`findJobsWithoutTimeout`) is this repo's addition. A job
 * with no `timeout-minutes` runs to GitHub's six-hour default when it hangs,
 * holding a runner and leaving the PR's check pending instead of red. Every
 * job that runs steps must declare one. A job that only calls a reusable
 * workflow (`uses:` at job level) cannot carry the key, so it is exempt; the
 * called workflow's own jobs carry theirs.
 */

import {
  LineCounter,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
} from "yaml";

/** Scripts whose `local:` prefix declares them local-only. */
export const LOCAL_SCRIPT_PREFIX = "local:";

/** Reasons a finding can carry, kept as constants so tests pin them. */
export const VIOLATION = {
  LOCAL_SCRIPT: "local-only-script",
  NO_TIMEOUT: "job-without-timeout",
};

// The name may be spelled out (`local:gate`) or built from something the guard
// cannot read: a GitHub expression (`${{ … }}`) or a shell variable the script
// expands itself (`$TASK`, `${TASK}`, `$env:TASK`, or cmd's `%TASK%`). All of
// them resolve to *some* `local:` script at run time, and none may be invoked
// from a workflow.
//
// The unreadable arm keys off the leading `$`/`%` and then runs to the end of
// the line, rather than trying to find a matching `}}`. An expression body can
// itself contain braces (`${{ format('{0}', matrix.task) }}`), so a
// `[^}]*\}\}` body stops at the first `}` and misses exactly the case worth
// catching. A prefix cannot be defeated by nesting, and since these are display
// strings the greedy tail costs nothing.
const UNREADABLE = String.raw`[$%][^\n]*`;
const LOCAL_SCRIPT_RE = new RegExp(
  String.raw`\blocal:(?:[a-z0-9][a-z0-9:-]*|${UNREADABLE})`,
  "gi",
);

/**
 * The executable scalars of a workflow, with the line each came from.
 *
 * Parsed with the `yaml` package rather than by hand. The first two rounds of
 * this guard did hand-roll it, and both were wrong in the same direction — a
 * regex that stopped at the first `}`, then an opener that could not see
 * `run: | # explanation` or a flow mapping (`env: { NAME: value }`). Each miss is a workflow that invokes a forbidden pass while
 * `test:scripts` stays green, which is worse than no guard, because it reports
 * a coverage that is not there. YAML has too many spellings of the same thing
 * to recognize by indentation; a real parser knows all of them.
 *
 * `yaml` is already a root devDependency (`verify:skills` parses frontmatter
 * with it), so this adds no install.
 *
 * The walk is STRUCTURAL — it descends the schema's executable paths
 * (workflow `env`/`defaults.run.shell`, job `env`/`container.env`/`with`/
 * `defaults.run.shell`, step `run`/`shell`/`env`/`with`) rather than
 * matching pairs by key name anywhere in the tree. Key-name matching looks
 * equivalent and is not: workflow input ids are user-defined, so an input
 * legitimately named `env` puts its own `description` and `default` in front of
 * the rules, and a doc string mentioning `npm run local:gate` fails the gate. A guard that fails on documentation of itself does not
 * survive contact with a contributor.
 *
 * ALIASES ARE RESOLVED. An alias node carries no `.value`, so reading one as a
 * scalar yields the empty string — and `run: *command`, with the command
 * anchored in a metadata scalar the walk never visits, would invoke anything at
 * all while the guard saw nothing. Findings are reported at the line
 * where the alias is USED, not where its anchor was defined, since that is the
 * line to change.
 *
 * A parse error THROWS rather than yielding no regions: a workflow the guard
 * cannot read must not pass as a workflow with nothing in it.
 *
 * A multi-line `run:` block is one region carrying the whole script, reported
 * at the line of its `run:` key rather than at the offending line inside it.
 * The finding also prints what it matched, so that is still actionable.
 *
 * @param {string} text
 * @param {string} [file] only for the parse-error message
 * @returns {Array<{line: number, kind: string, text: string}>}
 */
export function extractExecutableRegions(text, file = "<workflow>") {
  const lineCounter = new LineCounter();
  const docs = parseAllDocuments(text, { lineCounter });
  const regions = [];

  for (const doc of docs) {
    if (doc.errors.length > 0) {
      throw new Error(
        `workflow-gate: could not parse ${file}: ${doc.errors[0].message}`,
      );
    }

    const lineOf = (node) => lineCounter.linePos(node.range[0]).line;
    const deref = (node) => (isAlias(node) ? node.resolve(doc) : node);

    /** A `run:` command — one scalar, reported where it is written or aliased. */
    const addCommand = (node) => {
      if (node == null) return;
      const resolved = deref(node);
      if (!isScalar(resolved)) return;
      regions.push({
        line: lineOf(node),
        kind: "run",
        text: String(resolved.value ?? ""),
      });
    };

    /**
     * An `env:` or `with:` mapping. Each entry is rebuilt as `NAME: value` so
     * the rules read it the way they read a shell assignment — and so an entry
     * with NO value (valid YAML, and an empty-string override) still reaches
     * them.
     */
    const addMapping = (kind, node) => {
      if (node == null) return;
      const map = deref(node);
      if (!isMap(map)) return;
      for (const entry of map.items) {
        if (!isScalar(entry.key)) continue;
        const value = deref(entry.value);
        const text = isScalar(value) ? String(value.value ?? "") : "";
        regions.push({
          line: lineOf(entry.key),
          kind,
          name: String(entry.key.value),
          value: text,
          text: `${String(entry.key.value)}: ${text}`,
        });
      }
    };

    const at = (node, key) => (isMap(node) ? node.get(key, true) : undefined);

    /**
     * `defaults.run.shell` — a custom `shell:` is a COMMAND TEMPLATE that
     * Actions runs around every script (`{0}` is the script path), so
     * `shell: npm run local:gate && bash {0}` invokes the gate while the `run:`
     * value beside it looks harmless. An ordinary `bash`/`pwsh`/`cmd`
     * matches none of the rules, so naming it here costs nothing.
     */
    const addDefaultShell = (node) =>
      addCommand(at(deref(at(deref(node), "run")), "shell"));

    const root = deref(doc.contents);
    if (!isMap(root)) continue;
    addMapping("env", at(root, "env"));
    addDefaultShell(at(root, "defaults"));

    const jobs = deref(at(root, "jobs"));
    if (!isMap(jobs)) continue;
    for (const jobEntry of jobs.items) {
      const job = deref(jobEntry.value);
      if (!isMap(job)) continue;
      addMapping("env", at(job, "env"));
      // A job-level `with:` is the input block of a reusable-workflow call.
      addMapping("with", at(job, "with"));
      // `container.env` is job-wide too: every step running in the container
      // sees it. `container:` may also be a bare image string, which
      // `addMapping` ignores.
      addMapping("env", at(deref(at(job, "container")), "env"));
      addDefaultShell(at(job, "defaults"));

      const steps = deref(at(job, "steps"));
      if (!isSeq(steps)) continue;
      for (const stepNode of steps.items) {
        const step = deref(stepNode);
        if (!isMap(step)) continue;
        addCommand(at(step, "run"));
        addCommand(at(step, "shell"));
        addMapping("env", at(step, "env"));
        addMapping("with", at(step, "with"));
      }
    }
  }

  return regions;
}

/**
 * Scan one workflow file's text for invocations that must stay local-only.
 *
 * Pure: takes text, returns findings. `file` is carried through only so a
 * caller can report where a finding came from.
 *
 * @param {string} text
 * @param {string} [file]
 * @returns {Array<{file: string, line: number, rule: string, match: string, message: string}>}
 */
export function findWorkflowViolations(text, file = "<workflow>") {
  const findings = [];

  for (const region of extractExecutableRegions(text, file)) {
    // Inside a `run:` block the parser hands back the shell comments too, and
    // a comment invokes nothing.
    const line = region.text
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");
    for (const match of line.matchAll(LOCAL_SCRIPT_RE)) {
      findings.push({
        file,
        line: region.line,
        rule: VIOLATION.LOCAL_SCRIPT,
        match: match[0],
        message:
          `\`${match[0]}\` is a local-only script — the \`${LOCAL_SCRIPT_PREFIX}\` prefix means ` +
          `it runs in the pre-push gate, never in GitHub CI.`,
      });
    }
  }

  return findings;
}

/**
 * The jobs in one workflow file that run steps without a `timeout-minutes`.
 *
 * A job-level `uses:` (a reusable-workflow call) is exempt: GitHub rejects
 * `timeout-minutes` there. An expression value (`${{ … }}`) is accepted, since
 * it still bounds the job; an absent, empty, zero or negative one is not.
 *
 * @param {string} text
 * @param {string} [file]
 * @returns {Array<{file: string, line: number, rule: string, match: string, message: string}>}
 */
export function findJobsWithoutTimeout(text, file = "<workflow>") {
  const lineCounter = new LineCounter();
  const docs = parseAllDocuments(text, { lineCounter });
  const findings = [];

  for (const doc of docs) {
    if (doc.errors.length > 0) {
      throw new Error(
        `workflow-gate: could not parse ${file}: ${doc.errors[0].message}`,
      );
    }
    const deref = (node) => (isAlias(node) ? node.resolve(doc) : node);
    const at = (node, key) => (isMap(node) ? node.get(key, true) : undefined);

    const jobs = deref(at(deref(doc.contents), "jobs"));
    if (!isMap(jobs)) continue;
    for (const jobEntry of jobs.items) {
      const job = deref(jobEntry.value);
      if (!isMap(job) || at(job, "uses") !== undefined) continue;
      const timeout = deref(at(job, "timeout-minutes"));
      const value = isScalar(timeout) ? timeout.value : undefined;
      const bounded =
        (typeof value === "number" && value > 0) ||
        (typeof value === "string" && value.trim().startsWith("${{"));
      if (bounded) continue;
      const name = String(jobEntry.key?.value ?? "<job>");
      findings.push({
        file,
        line: lineCounter.linePos(jobEntry.key.range[0]).line,
        rule: VIOLATION.NO_TIMEOUT,
        match: name,
        message:
          `job \`${name}\` declares no \`timeout-minutes\`, so a hang runs to GitHub's ` +
          `six-hour default. Add one sized from the job's observed runs.`,
      });
    }
  }

  return findings;
}

/**
 * What one workflow runs, for the CI-parity assertion: the npm scripts and the
 * `scripts/*.mjs` files its steps invoke, and whether it runs on a push or a
 * pull request at all (a workflow that runs only on a dispatch or a published
 * Release, such as the release itself, is not a check on a change).
 *
 * Read from the same executable regions the rules above scan, so a step
 * `name:` or a comment that mentions a script is not counted. `node --test`
 * invocations are left out: they run test files, which the gate reaches
 * through `test:scripts`'s glob rather than by name.
 *
 * @param {string} text
 * @param {string} [file]
 * @returns {{ onChange: boolean, npmScripts: string[], nodeScripts: string[] }}
 */
export function workflowCommands(text, file = "<workflow>") {
  const npmScripts = new Set();
  const nodeScripts = new Set();
  for (const region of extractExecutableRegions(text, file)) {
    if (region.kind !== "run") continue;
    const script = region.text
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");
    for (const m of script.matchAll(
      /\bnpm run(?:-script)? ([a-z0-9][\w:.-]*)/gi,
    ))
      npmScripts.add(m[1]);
    for (const m of script.matchAll(/\bnode (scripts\/[\w./-]+\.mjs)\b/g))
      nodeScripts.add(m[1]);
  }
  const [doc] = parseAllDocuments(text);
  const on = doc?.toJS()?.on;
  const triggers =
    typeof on === "string"
      ? [on]
      : Array.isArray(on)
        ? on
        : Object.keys(on ?? {});
  return {
    onChange: triggers.some((t) => t === "push" || t === "pull_request"),
    npmScripts: [...npmScripts].sort(),
    nodeScripts: [...nodeScripts].sort(),
  };
}

/**
 * Render findings as a single message, for an assertion failure or a CLI.
 *
 * @param {ReturnType<typeof findWorkflowViolations>} findings
 * @returns {string}
 */
export function formatWorkflowViolations(findings) {
  return findings
    .map((f) => `  ${f.file}:${f.line}  [${f.rule}]  ${f.message}`)
    .join("\n");
}
