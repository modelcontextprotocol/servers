// Pure parsers for the `.claude/skills/**/SKILL.md` contract, extracted so
// `verify-skills.mjs` can be unit-tested without a filesystem (inspector#2163).
//
// Ported from the MCP Inspector (#4863); `inspector#N` references are that
// repo's issues and PRs, a bare `#N` is this repo's.
//
// The failure this guards is silent by construction: Claude Code reads a
// SKILL.md's frontmatter only when the opening `---` is the file's FIRST line
// and the YAML between the fences parses. Otherwise the body loads with EMPTY
// metadata — `/skill-name` still works, so a manual spot check passes, but
// there is no `description` left for the model to match against and the skill
// never auto-fires again. A stray unquoted colon in a description is enough.
//
// So every check here is deny-by-default: a file we cannot read the way Claude
// Code reads it is an error, not a skip.

import { parseDocument } from "yaml";

/**
 * Per-entry cap Claude Code applies to a skill listing entry. It covers
 * `description` **and** `when_to_use` together, so checking `description` alone
 * would pass an over-cap entry (Copilot).
 */
export const DESCRIPTION_CAP = 1536;

/**
 * Character budget for the skill LISTING — the sum of name + description over
 * the skills that occupy it. Only model-invoked skills do: a skill with
 * `disable-model-invocation: true` is reachable solely by name, so its
 * description never enters context.
 *
 * The listing is truncated when it overflows the model's budget, and the
 * entries dropped first are the ones invoked least — i.e. exactly the
 * model-invoked skills that must fire on their own. Recording the number here
 * is what makes a regression visible when a skill is added later.
 */
export const LISTING_BUDGET = 4000;

const FRONTMATTER_FENCE = "---";

/**
 * Split a SKILL.md into its raw frontmatter and body the way Claude Code does.
 * Returns `{ error }` rather than throwing, so the caller can report every
 * offending file in one pass instead of dying on the first.
 *
 * @param {string} text Full file contents.
 * @returns {{ frontmatter?: string, body?: string, error?: string }}
 */
export function splitFrontmatter(text) {
  // A BOM or a leading blank line means the fence is not the first line, and
  // Claude Code then treats the WHOLE file — `---` markers included — as body.
  //
  // CRLF is accepted on both fences. A Windows checkout with `core.autocrlf`
  // has `---\r\n` and the fence is still the first line, so rejecting it would
  // fail `npm run validate` on a valid manifest — before the authoritative
  // validator, which accepts platform line endings, ever ran (Copilot).
  const open = /^---[ \t]*\r?\n/.exec(text);
  if (open === null) {
    return {
      error:
        "frontmatter must open with `---` on the very first line (no BOM, no leading blank line)",
    };
  }
  const rest = text.slice(open[0].length);
  // The closing fence must occupy the WHOLE line. Matching a mere prefix would
  // accept `---oops` as a terminator, silently truncating the frontmatter to
  // whatever preceded it — the very failure this function exists to catch.
  const close = /\r?\n---[ \t]*(\r?\n|$)/.exec(rest);
  if (close === null)
    return { error: "frontmatter is never closed by a `---` line" };
  return {
    frontmatter: rest.slice(0, close.index),
    body: rest.slice(close.index + close[0].length),
  };
}

/**
 * Parse and validate one skill's frontmatter.
 *
 * @param {string} dirName Directory the SKILL.md lives in — the skill's identity.
 * @param {string} text Full file contents.
 * @returns {{ name?: string, description?: string, modelInvoked?: boolean,
 *            userInvocable?: boolean, paths?: string[], errors: string[] }}
 */
