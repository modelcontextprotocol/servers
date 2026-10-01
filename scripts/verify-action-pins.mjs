#!/usr/bin/env node
// Guard: every action a CREDENTIALED job runs is pinned to a commit SHA (#4873).
// Ported from the MCP Inspector's `scripts/verify-action-pins.mjs`
// (inspector#2484).
//
// This repo's workflows use moving major tags (`actions/checkout@v6`), and for
// an ordinary CI job that stays the convention. It is the wrong rule for a job
// holding a credential: a tag is mutable, so whoever can move `v6` replaces the
// code that runs next to the credential, on the next run, with no change in
// this repository. A SHA cannot be moved. So the narrower rule is: a job
// holding a credential runs only SHA-pinned actions, each with a trailing
// `# vX.Y.Z` comment naming the release the SHA was resolved from. The comment
// is what a reviewer reads, and what the dependency sweep planned in #4874
// will read to report a newer release (`scripts/lib/action-refs.mjs` holds the
// matcher both use).
//
// A job counts as credentialed when it
//
//   1. can mint an OIDC token or push a package: `id-token: write` or
//      `packages: write` (or `write-all`), in its own `permissions:` or, absent
//      one, the workflow's. Here that is `release.yml`'s two publish jobs and
//      `claude.yml`;
//   2. is handed any secret other than `GITHUB_TOKEN`, its own or through the
//      workflow-level `env:`, in any spelling of the expression (`secrets.X`,
//      `secrets['X']`, `secrets[matrix.name]`), or as a reusable-workflow
//      call's `secrets: inherit` (a `secrets:` mapping is read like any other
//      expression, so one passing only `GITHUB_TOKEN` does not count). Here
//      that is `claude.yml` again, for `ANTHROPIC_API_KEY`; or
//   3. uploads an artifact that a credentialed job downloads and has anywhere
//      in its transitive `needs` (an artifact is scoped to the run, so a job
//      can download from any job that finished before it), so every producer
//      in a `source → package → publish` chain counts, not only the last. A
//      job that calls a reusable workflow counts as a producer too, since the
//      called workflow can upload into the same run and is not read here. Here that is `release.yml`'s two build jobs:
//      each builds the tarball or wheel its publish job hands to the registry
//      under provenance, so a moved tag in the build job publishes as surely
//      as one in the publish job would. (The build was split out of the
//      publish job to keep the OIDC token away from dependency installs; this
//      keeps a moving tag out of what gets published.); or
//   4. has outputs that a credentialed job reads (`needs.<job>.outputs.…`).
//      The reader acts on them next to its credential. Here that is
//      `release.yml`'s `detect-packages`: the publish jobs take from it the
//      name and version an artifact must match before it is published, so a
//      moved tag there could approve a tampered artifact.
//
// `GITHUB_TOKEN` alone does not count: every job holds one, so counting it
// would turn this into "pin everything", which #4873 does not ask. That is why
// `version-packages.yml` and `prepare-python-release.yml` are out of scope
// although they push branches, and why an upload nothing credentialed
// downloads (`python.yml`'s `dist` artifact) is too.
//
// Parsed with `yaml` (already a root devDependency), for the reason
// `scripts/lib/workflow-gate.mjs` records: hand-rolled workflow parsing loses
// to spellings it had not anticipated. Comments are not data to the parser, so
// a comment that quotes `id-token: write` while explaining why a job does NOT
// hold it cannot trip rule 1, and the one comment that matters, the
// `# vX.Y.Z` after a `uses:`, is read off its node.
//
// Checked offline: a SHA that does not match its comment's release cannot be
// seen without the network. Resolve both from the same lookup when bumping
// (the `release` skill has the command).
//
// ⚠️ Local `./…` actions and reusable workflows are REFUSED in a credentialed
// job, not skipped. The remote `uses:` INSIDE one runs under its caller's
// credentials, and this guard reads neither composite-action files nor called
// workflows, so a local definition could carry a tag-pinned action past it.
// None exists in this repo. Adding the first one to a credentialed job means
// teaching this guard to follow it; until then it is a finding (the Inspector's
// guard skips them with a warning, which leaves the bypass open).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAlias, isMap, isScalar, isSeq, parseDocument, visit } from "yaml";
import { isPinned, parseUses } from "./lib/action-refs.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// `GITHUB_TOKEN` in either accessor spelling; removed before looking for any
// other `secrets` reference, so every spelling of every other name, a dynamic
// index included, still reads as a secret.
const DEFAULT_TOKEN =
  /\bsecrets\s*(?:\.\s*GITHUB_TOKEN\b|\[\s*(['"])GITHUB_TOKEN\1\s*\])/g;
// Where the first expression in a string opens. Everything from there on is
// searched, rather than each `${{ … }}` body: finding where an expression ENDS
// needs a parser, since a quoted string inside one may itself contain `}}`
// (`${{ format('}}{0}', secrets.X) }}`), and a body cut short at that point
// hides the secret after it. Searching the tail cannot be fooled that way. It
// can over-count a string that mentions `secrets` in prose after an
// expression, which errs toward requiring a pin.
const EXPRESSION_OPEN = "${{";

/** Does this `permissions:` value let the job mint a token or push a package? */
function mints(permissions) {
  if (permissions === "write-all") return true;
  if (permissions === null || typeof permissions !== "object") return false;
  return (
    permissions["id-token"] === "write" || permissions.packages === "write"
  );
}

/** Every string anywhere in a parsed value — keys excluded, as they hold no expression. */
function stringsIn(value) {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(stringsIn);
}

/**
 * Is this job handed any secret but `GITHUB_TOKEN`? `inherited` is the
 * workflow-level `env:`, which every job receives the way a job with no
 * `permissions:` of its own receives the workflow's.
 */
function handedSecret(job, inherited) {
  // `inherit` hands over every secret with no expression to scan. A mapping
  // is scanned below with everything else.
  if (job.secrets === "inherit") return true;
  return stringsIn([job, inherited]).some((text) => {
    const open = text.indexOf(EXPRESSION_OPEN);
    return (
      open !== -1 &&
      /\bsecrets\b/.test(text.slice(open).replace(DEFAULT_TOKEN, ""))
    );
  });
}

const needsOf = (job) =>
  job.needs == null ? [] : [job.needs].flat().map(String);

// GitHub resolves an action's owner and repository without regard to case, so
// `Actions/Upload-Artifact@v7` is the same action and must be recognized.
const stepsUsing = (job, action) =>
  (job.steps ?? []).some(
    (step) =>
      typeof step?.uses === "string" &&
      step.uses.toLowerCase().startsWith(action),
  );

/**
 * Can this job have produced an artifact? It can when one of its steps
 * uploads one, and also when it CALLS A REUSABLE WORKFLOW: the called
 * workflow's jobs upload into the same run, and this guard does not read
 * them. So a workflow call upstream of a credentialed downloader is counted
 * rather than assumed harmless, which makes its own ref subject to the pin.
 */
const mayUploadArtifact = (job) =>
  typeof job.uses === "string" || stepsUsing(job, "actions/upload-artifact@");

/**
 * Can this job download an artifact? The same reasoning, the other way round:
 * a called workflow's jobs can download anything uploaded earlier in the run.
 */
const mayDownloadArtifact = (job) =>
  typeof job.uses === "string" || stepsUsing(job, "actions/download-artifact@");

/**
 * @param {string} yaml raw contents of a workflow file
 * @param {string} [file] only for the parse-error message
 */
function parseWorkflow(yaml, file = "<workflow>") {
  const doc = parseDocument(yaml);
  if (doc.errors.length > 0)
    throw new Error(
      `verify:action-pins: could not parse ${file}: ${doc.errors[0].message}`,
    );
  return doc;
}

/**
 * The names of the jobs in this workflow that hold a credential, per the rules
 * in the header.
 *
 * @param {string} yaml raw contents of a workflow file
 * @param {string} [file] only for the parse-error message
 * @returns {Set<string>}
 */
export function credentialedJobs(yaml, file) {
  const workflow = parseWorkflow(yaml, file).toJS() ?? {};
  const jobs = Object.entries(workflow.jobs ?? {});
  const held = new Set();
  for (const [name, job] of jobs) {
    const permissions =
      "permissions" in job ? job.permissions : workflow.permissions;
    if (mints(permissions) || handedSecret(job, workflow.env)) held.add(name);
  }
  // Artifacts are scoped to the run, not to a `needs` edge: a job can download
  // what ANY job that finished before it uploaded, which is every job in its
  // transitive `needs`. So for `source (uploads) → bridge → publish
  // (downloads)`, `source` counts although `bridge` neither downloads nor
  // re-uploads. To a fixed point, because marking a producer credentialed
  // makes its own downloads count, and job order in the file says nothing
  // about the chain.
  const upstreamOf = (name) => {
    const seen = new Set();
    const queue = [...needsOf(workflow.jobs[name])];
    while (queue.length > 0) {
      const next = queue.pop();
      if (seen.has(next) || !workflow.jobs[next]) continue;
      seen.add(next);
      queue.push(...needsOf(workflow.jobs[next]));
    }
    return seen;
  };
  // The jobs whose outputs a job reads: every `needs.<job>.outputs` anywhere
  // in it. `needs.*.outputs` and a dynamic index name no job, so they count
  // every job it needs.
  const outputsReadBy = (job) => {
    const read = new Set();
    for (const text of stringsIn(job)) {
      if (!text.includes(EXPRESSION_OPEN)) continue;
      for (const m of text.matchAll(
        /\bneeds\s*(?:\.\s*([\w-]+|\*)|\[\s*(?:'([^']*)'|"([^"]*)"|[^\]]*)\s*\])\s*(?:\.\s*outputs\b|\[\s*['"]outputs['"]\s*\])/g,
      )) {
        const named = m[1] ?? m[2] ?? m[3];
        if (named === undefined || named === "*")
          for (const n of needsOf(job)) read.add(n);
        else read.add(named);
      }
    }
    return read;
  };
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, job] of jobs) {
      if (!held.has(name)) continue;
      for (const source of outputsReadBy(job)) {
        if (workflow.jobs[source] && !held.has(source)) {
          held.add(source);
          grew = true;
        }
      }
      if (!mayDownloadArtifact(job)) continue;
      for (const producer of upstreamOf(name)) {
        if (!held.has(producer) && mayUploadArtifact(workflow.jobs[producer])) {
          held.add(producer);
          grew = true;
        }
      }
    }
  }
  return held;
}

