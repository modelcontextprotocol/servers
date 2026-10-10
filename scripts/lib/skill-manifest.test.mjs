// Table-driven tests for the `.claude/skills` frontmatter contract (inspector#2163),
// one case per rule the parsers encode. The guard that reads them
// (`verify-skills.mjs`) walks the real skills directory, so a rule it enforces
// is only observable there when a skill happens to violate it — which, by
// construction, none does once the guard is green.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitFrontmatter,
  parseSkill,
  isChainCase,
  MIN_CHAIN_LENGTH,
  MIN_POSITIVE_CASES,
  validateEvalCases,
  listingCost,
  parseClaudeVersion,
  PINNED_CLI_VERSION,
  isPinnedVersion,
  formatClaudeVersion,
} from "./skill-manifest.mjs";

const fm = (body) => `---\n${body}\n---\n\n# Body\n`;

test("splitFrontmatter requires the fence on the very first line", () => {
  // This is the whole failure class: anything before the fence and Claude Code
  // treats the WHOLE file, `---` markers included, as body content.
  for (const text of [
    "\n---\nname: x\n---\n",
    "﻿---\nname: x\n---\n",
    "# Title\n---\nname: x\n---\n",
  ]) {
    assert.match(splitFrontmatter(text).error ?? "", /first line/);
  }
  assert.equal(splitFrontmatter(fm("name: x")).error, undefined);
});

test("splitFrontmatter requires the closing fence to be a whole line", () => {
  // `---oops` is not a terminator. Accepting it would silently truncate the
  // frontmatter to whatever preceded it and report the file as valid.
  assert.match(
    splitFrontmatter("---\nname: x\n---oops\nbody\n").error ?? "",
    /never closed/,
  );
  // Trailing whitespace on the fence is still a fence, and so is EOF.
  assert.equal(
    splitFrontmatter("---\nname: x\n---  \nbody\n").frontmatter,
    "name: x",
  );
  assert.equal(splitFrontmatter("---\nname: x\n---").frontmatter, "name: x");
  assert.equal(
    splitFrontmatter("---\nname: x\n---\r\nbody").frontmatter,
    "name: x",
  );
});

test("splitFrontmatter reports an unterminated block", () => {
  assert.match(splitFrontmatter("---\nname: x\n").error ?? "", /never closed/);
});

test("parseSkill accepts a well-formed skill", () => {
  const r = parseSkill(
    "local-dev",
    fm(
      "name: local-dev\ndescription: Does a thing.\ndisable-model-invocation: false",
    ),
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.modelInvoked, true);
  assert.equal(r.userInvocable, true);
});

test("parseSkill rejects frontmatter that is not valid YAML", () => {
  // An unquoted colon in a description is enough, and this is exactly what
  // silently strips the description Claude matches against.
  const r = parseSkill(
    "x",
    fm(
      "name: x\ndescription: Use this: always\ndisable-model-invocation: true",
    ),
  );
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /not valid YAML/);
});

test("parseSkill requires name to match the directory, kebab-case", () => {
  assert.match(
    parseSkill(
      "board-ops",
      fm("name: boardOps\ndescription: d\ndisable-model-invocation: true"),
    ).errors.join(),
    /does not match its directory/,
  );
  assert.match(
    parseSkill(
      "Board_Ops",
      fm("name: Board_Ops\ndescription: d\ndisable-model-invocation: true"),
    ).errors.join(),
    /kebab-case/,
  );
});

test("parseSkill requires a non-empty description", () => {
  for (const d of ["", "   "]) {
    assert.match(
      parseSkill(
        "x",
        fm(`name: x\ndescription: "${d}"\ndisable-model-invocation: true`),
      ).errors.join(),
      /description. is required/,
    );
  }
});

test("parseSkill caps the description at the listing-entry limit", () => {
  const long = "a".repeat(1537);
  assert.match(
    parseSkill(
      "x",
      fm(`name: x\ndescription: ${long}\ndisable-model-invocation: true`),
    ).errors.join(),
    /caps a listing entry/,
  );
});