export function parseSkill(dirName, text) {
  const errors = [];
  const { frontmatter, error } = splitFrontmatter(text);
  if (error) return { errors: [error] };

  let doc;
  let meta;
  try {
    // `parseDocument` rather than `parse`: the truncation guard below needs the
    // scalar NODES, not just their values, and parsing once keeps the two views
    // of the frontmatter from ever disagreeing.
    doc = parseDocument(frontmatter);
    if (doc.errors.length > 0) throw new Error(doc.errors[0].message);
    meta = doc.toJS();
  } catch (e) {
    // The whole point of the guard: this is what strips the description.
    return {
      errors: [`frontmatter is not valid YAML — ${e.message.split("\n")[0]}`],
    };
  }
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
    return { errors: ["frontmatter must parse to a mapping"] };
  }

  const name = meta.name;
  if (typeof name !== "string" || name.length === 0) {
    errors.push("`name` is required and must be a string");
  } else if (name !== dirName) {
    errors.push(
      `\`name: ${name}\` does not match its directory \`${dirName}\``,
    );
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    errors.push(`\`name: ${name}\` must be kebab-case`);
  }

  const description = meta.description;
  if (typeof description !== "string" || description.trim().length === 0) {
    errors.push("`description` is required and must be a non-empty string");
  }

  const whenToUse = meta["when_to_use"];
  if ("when_to_use" in meta && typeof whenToUse !== "string") {
    errors.push("`when_to_use` must be a string");
  }
  const entryLength =
    (typeof description === "string" ? description.length : 0) +
    (typeof whenToUse === "string" ? whenToUse.length : 0);
  if (entryLength > DESCRIPTION_CAP) {
    errors.push(
      `\`description\` + \`when_to_use\` is ${entryLength} chars; Claude Code caps a listing entry at ${DESCRIPTION_CAP}`,
    );
  }

  // Every skill states its invocation mode rather than inheriting a default,
  // so the eval surface is knowable by reading the files.
  if (!("disable-model-invocation" in meta)) {
    errors.push(
      "`disable-model-invocation` must be declared explicitly (true = invoked by name only, false = the model may fire it)",
    );
  }
  const dmi = meta["disable-model-invocation"];
  if ("disable-model-invocation" in meta && typeof dmi !== "boolean") {
    errors.push("`disable-model-invocation` must be a boolean");
  }
  const modelInvoked = dmi === false;

  if ("user-invocable" in meta && typeof meta["user-invocable"] !== "boolean") {
    errors.push("`user-invocable` must be a boolean");
  }
  if ("paths" in meta) {
    if (
      !Array.isArray(meta.paths) ||
      meta.paths.some((p) => typeof p !== "string")
    ) {
      errors.push("`paths` must be a list of glob strings");
    }
  }
  // An unquoted `#` is a YAML comment, so a description containing one is
  // truncated at that point — silently, and *not* to empty, which is why the
  // "malformed YAML" checks sail past it: what survives still parses as a
  // non-empty string. `board-ops` shipped for a while with its two board numbers
  // and the option-deletion hazard cut off this way.
  //
  // Ask the PARSER what it discarded rather than re-deriving it from the raw
  // text. `yaml` hangs the comment it stripped on the scalar node itself, so a
  // plain scalar with a `.comment` is exactly the truncation case, and a quoted
  // or block scalar never has one. Three rounds of regex here each fixed one
  // shape and missed the next — a tag or anchor before the value, a scalar
  // continued onto indented lines, then a continuation across a blank line, and
  // key forms (`"description":`, `description :`) that populate the mapping
  // while matching no `^description:` line at all (Copilot). The node carries
  // all of them for free, so none of that scanning survives.
  for (const field of ["description", "when_to_use"]) {
    const node = doc.get(field, true);
    // `typeof node.value !== "string"` also covers the non-scalar cases: a map
    // or list node has no `.value`, and its own checks above already report it.
    if (!node || typeof node.value !== "string") continue;
    // Only on a PLAIN scalar is a comment evidence of loss. A quoted or block
    // scalar can carry a perfectly legitimate trailing one — `description:
    // "Complete value" # note` keeps its whole value — and flagging that told
    // the author to quote a value they had already quoted (Copilot). The regex
    // this replaced tested the same thing by reading the first character; the
    // node states it outright.
    if (node.type !== "PLAIN") continue;
    const dropped = node.comment;
    if (typeof dropped !== "string") continue;
    errors.push(
      "`" +
        field +
        "` is truncated by an unquoted `#` — YAML kept `" +
        node.value +
        "` and dropped `#" +
        dropped +
        "`; quote the value",
    );
  }

  // A skill nothing can reach is dead weight that still costs a directory.
  if (!modelInvoked && meta["user-invocable"] === false) {
    errors.push(
      "skill is unreachable: `disable-model-invocation: true` with `user-invocable: false`",
    );
  }

  return {
    name: typeof name === "string" ? name : undefined,
    description: typeof description === "string" ? description : undefined,
    whenToUse: typeof whenToUse === "string" ? whenToUse : undefined,
    modelInvoked,
    userInvocable: meta["user-invocable"] !== false,
    paths: Array.isArray(meta.paths) ? meta.paths : undefined,
    errors,
  };
}

/**
 * Cost of the skill listing Claude Code loads into context, counting only the
 * skills that appear in it.
 *
 * The number is this repo's CONTRIBUTION to the listing, not the whole listing:
 * bundled skills and a contributor's own `~/.claude/skills` share the same
 * budget, and none of those is visible from here (Copilot). Keeping the repo's
 * share well under the cap is what leaves room for them.
 *
 * @param {Array<{ name?: string, description?: string, whenToUse?: string, modelInvoked?: boolean }>} skills
 */
export function listingCost(skills) {
  return skills
    .filter((s) => s.modelInvoked)
    .reduce(
      (n, s) =>
        n +
        (s.name?.length ?? 0) +
        (s.description?.length ?? 0) +
        (s.whenToUse?.length ?? 0),
      0,
    );
}