/**
 * Every `uses:` in a credentialed job that is not a 40-hex SHA followed by a
 * `# vX.Y.Z` comment: each step's, and the job's own when it calls a reusable
 * workflow, whose ref is just as mutable. A local (`./…`) action or workflow
 * is a finding too: what it runs is not read here (see the header).
 *
 * A YAML alias anywhere in a credentialed job is itself a finding. Resolving it
 * here would accept a pin that a line-oriented reader (a reviewer, or a sweep
 * that reads `uses:` lines) cannot see where it is used; spelling the ref out
 * is the only form both can read.
 *
 * @param {string} yaml raw contents of a workflow file
 * @param {string} [file] only for the parse-error message
 * @returns {Array<{job: string, uses: string}>}
 */
export function unpinnedRefs(yaml, file) {
  const held = credentialedJobs(yaml, file);
  const jobs = parseWorkflow(yaml, file).get("jobs", true);
  const problems = [];
  if (!isMap(jobs)) return problems;
  for (const { key, value } of jobs.items) {
    const name = String(isScalar(key) ? key.value : key);
    if (!held.has(name)) continue;
    if (!isMap(value)) {
      if (isAlias(value))
        problems.push({ job: name, uses: `*${value.source}` });
      continue;
    }
    visit(value, {
      Alias: (_, node) => {
        problems.push({ job: name, uses: `*${node.source}` });
      },
    });
    const steps = value.get("steps", true);
    const nodes = [
      value.get("uses", true),
      ...(isSeq(steps) ? steps.items : []).map((step) =>
        isMap(step) ? step.get("uses", true) : undefined,
      ),
    ];
    for (const node of nodes) {
      if (!isScalar(node) || typeof node.value !== "string") continue;
      const uses = node.value;
      // A local definition, a value with no `@ref` at all, and a container
      // image are not pins either: `parseUses` returns null for all three.
      if (parseUses(uses) === null || !isPinned(uses, node.comment))
        problems.push({ job: name, uses });
    }
  }
  return problems;
}