test("parseSkill requires the invocation mode to be declared", () => {
  assert.match(
    parseSkill("x", fm("name: x\ndescription: d")).errors.join(),
    /must be declared explicitly/,
  );
  assert.match(
    parseSkill(
      "x",
      fm("name: x\ndescription: d\ndisable-model-invocation: yes-please"),
    ).errors.join(),
    /must be a boolean/,
  );
});

test("parseSkill rejects a skill nothing can reach", () => {
  const r = parseSkill(
    "x",
    fm(
      "name: x\ndescription: d\ndisable-model-invocation: true\nuser-invocable: false",
    ),
  );
  assert.match(r.errors.join(), /unreachable/);
});

test("parseSkill validates the paths list", () => {
  assert.match(
    parseSkill(
      "x",
      fm(
        "name: x\ndescription: d\ndisable-model-invocation: false\npaths: '**/*.ts'",
      ),
    ).errors.join(),
    /list of glob strings/,
  );
  assert.deepEqual(
    parseSkill(
      "x",
      fm(
        "name: x\ndescription: d\ndisable-model-invocation: false\npaths:\n  - '**/*.ts'",
      ),
    ).paths,
    ["**/*.ts"],
  );
});

test("listingCost counts only the skills that occupy the listing", () => {
  const skills = [
    { name: "aa", description: "bbb", modelInvoked: true },
    { name: "cccc", description: "ddddd", modelInvoked: false },
  ];
  assert.equal(listingCost(skills), 5);
});

test("validateEvalCases requires a positive and a negative", () => {
  const positives = (n, expect = "testing") =>
    Array.from({ length: n }, (_, i) => ({ prompt: `p${i}`, expect }));

  assert.deepEqual(
    validateEvalCases("testing", [
      ...positives(MIN_POSITIVE_CASES),
      { prompt: "b", expect: null },
    ]),
    [],
  );
  assert.match(
    validateEvalCases("testing", positives(MIN_POSITIVE_CASES)).join(),
    /no negative case/,
  );
  assert.match(
    validateEvalCases("testing", [{ prompt: "a", expect: null }]).join(),
    /no positive case/,
  );
});

test("validateEvalCases rejects malformed cases", () => {
  assert.match(validateEvalCases("x", []).join(), /non-empty array/);
  assert.match(
    validateEvalCases("x", [{ expect: null }]).join(),
    /prompt.*non-empty string/,
  );
  assert.match(
    validateEvalCases("x", [{ prompt: "a", expect: 7 }]).join(),
    /needs .expect./,
  );
  assert.match(
    validateEvalCases("x", [{ prompt: "a" }]).join(),
    /needs .expect. .* or .chain./,
  );
});

test("a hand-off case names an ordered chain ending in this skill", () => {
  const base = [
    ...Array.from({ length: MIN_POSITIVE_CASES }, (_, i) => ({
      prompt: `p${i}`,
      expect: "test-servers",
    })),
    { prompt: "n", expect: null },
  ];
  const withChain = (chain) => [...base, { prompt: "c", chain }];
  const known = new Set(["testing", "test-servers", "pr-flow"]);

  assert.deepEqual(
    validateEvalCases(
      "test-servers",
      withChain(["testing", "test-servers"]),
      known,
    ),
    [],
  );
  // The case belongs to the skill that must be REACHED, so a chain anchored on
  // its first link would file a `test-servers` measurement under `testing` and
  // leave a `test-servers` description edit unmeasured by its own file.
  assert.match(
    validateEvalCases(
      "test-servers",
      withChain(["test-servers", "testing"]),
      known,
    ).join(),
    /ends with .testing., but this file measures .* .test-servers./,
  );
  assert.match(
    validateEvalCases(
      "test-servers",
      withChain(["test-servers"]),
      known,
    ).join(),
    new RegExp(`at least ${MIN_CHAIN_LENGTH} skill names`),
  );
  assert.match(
    validateEvalCases(
      "test-servers",
      withChain(["testing", "testing", "test-servers"]),
      known,
    ).join(),
    /repeats a skill name/,
  );
  assert.match(
    validateEvalCases(
      "test-servers",
      withChain(["nope", "test-servers"]),
      known,
    ).join(),
    /.nope., which is not a model-invoked skill/,
  );
  assert.match(
    validateEvalCases(
      "test-servers",
      withChain(["", "test-servers"]),
      known,
    ).join(),
    /non-empty string/,
  );
  // Without the known set the shape is still checked; only the link names go
  // unverified, so a caller that has not parsed the directory can still run.
  assert.deepEqual(
    validateEvalCases("test-servers", withChain(["nope", "test-servers"])),
    [],
  );
});