/**
 * The number of positive cases a model-invoked skill's eval file must carry.
 *
 * This is a **breadth** floor, not a statistical one. The evaluator scores each
 * prompt independently — `passes / RUNS` for that prompt alone — so adding
 * prompts does not steady any other prompt's rate; `RUNS` is the only knob that
 * does. What five prompts buy is coverage of five different ways someone might
 * arrive at the skill, which is what exposes a description that fires on one
 * narrow phrasing and nothing else (Copilot).
 */
export const MIN_POSITIVE_CASES = 5;

/**
 * The fewest links a chained case may name.
 *
 * A one-link "chain" is a first-move case written the long way — it asserts
 * nothing about a hand-off, and accepting it would let a skill satisfy the
 * hand-off column without ever measuring one.
 */
export const MIN_CHAIN_LENGTH = 2;

/**
 * Whether a case measures a hand-off (`chain`) rather than a first move
 * (`expect`).
 *
 * The two are scored against different turn budgets and reported in different
 * columns, so every consumer has to tell them apart; doing it by field
 * presence in one place keeps that decision from drifting between the
 * validator and the runner.
 *
 * @param {unknown} c
 * @returns {boolean}
 */
export function isChainCase(c) {
  return c !== null && typeof c === "object" && Array.isArray(c.chain);
}

/**
 * Validate an `evals/evals.json` payload for a model-invoked skill.
 *
 * A skill that fires on everything is a context regression, not a win, and it
 * is the failure nobody notices by hand — so negatives are required, not
 * optional.
 *
 * A case is one of two shapes, and it must be exactly one: a **first-move**
 * case names `expect` (the skill the model should reach with its first tool
 * call, or `null`), and a **hand-off** case names `chain` — the ordered skills
 * a single run should load, ending with this one. Requiring exactly one of the
 * two rather than letting `chain` shadow `expect` means a case that carries
 * both is a typo caught here, not a silently half-scored measurement.
 *
 * A hand-off case counts toward neither the positive floor nor the negative
 * requirement. It measures a different thing (a second-hop load, over many
 * turns) and it is scored in its own column, so letting one stand in for a
 * first-move positive would let a skill ship with no measurement of the way
 * users actually reach it.
 *
 * @param {string} skillName
 * @param {unknown} cases Parsed JSON.
 * @param {Set<string> | null} [known] Every model-invoked skill in the repo.
 *   When supplied, each link of a `chain` is checked against it — a link naming
 *   a skill that does not exist, or one the model cannot invoke, can never fire
 *   and would score the case a permanent 0% that reads as a description
 *   problem. Omitted (null), the link names are left unchecked, so a caller
 *   that has not yet parsed the whole directory can still validate shape.
 * @returns {string[]} errors
 */