export function main(root = repoRoot) {
  const dir = path.join(root, ".github", "workflows");
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  const problems = [];
  let jobs = 0;
  for (const file of files) {
    const yaml = readFileSync(path.join(dir, file), "utf8");
    jobs += credentialedJobs(yaml, file).size;
    for (const p of unpinnedRefs(yaml, file))
      problems.push(`  ${file} → ${p.job}: ${p.uses}`);
  }
  if (problems.length > 0) {
    console.error(
      `verify:action-pins — ${problems.length} action ref(s) in a credentialed job are not SHA-pinned:\n` +
        problems.join("\n") +
        "\n\nA job holding `id-token`/`packages: write`, a non-default secret, or building an" +
        "\nartifact such a job consumes runs only immutable refs. Pin each as" +
        "\n  uses: owner/repo@<40-hex sha> # vX.Y.Z" +
        "\nResolve the SHA and the exact release from the same tag lookup. The comment" +
        "\nnames the release the SHA came from, for a reviewer and for the dependency sweep." +
        "\n\nA local `./…` action or workflow is refused in such a job as well: this guard" +
        "\ndoes not read what it runs. Inline its steps, or extend the guard to follow it.",
    );
    return 1;
  }
  console.log(
    `verify:action-pins — OK (${jobs} credentialed job(s) across ${files.length} workflows, every action SHA-pinned)`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main());