test("a hand-off case satisfies neither floor and never doubles as a first move", () => {
  // A hand-off is a second-hop load over many turns and is scored in its own
  // column. Letting one stand in for a first-move positive would let a skill
  // ship with no measurement of the way users actually reach it.
  const chained = Array.from({ length: MIN_POSITIVE_CASES + 1 }, (_, i) => ({
    prompt: `c${i}`,
    chain: ["testing", "test-servers"],
  }));
  const errors = validateEvalCases("test-servers", chained).join(" ");
  assert.match(errors, /no positive case/);
  assert.match(errors, /no negative case/);
});

test("a case carrying both shapes is a typo, not a half-scored measurement", () => {
  assert.match(
    validateEvalCases("test-servers", [
      {
        prompt: "c",
        expect: "test-servers",
        chain: ["testing", "test-servers"],
      },
    ]).join(),
    /carries both .expect. and .chain./,
  );
});

test("isChainCase tells the two shapes apart", () => {
  assert.equal(isChainCase({ chain: ["a", "b"] }), true);
  assert.equal(isChainCase({ expect: "a" }), false);
  assert.equal(isChainCase({ expect: null }), false);
  assert.equal(isChainCase(null), false);
  assert.equal(isChainCase("chain"), false);
});

test("parseClaudeVersion reads the CLI's version banner", () => {
  assert.deepEqual(parseClaudeVersion("2.1.250 (Claude Code)"), {
    parts: [2, 1, 250],
    prerelease: null,
  });
  assert.deepEqual(parseClaudeVersion("claude 10.0.4\n"), {
    parts: [10, 0, 4],
    prerelease: null,
  });
  assert.equal(parseClaudeVersion("no version here"), null);
});

test("parseClaudeVersion keeps a prerelease suffix rather than dropping it", () => {
  // Dropping it made `2.1.250-beta.1` compare EQUAL to the stable pin — a
  // different validator schema running while the log claimed an exact match.
  assert.deepEqual(parseClaudeVersion("2.1.250-beta.1 (Claude Code)"), {
    parts: [2, 1, 250],
    prerelease: "beta.1",
  });
  assert.equal(
    formatClaudeVersion(parseClaudeVersion("2.1.250-beta.1")),
    "2.1.250-beta.1",
  );
  assert.equal(formatClaudeVersion(null), "(unreadable version)");
});

test("isPinnedVersion accepts only the exact stable pin", () => {
  const pin = PINNED_CLI_VERSION;
  assert.equal(isPinnedVersion(parseClaudeVersion(pin), pin), true);
  // Build metadata is ignored for precedence by SemVer, so it still matches.
  assert.equal(
    isPinnedVersion(parseClaudeVersion(`${pin}+build.7`), pin),
    true,
  );
  // A prerelease of the same triple is NOT the pin.
  assert.equal(
    isPinnedVersion(parseClaudeVersion(`${pin}-beta.1`), pin),
    false,
  );
  assert.equal(isPinnedVersion(parseClaudeVersion("2.1.249"), pin), false);
  assert.equal(isPinnedVersion(parseClaudeVersion("99.0.0"), pin), false);
  assert.equal(isPinnedVersion(null, pin), false);
});