export function validateEvalCases(skillName, cases, known = null) {
  if (!Array.isArray(cases) || cases.length === 0) {
    return ["evals.json must be a non-empty array of cases"];
  }
  const errors = [];
  cases.forEach((c, i) => {
    if (c === null || typeof c !== "object" || Array.isArray(c)) {
      errors.push(`case ${i}: must be an object`);
      return;
    }
    if (typeof c.prompt !== "string" || c.prompt.trim() === "") {
      errors.push(`case ${i}: \`prompt\` must be a non-empty string`);
    }
    if ("expect" in c && "chain" in c) {
      errors.push(
        `case ${i}: carries both \`expect\` and \`chain\` — a case is either a first-move case or a hand-off case`,
      );
      return;
    }
    if ("chain" in c) {
      errors.push(...validateChain(skillName, i, c.chain, known));
      return;
    }
    if (
      !("expect" in c) ||
      (c.expect !== null && typeof c.expect !== "string")
    ) {
      errors.push(
        `case ${i}: needs \`expect\` (a skill name, or null for a negative case) or \`chain\``,
      );
    } else if (c.expect !== null && c.expect !== skillName) {
      // A case living in this skill's evals may only expect THIS skill. A
      // foreign name passes the eval whenever that other skill fires, so the
      // file reports a measurement of something it does not describe — and it
      // still satisfies the positive-case requirement, hiding the absence of a
      // real one (Copilot).
      errors.push(
        `case ${i}: expects \`${c.expect}\`, but this file only measures \`${skillName}\``,
      );
    }
  });
  const positiveCases = cases.filter((c) => c && c.expect === skillName);
  const positives = positiveCases.length;
  // The floor exists for breadth, so it has to count *phrasings*, not entries:
  // five copies of one prompt clear an entry count while exercising exactly the
  // one trigger the floor is meant to look past (Copilot). Compare on collapsed,
  // case-folded text so trivial edits do not read as a new situation.
  const distinctPositives = new Set(
    positiveCases.map((c) =>
      String(c.prompt ?? "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
    ),
  ).size;
  const negatives = cases.filter((c) => c && c.expect === null).length;
  if (positives === 0) {
    errors.push(`no positive case expects \`${skillName}\``);
  } else if (distinctPositives < MIN_POSITIVE_CASES) {
    // A non-zero floor is not enough: one prompt measures one phrasing. Since
    // each prompt is scored on its own `passes / RUNS`, extra prompts do not
    // make any single rate steadier — they cover more of the ways someone might
    // reach the skill, so a description that only fires on one narrow shape is
    // visible instead of passing on its single lucky case (Copilot).
    errors.push(
      `only ${distinctPositives} distinct positive prompt(s)${positives === distinctPositives ? "" : ` across ${positives} case(s)`}; a model-invoked skill needs at least ${MIN_POSITIVE_CASES} to cover the range of situations it should fire on`,
    );
  }
  if (negatives === 0) {
    errors.push(
      "no negative case (`expect: null`) — a skill that fires on everything is a regression",
    );
  }
  return errors;
}

/**
 * Validate one hand-off case's `chain`.
 *
 * The last link must be the owning skill, not the first. A hand-off case exists
 * to measure whether **this** skill is reachable at all when nothing about the
 * prompt names it, so the file that has to go red when the hand-off stops
 * working is the one belonging to the skill that stops being reached. Anchoring
 * on the first link instead would file the case under whichever skill happened
 * to start the run, and a `test-servers` description edit would then be
 * measured only inside `testing`.
 *
 * @param {string} skillName
 * @param {number} i Case index, for the message.
 * @param {unknown} chain
 * @param {Set<string> | null} known
 * @returns {string[]}
 */
function validateChain(skillName, i, chain, known) {
  if (!Array.isArray(chain) || chain.length < MIN_CHAIN_LENGTH) {
    return [
      `case ${i}: \`chain\` must be an ordered array of at least ${MIN_CHAIN_LENGTH} skill names`,
    ];
  }
  const errors = [];
  if (chain.some((n) => typeof n !== "string" || n.trim() === "")) {
    errors.push(`case ${i}: every \`chain\` link must be a non-empty string`);
    return errors;
  }
  if (new Set(chain).size !== chain.length) {
    // A repeated link cannot be observed: the run records which skills fired
    // in what order, and a second load of one already recorded is
    // indistinguishable from the first.
    errors.push(`case ${i}: \`chain\` repeats a skill name`);
  }
  if (chain[chain.length - 1] !== skillName) {
    errors.push(
      `case ${i}: \`chain\` ends with \`${chain[chain.length - 1]}\`, but this file measures whether \`${skillName}\` is reached`,
    );
  }
  if (known) {
    for (const link of chain) {
      if (!known.has(link)) {
        errors.push(
          `case ${i}: \`chain\` names \`${link}\`, which is not a model-invoked skill — it can never fire`,
        );
      }
    }
  }
  return errors;
}

/**
 * Claude Code version the authoritative validator is pinned to when it has to
 * be fetched. Pinned rather than @latest: a validator that moves on its own can
 * start failing a PR that changed nothing.
 */
export const PINNED_CLI_VERSION = "2.1.250";

/**
 * Read the version out of `claude --version` output ("2.1.250 (Claude Code)").
 *
 * Returns the release triple **and** whether a prerelease/build suffix was
 * attached, because the two callers want different things: the pin comparison
 * must reject `2.1.250-beta.1` (a different validator schema that would compare
 * equal to the stable pin while the log claimed an exact match — Copilot),
 * while the eval's availability probe only needs *some* usable CLI.
 *
 * @param {string} text
 * @returns {{ parts: number[], prerelease: string | null } | null}
 */
export function parseClaudeVersion(text) {
  const m =
    /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?/.exec(text);
  if (m === null) return null;
  return {
    parts: [Number(m[1]), Number(m[2]), Number(m[3])],
    prerelease: m[4] ?? null,
  };
}

/** A parsed version, formatted the way the CLI reports it. */
export function formatClaudeVersion(version) {
  if (version === null) return "(unreadable version)";
  return (
    version.parts.join(".") +
    (version.prerelease ? `-${version.prerelease}` : "")
  );
}

/**
 * Whether a parsed version IS the pin — same triple and no prerelease.
 *
 * @param {{ parts: number[], prerelease: string | null } | null} version
 * @param {string} pin e.g. `PINNED_CLI_VERSION`.
 */
export function isPinnedVersion(version, pin) {
  if (version === null || version.prerelease !== null) return false;
  const pinned = parseClaudeVersion(pin);
  return pinned !== null && compareVersions(version.parts, pinned.parts) === 0;
}

export function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