test("the listing-entry cap covers description AND when_to_use together", () => {
  // The cap is over the combined entry, so checking `description` alone would
  // pass an over-cap listing entry.
  const under = fm(
    `name: x\ndescription: ${"a".repeat(1000)}\nwhen_to_use: ${"b".repeat(536)}\ndisable-model-invocation: true`,
  );
  assert.deepEqual(parseSkill("x", under).errors, []);

  const over = fm(
    `name: x\ndescription: ${"a".repeat(1000)}\nwhen_to_use: ${"b".repeat(537)}\ndisable-model-invocation: true`,
  );
  assert.match(parseSkill("x", over).errors.join(), /caps a listing entry/);

  assert.match(
    parseSkill(
      "x",
      fm(
        "name: x\ndescription: d\nwhen_to_use: 7\ndisable-model-invocation: true",
      ),
    ).errors.join(),
    /when_to_use. must be a string/,
  );
});

test("listingCost counts when_to_use too", () => {
  assert.equal(
    listingCost([
      { name: "aa", description: "bbb", whenToUse: "cc", modelInvoked: true },
    ]),
    7,
  );
});

test("a CRLF manifest is valid — the fence is still the first line", () => {
  // A Windows checkout with `core.autocrlf` produces these. Rejecting one would
  // fail `npm run validate` on a manifest the authoritative validator accepts,
  // and would fail it *before* that validator ever ran.
  const crlf =
    "---\r\nname: x\r\ndescription: d\r\ndisable-model-invocation: true\r\n---\r\n\r\nBody\r\n";
  assert.equal(
    splitFrontmatter(crlf).frontmatter,
    "name: x\r\ndescription: d\r\ndisable-model-invocation: true",
  );
  assert.deepEqual(parseSkill("x", crlf).errors, []);

  // Mixed endings are still fine, and so is a CRLF file with no trailing body.
  assert.deepEqual(
    parseSkill(
      "x",
      "---\r\nname: x\ndescription: d\r\ndisable-model-invocation: true\n---\r\n",
    ).errors,
    [],
  );
  assert.deepEqual(
    parseSkill(
      "x",
      "---\r\nname: x\r\ndescription: d\r\ndisable-model-invocation: true\r\n---",
    ).errors,
    [],
  );
});

test("CRLF does not weaken the first-line rule", () => {
  // The point of the opening check is that anything before the fence turns the
  // whole file into body — accepting CRLF must not start accepting those.
  for (const text of [
    "\r\n---\r\nname: x\r\n---\r\n",
    "﻿---\r\nname: x\r\n---\r\n",
    "# Title\r\n---\r\nname: x\r\n---\r\n",
    "--- \r\nname: x\r\n---\r\n".replace("--- ", "---x"),
  ]) {
    assert.match(splitFrontmatter(text).error ?? "", /first line|never closed/);
  }
  // And `---oops` is still not a terminator with CRLF endings either.
  assert.match(
    splitFrontmatter("---\r\nname: x\r\n---oops\r\nbody\r\n").error ?? "",
    /never closed/,
  );
});

test("an eval file may only expect its own skill", () => {
  // A foreign name passes whenever that OTHER skill fires, so the file reports
  // a measurement of something it does not describe — and it satisfies the
  // positive-case requirement while doing it, hiding the absence of a real one.
  assert.match(
    validateEvalCases("testing", [
      { prompt: "a", expect: "local-dev" },
      ...Array.from({ length: MIN_POSITIVE_CASES }, (_, i) => ({
        prompt: `p${i}`,
        expect: "testing",
      })),
      { prompt: "c", expect: null },
    ]).join(),
    /expects `local-dev`, but this file only measures `testing`/,
  );
  // The masking case: a foreign positive is no longer enough on its own.
  const masked = validateEvalCases("testing", [
    { prompt: "a", expect: "local-dev" },
    { prompt: "b", expect: null },
  ]);
  assert.match(masked.join(), /only measures/);
  assert.match(masked.join(), /no positive case/);
  // Null and own-name cases are unaffected.
  assert.deepEqual(
    validateEvalCases("testing", [
      ...Array.from({ length: MIN_POSITIVE_CASES }, (_, i) => ({
        prompt: `p${i}`,
        expect: "testing",
      })),
      { prompt: "b", expect: null },
    ]),
    [],
  );
});

test("an unquoted `#` truncates a description, and that is an error", () => {
  // The dangerous part is that YAML leaves a *non-empty* string behind, so the
  // "description is required and non-empty" check passes and the skill keeps
  // auto-firing — just with its most distinctive words missing from the
  // listing. `board-ops` shipped this way, losing both board numbers.
  const withHash = [
    "---",
    "name: board-ops",
    "description: Recipes. Covers board #28 (v2) and board #11 (v1).",
    "disable-model-invocation: false",
    "---",
    "body",
  ].join("\n");
  const parsed = parseSkill("board-ops", withHash);
  assert.equal(parsed.description, "Recipes. Covers board");
  assert.match(parsed.errors.join(" "), /truncated by an unquoted `#`/);

  // Quoting is the fix, and it must come back clean.
  const quoted = withHash.replace(
    /^description: (.*)$/m,
    (_m, d) => `description: "${d}"`,
  );
  const ok = parseSkill("board-ops", quoted);
  assert.deepEqual(ok.errors, []);
  assert.equal(
    ok.description,
    "Recipes. Covers board #28 (v2) and board #11 (v1).",
  );
});

test("a `#` inside a quoted description is not treated as truncation", () => {
  // Guard against the check firing on every legitimately quoted description.
  const quoted = [
    "---",
    "name: alpha",
    'description: "counts # and : safely"',
    "disable-model-invocation: false",
    "---",
    "body",
  ].join("\n");
  assert.deepEqual(parseSkill("alpha", quoted).errors, []);
});

test("a model-invoked skill needs at least MIN_POSITIVE_CASES positives", () => {
  // `positives === 0` alone let a skill regress to a single prompt and still
  // pass the gate. The floor is about breadth, not variance: each prompt is
  // scored on its own `passes / RUNS`, so extra prompts steady nothing — they
  // cover more of the ways someone might reach the skill, so a description that
  // fires on one narrow phrasing cannot pass on that single case alone.
  const withPositives = (n) => [
    ...Array.from({ length: n }, (_, i) => ({
      prompt: `p${i}`,
      expect: "alpha",
    })),
    { prompt: "n", expect: null },
  ];

  assert.match(
    validateEvalCases("alpha", withPositives(1)).join(" "),
    /only 1 distinct positive prompt\(s\)/,
  );
  assert.match(
    validateEvalCases("alpha", withPositives(MIN_POSITIVE_CASES - 1)).join(" "),
    /needs at least 5 to cover the range/,
  );
  assert.deepEqual(
    validateEvalCases("alpha", withPositives(MIN_POSITIVE_CASES)),
    [],
  );

  // Zero still reports the clearer "no positive case" message rather than the
  // count one, so the common mistake keeps its specific diagnosis.
  assert.match(
    validateEvalCases("alpha", [{ prompt: "n", expect: null }]).join(" "),
    /no positive case expects/,
  );
});

test("the truncation guard covers `when_to_use`, not just `description`", () => {
  // The guard loops over both fields, so a regression that dropped `when_to_use`
  // from that list would be invisible to the description-only tests above.
  const withHash = [
    "---",
    "name: alpha",
    'description: "safe because quoted"',
    "when_to_use: Use when filing against board #28 or board #11.",
    "disable-model-invocation: false",
    "---",
    "body",
  ].join("\n");
  const parsed = parseSkill("alpha", withHash);
  assert.equal(parsed.whenToUse, "Use when filing against board");
  assert.match(parsed.errors.join(" "), /`when_to_use` is truncated/);
  // The description is quoted, so it must not be implicated.
  assert.doesNotMatch(parsed.errors.join(" "), /`description` is truncated/);

  const quoted = withHash.replace(
    /^when_to_use: (.*)$/m,
    (_m, w) => `when_to_use: "${w}"`,
  );
  const ok = parseSkill("alpha", quoted);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.whenToUse, "Use when filing against board #28 or board #11.");
});

test("the truncation guard spans a multiline plain scalar", () => {
  // A plain scalar continues onto more-indented lines, so a first-line-only
  // comparison sees `Covers boards` on both sides and reports no loss — passing
  // the exact truncation this guard exists to reject.
  const multiline = [
    "---",
    "name: alpha",
    "description: Covers boards",
    "  #28 and #11 and the hazard.",
    "disable-model-invocation: false",
    "---",
    "body",
  ].join("\n");
  const parsed = parseSkill("alpha", multiline);
  assert.equal(parsed.description, "Covers boards");
  assert.match(parsed.errors.join(" "), /`description` is truncated/);

  // A multiline plain scalar with no `#` folds to one line and must stay clean,
  // so the fix cannot be "reject anything multiline".
  const folded = [
    "---",
    "name: alpha",
    "description: Covers boards",
    "  and the option-deletion hazard.",
    "disable-model-invocation: false",
    "---",
    "body",
  ].join("\n");
  const ok = parseSkill("alpha", folded);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.description, "Covers boards and the option-deletion hazard.");
});

test("the truncation guard ignores anchors and tags, which are not `#`", () => {
  // YAML strips presentation syntax from the parsed value, so `&anchor` and
  // `!!tag` make the raw scalar legitimately longer than what it parses to.
  // A bare length comparison called those truncation and blamed a `#` that was
  // nowhere in the text.
  const mk = (value) =>
    [
      "---",
      "name: alpha",
      `description: ${value}`,
      "disable-model-invocation: false",
      "---",
      "body",
    ].join("\n");

  const anchored = parseSkill("alpha", mk("&copy Some valid text."));
  assert.deepEqual(anchored.errors, []);
  assert.equal(anchored.description, "Some valid text.");

  const tagged = parseSkill("alpha", mk("!!str Some tagged text."));
  assert.deepEqual(tagged.errors, []);

  // The real case must still fail, so the gate is not simply disarmed.
  assert.match(
    parseSkill("alpha", mk("Covers board #28 (v2).")).errors.join(" "),
    /`description` is truncated/,
  );
});

test("a quoted scalar stays safe behind a tag or an anchor", () => {
  // Properties may precede the value, in either order. Testing the first
  // character alone read these as unquoted and then rejected the `#` that the
  // quotes make harmless.
  const mk = (value) =>
    [
      "---",
      "name: alpha",
      `description: ${value}`,
      "disable-model-invocation: false",
      "---",
      "body",
    ].join("\n");

  for (const value of [
    '&copy "Counts # safely"',
    '!!str "Counts # safely"',
    '!!str &a "Counts # safely"',
  ]) {
    const parsed = parseSkill("alpha", mk(value));
    assert.deepEqual(parsed.errors, [], `rejected: ${value}`);
    assert.equal(parsed.description, "Counts # safely");
  }
});

test("the positive floor counts distinct prompts, not entries", () => {
  // The floor exists for breadth, so repeating one prompt five times clears an
  // entry count while exercising exactly the single trigger it looks past.
  const duplicated = [
    ...Array.from({ length: MIN_POSITIVE_CASES }, () => ({
      prompt: "the same prompt",
      expect: "alpha",
    })),
    { prompt: "n", expect: null },
  ];
  const errors = validateEvalCases("alpha", duplicated).join(" ");
  assert.match(
    errors,
    /only 1 distinct positive prompt\(s\) across 5 case\(s\)/,
  );

  // Whitespace and casing are not a new situation either.
  const nearDuplicates = [
    { prompt: "How do I do the thing?", expect: "alpha" },
    { prompt: "how do i   do the thing?", expect: "alpha" },
    { prompt: "How do I do the thing?  ", expect: "alpha" },
    { prompt: "b", expect: "alpha" },
    { prompt: "c", expect: "alpha" },
    { prompt: "n", expect: null },
  ];
  assert.match(
    validateEvalCases("alpha", nearDuplicates).join(" "),
    /only 3 distinct positive prompt\(s\)/,
  );

  // Five genuinely different prompts pass.
  assert.deepEqual(
    validateEvalCases("alpha", [
      ...Array.from({ length: MIN_POSITIVE_CASES }, (_, i) => ({
        prompt: `p${i}`,
        expect: "alpha",
      })),
      { prompt: "n", expect: null },
    ]),
    [],
  );
});

test("a quoted or block scalar may carry a trailing comment", () => {
  // `yaml` attaches a legitimate trailing comment to these nodes too, so keying
  // on `.comment` alone rejected valid frontmatter and told the author to quote
  // a value that was already quoted. Only a PLAIN scalar can lose text to one.
  for (const value of ['"Complete value" # note', "'Complete value' # note"]) {
    const parsed = parseSkill(
      "alpha",
      [
        "---",
        "name: alpha",
        `description: ${value}`,
        "disable-model-invocation: false",
        "---",
        "body",
      ].join("\n"),
    );
    assert.deepEqual(parsed.errors, [], value);
    assert.equal(parsed.description, "Complete value");
  }

  const block = parseSkill(
    "alpha",
    [
      "---",
      "name: alpha",
      "description: | # note",
      "  Complete value",
      "disable-model-invocation: false",
      "---",
      "body",
    ].join("\n"),
  );
  assert.deepEqual(block.errors, []);
});

test("the truncation guard covers noncanonical key forms", () => {
  // `"description":` and `description :` both populate the mapping, so a guard
  // that located the field by matching a `^description:` LINE skipped them
  // entirely and left `verify:skills` green on a truncated listing (Copilot).
  const mk = (key) =>
    [
      "---",
      "name: alpha",
      `${key} Covers board #28 and the hazard.`,
      "disable-model-invocation: false",
      "---",
      "body",
    ].join("\n");

  for (const key of ['"description":', "'description':", "description :"]) {
    const parsed = parseSkill("alpha", mk(key));
    assert.equal(parsed.description, "Covers board", `key form: ${key}`);
    assert.match(
      parsed.errors.join(" "),
      /`description` is truncated/,
      `key form: ${key}`,
    );
  }
});

test("the truncation guard spans a blank line inside a plain scalar", () => {
  // A plain scalar continues across empty lines too, so a scan that stopped at
  // the first blank one inspected only the opening paragraph and reported no
  // loss (Copilot).
  const parsed = parseSkill(
    "alpha",
    [
      "---",
      "name: alpha",
      "description: Covers boards",
      "",
      "  #28 and #11 and the hazard.",
      "disable-model-invocation: false",
      "---",
      "body",
    ].join("\n"),
  );
  assert.equal(parsed.description, "Covers boards");
  assert.match(parsed.errors.join(" "), /`description` is truncated/);
});

test("a standalone comment line is not read as truncation", () => {
  // The guard keys on the comment the parser hung on the SCALAR. A comment on
  // its own line belongs to the document, not to the description, and flagging
  // it would fail a frontmatter that loses nothing.
  for (const frontmatter of [
    ["# leading", "name: alpha", "description: Covers boards"],
    ["name: alpha", "description: Covers boards", "# standalone"],
    ["name: alpha", "description: Issue#28 needs no quoting"],
  ]) {
    const parsed = parseSkill(
      "alpha",
      [
        "---",
        ...frontmatter,
        "disable-model-invocation: false",
        "---",
        "body",
      ].join("\n"),
    );
    assert.deepEqual(parsed.errors, [], frontmatter.join(" | "));
  }
});
